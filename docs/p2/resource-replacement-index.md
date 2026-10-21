# 原版资源清单、来源与使用索引

当前要求：以Minecraft Java Edition 26.3原版模型、纹理、GUI、字体、物品图标、粒子和声音为基准，正常提交Git并进入普通构建，默认使用。**不要求外部缓存、localhost、特殊加载按钮或最终全部手绘替换。** 用户今后提供自定义资源时，仅替换其明确指定的内容；目前没有声称任何替代素材已经制作或完成替换。

开发授权与公开发布的权利审查分开：用户同意开发期使用不是权利方许可声明；未来公开发布需另核对适用条款，不能把该事项改成开发期原版素材禁令。本次不部署。

## 当前可复用资源

- P3补充（当前）：正式`app/`同时读取原manifest和[presentation-manifest](../../resources/minecraft/26.3/presentation-manifest.json)，新增17原始文件（cake7模型+blockstate+4纹理+oak slab/post/plank5模型）。含两清单共114文件，普通dev/build默认加载；P2原95项manifest和历史证据不改写。原版来源SHA1和逐文件SHA256可复核。浏览器验收未切cake与组合桌面，切片变体只验证离线转换，不扩大原版模型支持能力。
- 正式入口与运行步骤见[app说明](../../app/README.md)，P2实验仍使用原96文件cohort；以下原95项统计属于P2资源范围，不表示P3只有这些文件。无强制替换计划，发布权利独立待审。
- 仓库源目录：`resources/minecraft/26.3/`，已实现功能无需开发者再次提取客户端。
- [完整机器清单](../../resources/minecraft/26.3/manifest.json)：95个资源，348,101字节；另有manifest本身。31 JSON、44 PNG、8 mcmeta、12 Ogg。
- 普通dev/build/preview通过Vite base解析 `minecraft/26.3/`；根部署为 `/minecraft/26.3/`，仓库子路径为 `/minecraft-birthday-2026/minecraft/26.3/`。
- P2 Vite打包原清单96个文件，P3正式Vite打包两个清单114文件；不复制完整JAR、无关客户端资源、开发资料、个人路径或临时输出。哈希校验确保内容正确，不限制Git/构建。
- `.gitattributes`对该版本资源设置`-text`，避免Windows的autocrlf在克隆检出时改写JSON/mcmeta/manifest字节而破坏原版哈希；不改变`.gitignore`。

| 类别 | 当前原版内容/使用管线 | 已验证范围及缺口 | 当前替换状态 |
| --- | --- | --- | --- |
| 模型/方块状态 | `assets/minecraft/blockstates/`、`models/block/`，父继承、纹理变量、UV、直角状态朝向 | stone/furnace/hopper/crafting_table/blast_furnace，26变体；元素旋转、UV-lock、multipart等未支持 | 未指定替换，保持原版 |
| 方块纹理 | `textures/block/`，16张原版纹理及高炉动画元数据 | 最近邻/sRGB、镂空、lit状态/插值；未完成全Java光照/AO | 同上 |
| GUI | `textures/gui/container/`、`sprites/`及对应mcmeta | 个人/工作台/炉/高炉/漏斗局部界面、槽、按钮、Tooltip；无完整业务 | 同上 |
| 字体 | `font/`及`textures/font/ascii.png` | 当前位图ASCII提供者与字宽；原始字体定义保持来源，其他提供者不加载，不冒称全Unicode覆盖 | 同上 |
| 图标 | `items/egg.json`、`items/furnace.json`、相关item模型/PNG及共享block模型 | egg二维图标，furnace按原版display.gui运行时生成3D图标；其他图标未实现 | 同上 |
| 粒子 | `particles/firework.json`、`flash.json`及9张精灵 | 五形状世界坐标轨迹、8帧火花和Flash、Trail/Twinkle；非完整Java shader/碰撞 | 同上 |
| 声音 | `sounds.json`所列12事件及12个Ogg | 烟花7事件、Toast3事件、经验拾取/升级；WebAudio真实解码/调度，人工试听待验 | 未指定替换；手绘贴图不能替换音频 |

## 来源与校验

官方26.3 client SHA-1：`e877b6a07acd633fb3bb475002175cec036e7b87`。官方资产索引34 SHA-1：`0c8f43b28f837869c1e54a6aeb22c396a1548946`。每个资源路径/长度/SHA-256在manifest中；声音另记官方对象SHA-1与URL。

`assets/minecraft/sounds.json`只选取已实现的12个事件，定义、权重、音量和Ogg不变；manifest的derived字段明确记录从官方原定义筛选，源SHA与派生文件SHA分开，不把派生内容冒充原文件哈希。其他原始文件逐字节保留，包括模型父链、状态、纹理及动画元数据。只声明当前ASCII/font与五类模型适配能力，不拉入所有无关提供者或全客户端。

一次性导入工具为 `experiments/scene3d/tools/import-vanilla-resources.mjs`，可将已校验提取目录导入仓库；它是维护工具，**不是克隆后运行的前置步骤**。普通运行只需在 `experiments/scene3d/` 安装锁定依赖并执行npm脚本。旧MC_LOCAL_SAMPLES中间件已移除。

## 历史资料

P1与P2各轮原始报告、哈希和失败记录保持原样。第二/三/四轮采用的仓库外样本与截图路径只记录当时实验环境；“只能本机/禁止Git或构建/必须全部替换”的旧方向均不再是当前规范。

[第四轮原始资源/截图索引](evidence/celebration-round4/resource-index.json)仍准确描述其当时95项外部样本与10张Git截图；当时934,320字节庆典样本包含全量声音定义，不能与当前12事件筛选包体混用。模型/GUI运行时Canvas、BufferGeometry、精灵atlas和解码PCM从仓库源资源生成，不需要另外提交可逆转换文件。开发截图在docs中，不是正式场景背景或正式产品素材。
