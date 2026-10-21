# 原版资源与最终替换位置索引

本文件按 P2 第四轮用户决定建立，覆盖此前隔离资源及新增粒子/音效/截图。用户允许这些资源及可逆转换暂时进入 Git/普通静态构建，最终由用户校对并替换为其准备的手绘素材；**当前项目发布路径按该替换方案解决，不再沿用旧报告的“分发方案未定”作为 P2 阻断**。这里记录实际存放和使用情况，不把可下载或本机显示当作新的权利方授权文本。

本次实际选择：原始资源继续保留在仓库外；新增浏览器 JPEG 证据获准进入 `docs/`；普通构建仍无原版样本。允许进入与已经进入必须分开。后续若复制资产进静态包，必须补充本索引的实际目标路径。`AGENTS.md`/docs/构件本身不进入网站。

## 1. 当前文件位置

下面缓存均以 `C:/Users/YuanXi/AppData/Local/Temp/` 为根前缀。不是部署依赖，不要求最终玩家导入客户端。

| 位置 | 实际内容 | Git / 普通构建 | 最终校对动作 |
| --- | --- | --- | --- |
| `minecraft-birthday-2026-p1-20261020/` | 原始 client.jar、官方版本元数据、资产索引34与sounds.json及P1分析文件 | 否 / 否 | 仅原始核实输入，禁止当整包产品资源复制；构件哈希见本轮报告 |
| `minecraft-birthday-2026-p2-models-20261020/` | 首轮离线模型JSON/父依赖及PNG哈希 | 否 / 否 | 历史原始探针，保留；正式资源转换不以此历史17状态为全部能力 |
| `minecraft-birthday-2026-p2-materials-20261020/` | 第二轮38个模型/材质白名单，原版16PNG/动画元数据；`browser-evidence/`39张历史截图 | 否 / 否 | 模型/贴图与截图都需作为原版来源识别；明细见[第二轮加载索引](evidence/vanilla-round2/resource-loading.json)及[截图索引](evidence/vanilla-round2/local-screenshot-index.json) |
| `minecraft-birthday-2026-p2-gui-20261020/` | 第三轮71条：上述38条＋33条GUI/font/items；`browser-evidence/`历史截图、javap | 否 / 否 | 原版容器/精灵/ASCII/egg PNG、furnace模型图标输入均在替换范围；明细见[第三轮资源证据](evidence/gui-round3/resource-evidence.json) |
| `minecraft-birthday-2026-p2-fireworks-20261020/` | 当前联合缓存95条：原71条＋24条庆典；18份成功的静态javap检查输出 | 否 / 否 | 当前完整条目逐路径/大小/SHA-256/声音官方SHA-1与来源见[resource-index.json](evidence/celebration-round4/resource-index.json)；javap不作为网站资源 |
| `docs/p2/evidence/celebration-round4/*.jpg` | 本轮10张含原版模型、GUI或粒子的实际浏览器截图；其中attempt-stale-star作废不用于Creeper通过 | **是** / 否 | 这些不是手绘替代图或Java客户端截图。最终交付可按用户决定保留开发证据、替换或移出；本次哈希逐项在机器清单screenshots中 |
| `experiments/scene3d/dist/`、`dist-subpath/` | 当前构建只有HTML/JS/CSS/许可/manifest，不含上述PNG/Ogg/模型数据/截图 | 本地生成 / 若日后选择该构建才是产物 | 根/子路径HTTP及白名单审计均通过；本轮不部署。当前缺样本是BLOCKED，不冒充原版通过 |

## 2. 当前联合缓存的分类替换职责

所有路径均相对于当前 `externalRoot`，不要遗漏旧缓存的重复副本。

| 路径类别 | 实际消费者 | 替换/校对重点 |
| --- | --- | --- |
| `assets/minecraft/blockstates/*.json`、`models/block/*.json` | vanilla-pack/model-format/vanilla-models | 五类26状态、父继承/UV/方向；如替换模型，应核对碰撞拾取、朝向和非立方体开口，不只换图片 |
| `textures/block/*.png`、高炉 `.png.mcmeta` | 三维工作站和方块物品图标 | 16张纹理、16px采样、镂空alpha、lit帧与动画元数据；原版furnace图标会继承同一资源 |
| `textures/gui/**` | gui-pack/gui-view | 容器背景、槽/按钮/Tooltip相关精灵及拉伸元数据；替代后重新跑尺寸、九宫格和像素测试 |
| `font/**`、`textures/font/**` | ASCII位图字体加载、宽度扫描 | 不只替换字图，还应核对字符映射、advance/行高、独立字体许可；当前不是全Unicode字体方案 |
| `items/**`、`models/item/**`、`textures/item/**` | egg平面图标、furnace三维图标 | 两类路径不能统一当独立PNG；继承display.gui、透明边界及数量文本定位保持可核对 |
| `particles/firework.json`、`particles/flash.json` | celebration-pack帧定义 | 火花反向帧序与Flash单帧，替换后保持规则或明确审查新约定 |
| `textures/particle/spark_0.png`…`spark_7.png`、`flash.png` | firework-batch runtime atlas | 8×8火花与32×32Flash；不要把几何轨迹改成五张轮廓图。颜色和透明度由模拟叠乘 |
| `sounds.json`、`sounds/fireworks/*.ogg`、`sounds/ui/toast/*.ogg`、`sounds/random/orb.ogg`、`levelup.ogg` | celebration-audio | 12事件/12样本；最终声音来源也须校对，不能认为“替换手绘贴图”自动替换音频。需要更换时登记替代样本与事件映射、时长/音量/音高 |

庆典新增24条共 **934,320字节**，含2粒子JSON、9PNG、sounds.json和12Ogg。95条完整清单是实际文件索引；未把整份客户端或整套声音下载进来。已有manifest的原版JSON/音频定义只在外部缓存，机器索引保留路径、哈希与本轮12事件元数据供审查。

## 3. 运行时转换与证据

- `vanilla-models` 的 BufferGeometry/纹理、GUI glyph/icon Canvas、`firework-batch` 的306×34 atlas、WebAudio解码PCM均只在浏览器内存；未输出可逆转换文件到源码或dist。正式替换应从各源输入替换并重新生成，避免只替换一个截图。
- 本轮JPEG是开发证据，已获当前授权提交；不要当正式页面素材。10张文件的路径/哈希均列在resource-index.json；其余JSON/测试日志为数值、路径、哈希和运行事件，没有PNG/base64或音频buffer内联。
- 此前P1、P2第二/三轮原始报告与截图索引保持原文，其“不提交截图/分发未定”描述的是当时边界；当前以本文件及第四轮用户决定为准，不回写历史实验事实。
- 最终素材替换核对尚未执行，不代表进入正式结局、P3–P9或获准部署。下一轮新增/移动任何原版或替代素材时继续更新这里及机器清单。
