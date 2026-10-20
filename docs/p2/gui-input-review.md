# P2 第三轮：原版二维 GUI、图标与浏览器输入验收

日期：2026-10-20。基于已通过独立审查的 `8095779bd0b65960308d39bacc213b4c58b18a2b`，仅执行用户另行授权的 GUI 技术切片。**完成本机样本验证，交付待审；不是完整 P2、P5/P6 或正式产品规则验收。** 第一人称、中央主视觉、无准星、自由鼠标射线和 B 保持不变。没有安装依赖、启动/安装 Java 客户端、推送或部署。

## 1. 实际交付

代码仍在 `experiments/scene3d/`，精确依赖与锁文件不变。

| 文件/模块 | 本轮职责 | 明确边界 |
| --- | --- | --- |
| `tools/extract-gui-samples.ps1` | 复用同版模型提取器，扩展仓库外 GUI/字体/图标白名单及 SHA-256 | 先校验 P1 客户端 SHA-1；拒绝仓库内输出；没有全量资产拷贝 |
| `tools/local-resources.ts` | 既有 loopback、同源、路径与哈希验证扩展至 font/items | 只服务清单；原始构件、javap、截图不在路由中；build/preview 无该服务 |
| `gui-pack.ts` | 原版 GUI/字体加载、位图字宽扫描、九宫格、两类运行时图标 | 资源缺失即阻断；没有静态字体转换产物或图标 PNG |
| `gui-state.ts` | 有限临时槽位输入候选夹具，永久身份不减 | 不是解锁/合成/炉加工/装备业务；无真实无限目录 |
| `gui-view.ts` / `gui-labels.ts` | Canvas2D 屏幕层、像素缩放、Tooltip、浏览器事件记录与诊断控件 | HTML 文本框明确是焦点探针，不冒充原版搜索框；未决定正式 GUI 全部使用 Canvas |
| `main.ts` | 三维实例→屏幕 GUI 绑定、E/Esc、按键释放和输入门禁、失效 ID 检查 | 相机/领域坐标/正式存档协议未改；实验槽组不写存档 |
| `tests/gui.test.ts` / 既有浏览器检查 | 输入状态、图标路径、资源尺寸、GUI transform 继承；真实 GPU/DOM/输入证据 | 合成事件与 `isTrusted=true` 输入分开记录 |

## 2. 资源、数据及静态证据

唯一原始构件：Java 26.3 `client.jar`，SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`，沿用 P1 已校验文件，未重新下载客户端。新缓存为：

`C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-gui-20261020`

完整条目路径/大小/SHA-256、外部截图路径/哈希、静态检查输出哈希见 [resource-evidence.json](evidence/gui-round3/resource-evidence.json)。共 **71 个白名单条目**：原 38 个模型/材质条目不变，追加 33 个 GUI/字体/物品条目。GUI 加载实际请求 49 个文件（33 个新条目＋16 个共享方块模型 JSON），正文共 **41,988 字节**；代表运行约 **101.6ms**，不含首次共享方块包加载及 manifest 请求体，不能当网络冷启动预算。

新增 19 张原始 PNG 只在外部缓存与浏览器内存：

| 样本 | 原始尺寸/规则 | 本轮实际呈现 |
| --- | --- | --- |
| inventory / crafting_table / furnace / blast_furnace / hopper | 各 256×256 容器图 | 前四种裁取 176×166；漏斗 176×133。无人物实体预览；背包人物区仍是纹理空区 |
| slot | 18×18 | 与容器图中首个普通背包槽 18×18 patch 的 RGBA 完全相同；图标原点为边框＋(1,1) |
| slot_highlight_back / front | 各 24×24，保留原版缩放元数据 | 16×16 图标四周各扩 4px，位于物品前后层 |
| button / highlighted / disabled | 各 200×20；nine_slice，border=3 | 普通与鼠标高亮样本以 100×20 绘制；disabled 仅加载核对，未实现完整按钮状态/键盘激活 |
| Tooltip background / frame | 各 100×100；边框分别 9、10；frame.stretch_inner=true | 原始精灵与元数据绘制标题提示，角落像素检查；完整边带/中心与Java逐像素对照未完成，不实现完整物品组件/高级 Tooltip |
| furnace / blast_furnace 进度/火焰 | 24×16 / 14×14；两站同名样本字节相同 | 显示固定示例进度和火焰，不表示设备真的加工或燃烧 |
| font/ascii | 128×128；原 provider height=8、ascent=7 | 扫描真实 alpha 得 advance，按 provider 的 space=4；`iiii`=8、`WWWW`=24。原版字形/阴影、数量右对齐可见 |
| item/egg | 16×16，透明背景 | 原 items/egg→models/item/egg→generated/layer0 链读取，166 个透明、90 个可见像素 |

字体只支持原版 ASCII provider，不假称已实现 nonlatin/accented/unifont、Unicode fallback、加粗/斜体或完整字形着色管线。字体格表和派生字宽只在运行时读取，**没有提交字体数据表**。

**方块物品图标**：`items/furnace.json` 引用 `block/furnace`，没有假设 `textures/item/furnace.png` 存在。继承原 `block/block` 的 `display.gui`（旋转 30/225/0、scale=.625），用实际原版网格/UV/材质在独立透明 WebGL 画布渲染 64×64，再放入 16×16 槽位。1352 个透明、2744 个可见像素。临时模型几何/材质/纹理释放，renderer.dispose + forceContextLoss；结果仅留内存。**MeshBasic 光照不是 Java 物品光照等价实现**；生成物品侧面挤出、多层/染色/特殊动态物品仍未实现。此结果证明两类资源路径和几何图标技术可用，不代表全部物品视觉通过。

已有 JDK 的 javap 仅静态读取 InventoryMenu、CraftingMenu、AbstractFurnaceMenu、对应 Screen、TooltipRenderUtil、BitmapProvider 等：核对 2×2 起点(98,18)/结果(154,28)、3×3 起点(30,17)/结果(124,35)、炉输入(56,17)/燃料(56,53)/输出(116,35)、普通背包(8,84)、Tooltip 内容外扩 12px 及位图 advance 算法。原始字节码输出仍在仓库外。**没有真实 Java 26.3 GUI 操作、截图或逐像素对照结果。**

## 3. 真正 3D 与二维 GUI 连接

实测自由鼠标射线点击 w1 工作台、w2 熔炉、w7 高炉，打开对应固定屏幕菜单；场景方向不改变 GUI 方向。中心被其他模型挡住时，点击会命中前景漏斗/炉，不能穿透打开高炉；使用 B17 公开的可见射线样本可点击高炉露出的边缘。没有增加相机手势或中心射线。

GUI 打开时 header/developer inert；全屏输入层、场景入口门禁和键盘捕获共同阻断 pointer/drag/wheel/key。真实鼠标动作前后场景 pointerEvents、worldWheels、实例数组不变，见 [1280-native-input-isolation.json](evidence/gui-round3/1280-native-input-isolation.json)。取消打开前未结束的世界手势，消费用于关闭 GUI 的按键释放。

删除所绑定实例时主动关闭并清空 activeId/gesture；重建后绑定新的 ID，不持有旧 ID。该异步状态反例采用明确标记的程序化集成检查；另在w2已被真实鼠标拆除的6实例布局上运行基础/核心检查，12/17通过且布局仍为原6实例，见`removed-fixture-checks.json`；实际设备点击与 E/Esc 则使用真实输入。当前没有服务器同步、跨标签存档更新或设备加工状态。

关闭样本仅取消手势并解绑；重新打开会**重新建立固定夹具**，不是产品“清空/归还/持久化光标”的决定。永久身份数组 egg/furnace 是实验不变量样本，不是真实永久目录。未批准的 D04–D07 保持待审。

## 4. 浏览器输入覆盖与 G01–G30 对照

环境：Windows，内置 Chromium 155.0.0.0，WebGL2 / ANGLE D3D11，RTX 3080 Ti Laptop GPU；详细 UA/尺寸/后端在每份 foundation JSON。只验证此环境，Firefox、WebKit、触控板和其他键盘布局未验证。每条记录保留 type/button/buttons/code/key/modifiers/isTrusted；最多保留最近 160 条，导出证据为本轮操作快照。

| P1 行号 | 本轮浏览器证据 | 候选/未完成边界 |
| --- | --- | --- |
| G01 | 真实 E 打开个人菜单、E/Esc 关闭、释放事件消费 | Java 原版返回层级未实测；无暂停菜单 |
| G02 | 真实滚轮到 GUI 不透传；数字键事件可取得 | 未实现世界九格快捷栏选择/滚轮方向合同 |
| G03–G06 | 真实左右键；9 右拆得到源4/光标5，右放1再左合并成输入5 | 仅临时有限组；上限为实验参数，非完整物品组件注册表 |
| G07 | 真实 pointerdown→buttons=1 的连续 pointermove→pointerup；9 分到三格各3 | 延后至 pointerup 结算的实验实现，未声称逐帧等同 Java |
| G08 | DOM 合成右拖 buttons=2，三格各1、光标7→4，`trusted=false` | **未验证真实右键拖动**：当前自动化接口只有左拖；保留人工复现步骤 |
| G09 | 未实现 | 没有无限目录；不能把有限普通槽当创造来源 |
| G10 | 真实中键：源9不减、光标候选16 | 只有已解锁样本克隆，未核对原版所有 CLONE 前置 |
| G11 | 未实现 | 中键拖动/复制所有合法槽留 P5 |
| G12 | 真实 dblclick，detail=2；纯规则测试有限收拢上限 | 不宣称所有 Java PICKUP_ALL 分支通过 |
| G13 | 真实 Shift 左击，普通样本→快捷栏候选转移 | 只研究有限来源/目标；无原版工作站 Shift 路由或目录复制 |
| G14 | 真实 Shift 双击的修饰位与 dblclick 顺序 | 不执行正式批量转移；两次普通 Shift 点击不冒充完整 G14 |
| G15 | 真实悬浮数字3交换到 hot-2，keydown/keyup 均有记录 | 仅有限普通槽；结果/装备/目录权限未实现 |
| G16–G18 | 文本焦点中 E/3/F 输入为 `e3f`，不关闭或换槽；Ctrl 点击有记录 | F 副手、Q/Ctrl+Q、C/X+数字预设及保留浏览器快捷键未验证/实现 |
| G19–G20 | 未实现 | 装备槽只呈现；主动拒绝操作，避免假通过 |
| G21 | 2×2/3×3 真实原版坐标与图标摆放 | 无配方匹配、预览或结果取得 |
| G22–G23 | 未实现 | 结果槽拒绝输入/领取，无无限制作或剩余物规则 |
| G24 | 实验输入槽可放入蛋，输入显示有效 | 没有加工业务，不能据此声称炉原料/加工规则通过 |
| G25–G27 | 未实现 | 燃料、输出操作主动拒绝；静态火焰/箭头不是加工证据 |
| G28–G29 | 未实现 | HTML 文本焦点探针不等于配方书搜索；发现/过滤/填充留后续 |
| G30 | 真实 E/Esc；程序化未完成手势取消、实例删除后解绑、resize 取消 | 真实“按住拖动同时 Esc”、窗口失焦、外部释放、BFCache/切场景仍需人工；不决定产品关闭策略 |

真实输入记录见 [1440 原生左拖](evidence/gui-round3/1440-native-left-drag.json)、[1440 修饰键](evidence/gui-round3/1440-middle-shift-number.json)、[1280 状态断言](evidence/gui-round3/1280-native-input-isolation.json)、[1280 键盘/焦点](evidence/gui-round3/1280-key-focus.json)；[合成右拖](evidence/gui-round3/1280-synthetic-right-drag.json)单独存放。早期 1440 输入证据来自同轮布局校正前的有效坐标，最终布局的实际定位以 foundation/Tooltip/scales 记录为准；未将测试助手的过期坐标尝试计作通过结果。

## 5. 尺寸、缩放与回归结果

| 检查 | 结果 | 限制 |
| --- | --- | --- |
| TypeScript / Node 测试（有本机原版资源） | 34/34，通过；0失败、0跳过 | 6个 GUI 新测试；其余既有测试保留 |
| 无原版资源 Node 环境 | 32通过、2明确 BLOCKED/skip | 原版模型及 GUI 的可选集成项不冒充通过 |
| GUI raster/foundation：1440×900 / 1280×720 | 各12项通过 | 包括4容器尺寸、字宽、2类图标alpha、物理整数缩放、18×18槽patch、九宫格角落、取消和边界 |
| GUI 绑定/门禁集成 | 删除解绑、重建新ID、wheel门禁、pointer门禁通过 | 程序化合成事件，真实输入另表 |
| 原有 B01–B17 | 两尺寸、调试/原版模式均17通过、0失败 | 真实渲染器断言；不把所有检查都称实体鼠标 |
| V01–V11 | 两桌面尺寸原版模式11通过、0失败 | 原版资源已取得；调试模式对应原版检查明确 BLOCKED |
| 原生三维放置/旋转/拆除/存档 | 7→8→7实例；恢复8实例及 east 朝向与保存值相同 | 使用调试几何负载，见 placement-storage 记录；最后恢复并保存7实例夹具 |
| renderer重建 | 调试几何284创建/284释放，原版200/200；贴图/材质/实例映射归零 | 计数不是精确显存测量；无上下文丢失恢复承诺 |
| 根 / GitHub Pages 子路径构建 | 类型检查、白名单扫描、两组真实 HTTP 测试通过 | 游戏chunk仍有 >500KB 提示，未掩盖；不部署 |
| 静态构建实际浏览器 | 本机原版GUI加载 BLOCKED，原版raster passed=0 | 无占位GUI取得原版通过；逻辑门禁仍可测 |

1440×900 与 1280×720 的平台 DPR 约1；1440下 GUI 请求2/3分别使用整数物理倍率2/3。恢复 IAB 默认尺寸后的真实系统 DPR 为1.25，实际可视区359.2×956；宽度保护将倍率限制为2，GUI在水平边界内，两档请求都明确被限制，不谎称测试了两个不同倍率。此额外窄窗口测试不代替两种桌面测试，也不代表所有 DPR 已覆盖。GUI Canvas backing像素按DPR建立，渲染坐标按整数物理倍率，nearest采样；研究控制条占用独立底部区域，布局按可用高/宽限制，避免遮挡。正式GUI缩放策略、辅助技术/Tab导航/触控未定。

本机截图目录为上述缓存的 `browser-evidence/`，索引含真实文件哈希；没有任何截图入 Git。关键画面：`inventory-tooltip-1440.jpg`、`inventory-tooltip-1280.jpg`、`crafting-1440.jpg`、`furnace-1440.jpg`、`blast-furnace-1280.jpg`、`dpr125-scale2.jpg`。它们是网页原版资源样本截图，**不是 Java 客户端截图或正式产品成品**。像素/输入/计数证据共同支持结论，不以截图单独证明交互合格。

## 6. 复现与人工补测

已有依赖可直接运行，不需要重装。PowerShell 7，工作目录 `experiments/scene3d/`：

```powershell
./tools/extract-gui-samples.ps1 -Jar 'C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p1-20261020/client.jar' -Output 'C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-gui-20261020'
$env:MC_LOCAL_SAMPLES='C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-gui-20261020'
npm run check
npm test
npm run dev
```

打开 `http://127.0.0.1:4178/game/`；Developer tools→Load local vanilla GUI；可另点 Load local vanilla samples，使设备为原版模型。收起工具，点击工作台/炉，或 E 打开个人样本；Esc/E 关闭。Run GUI foundation checks、Run browser checks、Run vanilla browser checks 在工具中；`#gui-evidence` 为只读 DOM 诊断，可在开发者工具中读取。普通构建/preview **刻意没有原版资源**，不能用它替代本机 dev 预览。

手工右拖：重置夹具→左拿9个蛋→按住右键依次经过三个空普通槽→释放；应各1、光标6，并查看 trusted=true 的按钮序列。合成回放使用7个蛋，预期光标4，不能混用两个初态。另需人工按住左拖未释放时 Esc、窗口失焦、跨浏览器复查；检查未完成分配取消、下一次场景点击不会误放。无需为本轮自动启动 Java 客户端；客户端对照必须另行授权。

构建检查：`npm run build`、`npm run build:subpath`、`npm run test:built`。没有部署步骤。若环境只保留第二轮模型缓存，GUI可选测试明确跳过，浏览器 GUI 显示不可用；不得以调试几何或网页卡片替代原版通过。

## 7. 资源边界与下一次授权

资源使用/正式分发依据仍未解决（D14）。本机读取成功不构成网站分发许可，也不以非商用/私有仓库作推断。原始 PNG/字体JSON/可逆图标、javap输出、JAR、截图均在仓库外；Git仅存适配代码、必要坐标/类型/摘要、哈希和非像素测试证据。清单路由无目录浏览、无 CORS，仅本机同源；两种构建白名单没有 PNG/字体/模型等静态资产。阶段提交前另按71原始条目SHA-256和新增扩展名/内联图像检查Git暂存内容。

仍缺：真实 Java 26.3 视觉/输入对照；真实右/中拖及取消组合；完整GUI权限/键盘导航/触控；Unicode字体和复杂物品图标/光照；配方书、剩余物、无限语义与关闭策略批准；原版资源正式发布依据；烟花/音频和联合性能。D04–D07不变，P3/P5/P6/P7与剩余P2均未自动授权。**本地提交后停止，等待本轮独立审查及下一项明确授权。**
