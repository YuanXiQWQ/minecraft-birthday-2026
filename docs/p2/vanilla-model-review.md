# P2 第二轮：Java 26.3 原版模型与材质浏览器验证

日期：2026-10-20（America/Vancouver）。基于已独立审查的第一人称提交 `184ae03df93b2b517626498dd79994e388905d3f`。本次仅扩展 `experiments/scene3d/` 的模型/材质管线与验证；第一人称、中央主视觉、无准星、自由鼠标拾取、B放置及既有眼高诊断站保持。未决定正式视线手势，未进入P3/P7、完整GUI、烟花或音频。

## 1. 已取得的实际成果

五类原版方块已从校验通过的同版JAR提取，在本机浏览器中实际生成Mesh、绑定原始PNG、绘制并执行真实摄像机拾取；不再仅是离线BufferGeometry探针。

| 类别 | 原版状态/变体 | 本轮浏览器证据 | 适用边界 |
| --- | --- | --- | --- |
| stone | 4种显式模型选择，包括mirrored及180° | 四种逐项绘制/拾取、UV材质输出；场景含独立单位石块 | 常规布局确定选择第0项，gallery列全4项；未实现随机权重调度 |
| furnace | 四方向×lit两态，共8 | 八态逐项绘制/拾取；前面法线独立预期；south可见前面的lit实际帧缓冲与未点亮不同 | lit为材质探针，不执行熔炼，不宣称原版发光/照明已复刻 |
| hopper | down/north/east/south/west，共5 | 原版多元素及各朝向；开口射线命中内底11/16而非完整立方体顶面；alpha裁剪与拾取过滤 | 没有增加五槽传输或新的漏斗规则系统；沿用P2派生邻接 |
| crafting_table | 原版单态 | 实际贴图、顶面/侧面UV及摄像机拾取；三维实例仍可旋转 | 原版无facing状态，B实例旋转采用已有实验约定，不伪造原版facing属性 |
| blast_furnace | 四方向×lit两态，共8 | 八态逐项绘制/拾取、前面方向、lit输出差异及动画 | 使用实际16×32两帧PNG，frametime=10，interpolate=true；未实现炉加工 |

合计26种状态/变体、16张PNG、38个原始样本文件（21个JSON、16个PNG、1个动画元数据）。原客户端SHA-1仍为 `e877b6a07acd633fb3bb475002175cec036e7b87`。提取工具核对整个JAR，服务端和浏览器分别再核对每份样本的SHA-256及字节数。

最新离线CPU探针见[vanilla-offline-results.json](vanilla-offline-results.json)，26项状态通过。首次17状态与P1/第一轮实验的报告、截图及数据保留原样；本文件不回写旧结论。

## 2. 实现及资源隔离

流程：外部JAR → `extract-model-samples.ps1 -IncludeTextures` → 仓库外manifest/样本 → 显式配置的loopback dev中间件 → 浏览器哈希/解码 → `compileSamples` → `VanillaModels` → 既有SceneAdapter Mesh/Raycaster。没有生成含原版数据的正式构建、资源包或演示归档。

| 文件 | 当前职责 |
| --- | --- |
| `tools/extract-model-samples.ps1` | 默认仅外部JSON/PNG哈希；显式开关才在仓库外提取这五类的PNG与动画元数据；拒绝仓库内输出 |
| `tools/local-resources.ts` / `vite.config.ts` | 只在配置MC_LOCAL_SAMPLES的本机dev服务器提供清单内样本；校验真实路径/哈希，拒绝非本机Host、跨Origin和未列文件；无CORS放行、无目录浏览 |
| `web/src/model-format.ts` / `vanilla-pack.ts` | 父继承、子覆盖、纹理变量、面/默认UV、90°面旋转及直角blockstate变换；枚举精确variant而非按名字画近似模型；原始像素只留浏览器内存 |
| `web/src/vanilla-models.ts` | 原版几何、按面材质组、最近邻sRGB纹理、FrontSide、二值alpha；从原始条带像素产生动画/插值帧；几何/材质/纹理有独立释放计数 |
| `web/src/scene-adapter.ts` | 在同一眼位/布局下切换原版工厂与明确的调试回退；原版放置预览保留材质和实际几何；最近可见三角形加UV alpha过滤；可选择的gallery不写领域存档 |
| `web/src/vanilla-checks.ts` | 真WebGL绘制、GPU帧缓冲摘要、26状态拾取、前面方向、开口、alpha、动画及几何周转检查；无原版资源时返回blocked/零通过 |

所有原版模型、PNG、动画元数据、浏览器截图保留在：

```text
C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-materials-20261020/
```

其中 `browser-evidence/` 保存本轮截图，仅为本机查看，不纳入Git。中间件只服务manifest内条目，因此也不公开这个截图目录。原版资源不进入web/public、dist或源码内联；普通build/preview的原版入口不可用，需明确选择本机dev模式。

**分发状态仍未解决。** 用户授权的是隔离技术验证，不是权利方对原版资产重分发的许可。仓库私有、非商用、可下载、自己转换模型或本机成功显示均不构成发布依据。本轮不部署、不推送，也不把资源导入改成正式玩家必须执行的操作。提交仅含实现、测试、路径/哈希/统计和无像素证据，不含原始模型、纹理、转换顶点、原版截图或含资产的演示。

## 3. 真正支持的子集及明确缺口

- **已验证**：父继承与child纹理覆盖、纹理变量、隐式/显式UV、面UV旋转、四方向直角blockstate旋转、lit模型选择、多元素漏斗与实际几何开口、最近邻sRGB材质、二值alpha/对应射线、原始元数据的两帧插值动画。新增非对称UV、alpha翻转/边界、动画序列单元测试不依赖原版资产。
- **实际透明发现**：hopper_top的16×16 PNG中100像素alpha=0，其余为255。渲染alphaTest=.5；射线用同样UV约定采样当前帧alpha，透明位置继续检查后面的表面。另用明确标记的材质探针平面放原始top纹理，验证中心透明处命中后方、边缘仍命中前方；这两个测试平面不冒充原版漏斗几何。
- **动画**：高炉lit PNG为16×32，两个16×16帧，每帧10游戏资源刻（50ms/刻），interpolate=true。纹理像素来自原始帧，仅按元数据组合；没有自制像素替代素材。浏览器在0/250/500ms分别实际绘制，三份帧缓冲摘要不同。该纹理时钟独立于尚未实现的加工计时。
- **明确拒绝**：元素rotation、UV-lock、multipart、非直角blockstate旋转、非垂直/特殊尺寸动画布局、缺失依赖/动画元数据、非法帧序列、半透明像素。错误会阻止原版激活；不会用调试模型替代后记成原版通过。
- **尚未验证/实现**：完整Minecraft光照、AO、tint、生物群系颜色、相邻面cullface裁剪/批次优化、实体/特殊模型、一般半透明混合、完整原版资源pack覆盖规则。使用MeshBasicMaterial进行无照明纹理核对；不声称已达到Java客户端逐像素视觉一致。
- 四方向的实际模型/材质/法线及可见面有证据；固定第一人称视角看不到的背面没有被声称逐面人工比较。没有启动Java客户端、没有新增观察手势或修改相机以绕过此限制。

## 4. 测试环境与结果

实际环境为Windows平台、内置Chromium155、WebGL2 / ANGLE Direct3D11、NVIDIA RTX3080Ti Laptop GPU、hardwareConcurrency=20。使用浏览器桌面视口覆盖，不代表外部Chrome/Firefox/Safari或低端GPU均通过。相机保持Front `(0.5,1.62,6.5)`、FOV70；这些仍是已接受的实验配置，非正式手势决定。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript | 通过 | `npm run check`；没有安装依赖或更换渲染栈 |
| 无原版环境Node测试 | 27通过、1明确跳过、0失败 | 现有21项保留；L02说明缺MC_LOCAL_SAMPLES，不记作原版通过 |
| 配置原版环境Node测试 | 28/28通过 | 额外校验外部清单与26状态；UV/动画/alpha和本机传输边界用独立合成夹具；S01确认展示石块在合法建造区外 |
| 最新离线原版探针 | 26状态通过 | [路径/哈希/计数](vanilla-offline-results.json)，此文件本身不含模型或像素 |
| 原有浏览器核心 | 原版/调试两种模式、两种尺寸均17/17通过 | [1440原版](evidence/vanilla-round2/core-1440.json)、[1280原版](evidence/vanilla-round2/core-1280.json)、[1440调试](evidence/vanilla-round2/debug-1440.json)、[1280调试](evidence/vanilla-round2/debug-1280.json) |
| 新增原版浏览器断言 | 两种尺寸均11/11通过，26状态逐项绘制/拾取 | [1440](evidence/vanilla-round2/models-1440.json)、[1280](evidence/vanilla-round2/models-1280.json)；包含真实帧缓冲摘要，未保存像素 |
| 原版模式真实鼠标/控件 | 7项通过 | [记录](evidence/vanilla-round2/pointer-save-lifecycle.json)：偏心工作台/GUI隔离、三维预览、放置east、转向south、拆除、读档、重建释放 |
| 1280实际鼠标及布局 | 通过 | [记录](evidence/vanilla-round2/layout-1280.json)，1280×720画布，工具默认隐藏，偏心真实点击打开workbench二维GUI |
| 根/仓库子路径静态包 | 两个构建/审计及2个HTTP用例通过 | 首页不加载游戏；build/preview不能请求原版接口/PNG，开发资料和原始构件404 |

核心B03–B07使用独立遮挡夹具，确认真实最近表面、前墙挡后方、拆墙后可见、面法线及预览不自命中；B08/B09确认上供料/侧燃料/下抽出邻接及旋转断连。原版几何模式跑同样断言，没有仅用离线测试代替浏览器。

截图在仓库外 `browser-evidence/`：26张按状态ID命名的 `*-1440.jpg` 为逐状态画面，1280另截取7个代表状态；`vanilla-1440.jpg`、`vanilla-1280.jpg` 为常规第一人称布局；`vanilla-preview-1440.jpg`、`vanilla-gui-1440.jpg`、`vanilla-gui-1280.jpg` 展示预览/屏幕GUI。`preview-final-1440.jpg`通过既有实验按钮将w2转向south并点亮炉材质，未改变默认fixture代码或保存该展示操作。共39张，[本机文件名/哈希索引](evidence/vanilla-round2/local-screenshot-index.json)不含像素。图片仅作本机视觉证据，不提交。截图不单独证明拾取或性能；声明通过的断言有非像素记录。[浏览器warn/error日志](evidence/vanilla-round2/browser-logs.json)为空。

诊断期间大型证据JSON的浏览器DOM读取发生过3秒超时，之后拆批读取/刷新恢复；原始结果已保存。最初类型检查中的Node strip-only构造器语法及材质参数过窄已修正；最终检查通过。没有将这些中途失败隐藏成“从未失败”，也没有虚构Java客户端结果。

## 5. 加载与性能实测

[资源加载记录](evidence/vanilla-round2/resource-loading.json)：完整本机加载、逐项SHA-256、PNG解码与编译约49.2ms（一次样本），38个资源响应体共16,856字节，另有11,075字节manifest，共27,931字节响应体；不含HTTP头，也不是互联网冷加载测试。PNG解码后统计16纹理；资源路径/耗时/大小/哈希逐项保留。静态站点没有运行期下载JAR。

同一逻辑夹具七设备，另有一单位石块；原版模式为8个原版模型加调试环境，调试模式全部为占位几何。gallery关闭；逐状态gallery截图额外有第九个模型，不能拿截图实例数代替性能负载。每档三次，各2秒预热+10秒RAF采样，开发面板主要采样期间收起。

常规展示石块位于 `[-5,0,-2]`，由S01保证不占用合法建造单元；它仍是无采集功能的渲染探针。早期截图中该石块曾处于区内，已以区外配置复核，未修改领域放置规则或摄像机。

| 视口/模式 | draw calls | triangles | GPU几何/纹理计数 | 三次平均FPS | p95间隔 | 最大间隔 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 调试 | 56 | 656 | 58 / 1 | 240.0 / 240.0 / 239.9 | 均约4.3ms | 4.5 / 4.4 / 8.2ms |
| 1440×900 原版 | 175 | 580 | 33 / 17 | 240.0 / 239.9 / 239.9 | 均约4.3ms | 4.5 / 8.4 / 8.3ms |
| 1280×720 原版 | 175 | 580 | 33 / 17 | 240.0 / 240.0 / 240.0 | 均约4.3ms | 4.8 / 4.5 / 4.5ms |
| 1280×720 调试 | 56 | 656 | 58 / 1 | 240.0 / 240.0 / 240.0 | 均约4.3ms | 4.6 / 4.9 / 4.8ms |

原始数据：[调试1440](evidence/vanilla-round2/performance-debug.json)、[原版1440](evidence/vanilla-round2/performance-vanilla-1440.json)、[原版1280](evidence/vanilla-round2/performance-vanilla-1280.json)、[调试1280](evidence/vanilla-round2/performance-debug-1280.json)。两尺寸均关闭gallery/选中轮廓、先跑相应模式断言再采样，原版模式预热了全部样本材质。资源工厂拥有16张原版纹理，renderer计数17还包括内部资源，不将两者混同。两尺寸backing pixels分别为1800×1125和1600×900，渲染DPR保持创建时的1.25；视口覆盖后的浏览器DPR读数按原始记录保留。

这些数据证明局部可运行，不能证明原版素材更快、四场景预算达标或显示器实际呈现240fps。当前未合并材质组/内部面，原版三角形更少但绘制调用更多；RAF常被环境调度上限限制。计数不是显存字节，没有纯GPU计时，没有完整四场景/粒子/GUI联合负载或正式Java光照。暂不以此删功能或扩展世界系统。

## 6. 本机查看与后续门槛

当前机器在实验目录运行：

```powershell
$env:MC_LOCAL_SAMPLES = 'C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-materials-20261020'
npm run dev
```

打开 `http://127.0.0.1:4178/game/` → Developer tools → Load local vanilla samples。选择Original state gallery查看精确状态（空项恢复普通布局），也可用现有Place/Rotate/Remove操作设备；摄像机与手势保持原状。Use debug geometry可比较；Toggle lit sample state仅改实验显示。`npm run preview`只有无原版静态包，不能与dev共用4178端口。

另一台机器用自己提供的同版JAR执行[实验README](../../experiments/scene3d/README.md)的外部提取步骤，不能从Git取得本轮原始资产或截图。缓存为临时目录，删除后须重新提取。源码/脚本可复现，不承诺素材可以分发。

交付时保留本机4178 dev服务及原版预览tab供用户查看；刷新后仍需显式加载原版样本。最终暂存内容另执行[原始资源排除审计](evidence/vanilla-round2/staged-resource-audit.json)：检查Git暂存blob与38份原始资源的SHA-256、禁止新增图片/JAR/模型归档及内联图像，同时确认历史资料未改动。该审计只证明所述文件边界，不替代权利方许可。

仍待审查：原版资产/截图/媒体的正式使用与分发路径；UV-lock/元素旋转等超出这五类样本的需求清单；Java客户端视觉/照明对照；正式性能预算、跨浏览器/低端GPU、长期GPU释放与意外上下文丢失恢复。D04–D07、视线手势、完整GUI/音频/烟花及后续阶段未获本轮授权。提交后停止等待审查，不推送或部署。
