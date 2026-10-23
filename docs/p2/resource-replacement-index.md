# 原版资源清单、来源与使用索引

当前十九项增量见[experience-manifest](../../resources/minecraft/26.3/experience-manifest.json)及[交付报告](../p8/experience-19/report.md)：有界原版搜索页/按钮/滑块/文本框/高亮、GUI light.glsl、官方草方块favicon、官方资产索引unifont.zip中的未改变字形位图与许可证。字体是可审计JSON转换，不是手绘替代；实际首次加载避免与图标加载重复解析。全部正常Git/build，依赖、版本、输入/转换/导出器哈希在清单；原始完整client.jar/zip不进网站。Pages发布已有后续明确授权，后文各阶段“不部署”只保留当时边界。


P8当前增量：[interaction-manifest](../../resources/minecraft/26.3/interaction-manifest.json)新增10张原版破坏阶段、4张原版指南针/箱子页签背景、advancement toast及原版zh_CN词表，共16份素材+1清单；合计643份普通运行资源/清单。搜索别名只投影113候选物品并单独哈希，新增-text属性保持克隆字节稳定。原版烟花/12声音复用已有清单；无新增外部缓存或强制替换。见[当前体验/P8报告](../p8/report.md)。下文626等计数为历史范围。

P7当前资源：world-manifest新增80份所需原版资产及1清单，合计626份运行资源/清单，正常Git/dev/build默认加载。地形/作物模型和父依赖、动画元数据、两成年实体皮肤、草/叶色图和7交互声音事件，派生实体几何及只读class哈希见[P7交付](../p7/report.md)。此前545/490/478计数是各阶段历史范围。没有强制素材替换计划。

P6配方书扩展：book-manifest.json索引54项新增原版资源及依赖；加清单后普通运行共545资源文件，原版漏斗背景复用。包含书/RecipeToast精灵、七种分类图标及父模型纹理；指南针仅分类固定原版16号帧。原始版本/哈希与来源见data/minecraft/26.3/book-evidence.json及[交付](../p6/book-hopper-review.md)，不增加替换要求。

GUI视觉修复当前增量：新增[player-manifest](../../resources/minecraft/26.3/player-manifest.json)及11项原始资源：Steve宽臂皮肤、iron装备定义/两张盔甲atlas、三种可达长矛的第三人称父/子模型及持物贴图。382项原始依赖中371项复用已有资源，并记录13个只读客户端类哈希；类本身不进入构建。当前合计490资源/清单，包含4份清单；版本、原始SHA256及导出器哈希可复核。正常Git/dev/build直接使用，无外部缓存运行要求。见[GUI视觉报告](../p6/gui-visual-review.md)。下列各阶段计数保留历史范围。

P6合成接入补充：原有`assets/minecraft/textures/gui/container/crafting_table.png`现加入CatalogueArt依赖加载；源文件仍属于已提交P2原版资源集，catalogue依赖402项，资源/清单仍478文件。已重新生成catalogue-manifest的来源/提取器哈希，普通根路径/Pages构建直接包含并校验。没有新增替代素材、客户端或外部缓存运行要求。详见[P6报告](../p6/crafting-review.md)。

当前要求：以Minecraft Java Edition 26.3原版模型、纹理、GUI、字体、物品图标、粒子和声音为基准，正常提交Git并进入普通构建，默认使用。 **不要求外部缓存、localhost、特殊加载按钮或最终全部手绘替换。** 用户今后提供自定义资源时，仅替换其明确指定的内容；目前没有声称任何替代素材已经制作或完成替换。

开发授权与公开发布的权利审查分开：用户同意开发期使用不是权利方许可声明；未来公开发布需另核对适用条款，不能把该事项改成开发期原版素材禁令。本次不部署。

## 当前可复用资源

- P5有限收尾：补充原版creative_inventory/scroller及scroller_disabled两张精灵；原有inventory.png加入GUI加载依赖。catalogue资源段363条、401依赖，总计478文件/清单，普通Git/build默认可用。来源与哈希见catalogue-manifest，范围见[P5最终报告](../p5/final-report.md)；下列计数均保留阶段历史。

- P5第二部分：新增原版hotbar_offhand_left/right两张29×24精灵，catalogue资源段361项、398依赖，总计476文件（含3清单）正常Git/build；来源与导出器哈希已更新，113默认图标管线不变。详见[本次报告](../p5/part2-report.md)。下列各阶段数量保留为历史范围。

- P5第一部分：新增`catalogue-manifest.json`和359原始依赖，正常构建共474资源/清单文件；覆盖113默认目录图标、creative背景、九格/选框、装备空槽/Tooltip等，原P2/P3清单不改。特殊箱子/盾牌class几何和UV、草色图、组合/选择分支有独立证据；未支持饰纹/装饰等组件或完整Java着色对照。详见[P5报告](../p5/report.md)；原版素材仍为基准，无强制替换计划。

- P4补充：原114个模型/GUI/字体/粒子/音频资源文件与清单未改。新增规则数据源在`data/minecraft/26.3/`，正式构建另发`rules/minecraft/26.3/rules.json`及小型`manifest.json`，根路径/Pages子路径相同base机制。完整catalog/coverage/研究文档/客户端JAR不发布。113逻辑ID不表示113图标已制作；P5/P7按实际使用继续补齐原版依赖。数据来源与哈希见[P4清单](../../data/minecraft/26.3/manifest.json)。

- P3补充（阶段记录）：正式`app/`同时读取原manifest和[presentation-manifest](../../resources/minecraft/26.3/presentation-manifest.json)，新增17原始文件（cake7模型+blockstate+4纹理+oak slab/post/plank5模型）。含两清单共114文件，普通dev/build默认加载；P2原95项manifest和历史证据不改写。原版来源SHA1和逐文件SHA256可复核。浏览器验收未切cake与组合桌面，切片变体只验证离线转换，不扩大原版模型支持能力。
- 正式入口与运行步骤见[app说明](../../app/README.md)，P2实验仍使用原96文件cohort；以下原95项统计属于P2资源范围，不表示P3只有这些文件。无强制替换计划，发布权利独立待审。
- 仓库源目录：`resources/minecraft/26.3/`，已实现功能无需开发者再次提取客户端。
- [完整机器清单](../../resources/minecraft/26.3/manifest.json)：95个资源，348,101字节；另有manifest本身。31 JSON、44 PNG、8 mcmeta、12 Ogg。
- 普通dev/build/preview通过Vite base解析 `minecraft/26.3/`；根部署为 `/minecraft/26.3/`，仓库子路径为 `/minecraft-birthday-2026/minecraft/26.3/`。
- P2 Vite打包原清单96个文件，P3正式Vite打包两个清单114文件；不复制完整JAR、无关客户端资源、开发资料、个人路径或临时输出。哈希校验确保内容正确，不限制Git/构建。
- `.gitattributes`对该版本资源设置`-text`，避免Windows的autocrlf在克隆检出时改写JSON/mcmeta/manifest字节而破坏原版哈希；不改变`.gitignore`。

| 类别          | 当前原版内容/使用管线                                                                | 已验证范围及缺口                                                                                                                                      | 当前替换状态                     |
|---------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------|
| 模型/方块状态 | `assets/minecraft/blockstates/`、`models/block/`，父继承、纹理变量、UV、直角状态朝向 | stone/furnace/hopper/crafting_table/blast_furnace，26变体；元素旋转、UV-lock、multipart等未支持                                                       | 未指定替换，保持原版             |
| 方块纹理      | `textures/block/`，16张原版纹理及高炉动画元数据                                      | 最近邻/sRGB、镂空、lit状态/插值；未完成全Java光照/AO                                                                                                  | 同上                             |
| GUI           | `textures/gui/container/`、`sprites/`及对应mcmeta                                    | 个人/工作台/炉/高炉/漏斗局部界面、槽、按钮、Tooltip；无完整业务                                                                                       | 同上                             |
| 字体          | `font/`及`textures/font/ascii.png`                                                   | 当前位图ASCII提供者与字宽；原始字体定义保持来源，其他提供者不加载，不冒称全Unicode覆盖                                                                | 同上                             |
| 图标          | `items/egg.json`、`items/furnace.json`、相关item模型/PNG及共享block模型              | P5已支持113默认目录图标：generated、原版elements/display.gui、原草色调、箱子/盾牌特殊几何及草床组合；未知饰纹/装饰/复杂组件与完整Java光照仍未宣称支持 | 同上                             |
| 粒子          | `particles/firework.json`、`flash.json`及9张精灵                                     | 五形状世界坐标轨迹、8帧火花和Flash、Trail/Twinkle；非完整Java shader/碰撞                                                                             | 同上                             |
| 声音          | `sounds.json`所列12事件及12个Ogg                                                     | 烟花7事件、Toast3事件、经验拾取/升级；WebAudio真实解码/调度，人工试听待验                                                                             | 未指定替换；手绘贴图不能替换音频 |

## 来源与校验

官方26.3 client SHA-1：`e877b6a07acd633fb3bb475002175cec036e7b87`。官方资产索引34 SHA-1：`0c8f43b28f837869c1e54a6aeb22c396a1548946`。每个资源路径/长度/SHA-256在manifest中；声音另记官方对象SHA-1与URL。

`assets/minecraft/sounds.json`只选取已实现的12个事件，定义、权重、音量和Ogg不变；manifest的derived字段明确记录从官方原定义筛选，源SHA与派生文件SHA分开，不把派生内容冒充原文件哈希。其他原始文件逐字节保留，包括模型父链、状态、纹理及动画元数据。只声明当前ASCII/font与五类模型适配能力，不拉入所有无关提供者或全客户端。

一次性导入工具为 `experiments/scene3d/tools/import-vanilla-resources.mjs`，可将已校验提取目录导入仓库；它是维护工具， **不是克隆后运行的前置步骤**。普通运行只需在 `experiments/scene3d/` 安装锁定依赖并执行npm脚本。旧MC_LOCAL_SAMPLES中间件已移除。

## 历史资料

P1与P2各轮原始报告、哈希和失败记录保持原样。第二/三/四轮采用的仓库外样本与截图路径只记录当时实验环境；“只能本机/禁止Git或构建/必须全部替换”的旧方向均不再是当前规范。

[第四轮原始资源/截图索引](evidence/celebration-round4/resource-index.json)仍准确描述其当时95项外部样本与10张Git截图；当时934,320字节庆典样本包含全量声音定义，不能与当前12事件筛选包体混用。模型/GUI运行时Canvas、BufferGeometry、精灵atlas和解码PCM从仓库源资源生成，不需要另外提交可逆转换文件。开发截图在docs中，不是正式场景背景或正式产品素材。
