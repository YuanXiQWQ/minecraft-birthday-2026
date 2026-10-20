# P2 第一轮验收报告：真实 3D 基础切片

> 最新独立授权交付：[第三轮原版二维GUI、物品图标和浏览器输入](gui-input-review.md)。本机原版容器/ASCII/精灵和两类图标已有局部证据，缺资源明确BLOCKED；原生输入与合成回放分列，D04–D07与完整P2未获批准。下方及此前报告保留原始实测记录。

> 后续独立授权：[P2第二轮原版模型/材质浏览器验证](vanilla-model-review.md)。当前五类原版样本可通过仓库外缓存在本机dev服务器加载；原版模型/PNG、截图和含资源演示未纳入Git/普通构建。下方“浏览器仅调试几何”等表述保留为首次交付事实，不覆盖第二轮的局部新证据；完整P2及分发路径仍未通过。

> 最新追加交付：[第一人称视角、布局与交互修正报告](first-person-review.md)。用户已明确场景内部眼高第一人称、中央主视觉、无准星及自由鼠标射线；本文件下方首次交付的俯视平台、窄画布截图和性能仍保留为历史实测，不能作为当前视觉规范。修正未授权完整P2或后续阶段。

日期：2026-10-20（America/Vancouver）。基于已审查提交 `5a910afad79eef6bfbe527c6b96e4dea2e7e9cd0`，按用户后续明确授权执行。**交付可独立运行的 3D 实验及证据，等待审查；不声明完整 P2 通过，也不进入 P3/P7。**

## 1. 范围、运行与模块

代码位于 [experiments/scene3d](../../experiments/scene3d/README.md)。目录拥有独立 package.json / 锁文件 / TypeScript / Vite 配置，Vite 仅服务 web 根；没有正式应用根工程、React、世界/物理引擎或部署流程。根生日 README、原始会话、docs/p1 与 experiments/placement 均未修改。未修改 .gitignore；生成目录仅在本地 .git/info/exclude 排除。

同步更新的当前索引/规划：`AGENTS.md`、`docs/project-proposal.md`、`docs/architecture.md`、`docs/development-roadmap.md`、`docs/decisions-and-research.md`、`docs/3d-scene-plan.md`、`docs/requirements-audit.md`。只更新首轮授权/交付状态与证据入口，不修改 B/3D、原版 GUI 或其他既定需求。

精确版本：Three.js **0.186.1**、Vite **8.3.4**、TypeScript **7.0.2**、@types/three **0.186.0**、@types/node **26.6.5**。已有 Node **25.2.1** / npm **11.6.2**；依赖从 npm 注册表安装并由 package-lock 记录完整性。没有更换产品架构或安装客户端/额外系统工具。

在 experiments/scene3d 执行 `npm ci`、`npm run build`、`npm run preview`；直开 `http://127.0.0.1:4178/game/`，独立首页为 `/`。完整检查和子路径命令见实验 README。

| 模块 | 实际职责 | 边界 |
| --- | --- | --- |
| domain.ts | 不可变布局、稳定 ID、有限整数坐标、四/五朝向、合法性、派生漏斗端口、存档校验 | 无 Mesh/DOM；无物品数量、炉加工或传输调度 |
| scene-adapter.ts | WebGL2、透视相机、真实几何/材质/光照/深度、稳定 ID→Group、射线/面、预览、选择、释放 | 不自行保存领域世界或授予产品物品 |
| debug-models.ts | 平色调试台/炉/高炉/空心漏斗；几何所有权、共享材质 | 原创示意几何，不是原版模型；不进入正式资产候选 |
| main.ts / labels.ts | 英文外置实验文案、真实指针输入、屏幕二维面板、独立 localStorage、可见诊断 | DOM 只做 GUI，画布目标没有二维点击热区 |
| model-format.ts / tools | 同版模型的离线父继承/纹理引用/几何/状态变换探针 | 浏览器入口不引用；原始资产仅在仓库外 |
| browser-checks.ts / metrics.ts | 真实浏览器 GPU 断言、原始 RAF 采样 | 不把合成事件当实体鼠标，不把帧间隔当 GPU 时间 |
| tests / audit-build | 纯规则/模型/释放、根与子路径 HTTP、白名单与首页依赖图 | 测试期本地静态服务，不是 Pages 部署 |

坐标合同：一格一单位、Y 向上、north=-Z、east=+X、south=+Z、west=-X，逻辑原点为单元最小角；可视模型以 (.5,0,.5) 为旋转基准。方块面法线转到世界空间后选择主轴；普通表面按 epsilon 后 floor 处理负坐标，设备面按稳定根实例单元 + 法线计算，避免非立方体内部面落回同格。

夹具 x=-4..4、y=0..3、z=-3..3，两个金色保护位置，一个非交互红色遮挡物，三个作者相机预设。**这些数值/保护规则/直接调试授予/悬空放置均不是产品要求。** 正式建造区、支撑约束、摄像机/手势由 P2/P7 后续审查。

## 2. 需求与验证覆盖

| 用户本轮项 | 本次结果 | 未宣称的内容 |
| --- | --- | --- |
| 1 最小 TS/Vite/Three/WebGL2 | 精确版本锁定，独立 adapter，实际 WebGL2 浏览器运行 | 未批准 React 或完整应用工程 |
| 2 真正实时局部三维 | PerspectiveCamera、MeshStandardMaterial、几何、光照、深度/遮挡 | 无背景图片/CSS 透视/P1 二维界面；未制作四场景 |
| 3 26.3 模型可行性 | 原版 stone/furnace/hopper 17 状态离线 CPU 几何断言通过 | **原版模型在浏览器中显示为未验证**，贴图/视觉及分发未解决 |
| 4 相机射线、面、预览 | 最近真实表面/不可交互遮挡、相邻面位置、三维合法/非法预览 | 透明纹理、边缘/背面全矩阵、触控和多 DPR 尚缺 |
| 5 B 多实例/方向/拆除/邻接 | 多实例状态与渲染分离，上输入/侧燃料/下抽取派生连接 | 不是漏斗五槽数据流、燃料/加工规则或正式防软锁完成 |
| 6 屏幕二维 GUI | 三空槽示意面板和模态输入门禁 | 原版 GUI、配方书、快捷键矩阵、焦点管理未实现 |
| 7 真实浏览器和性能 | 13 项浏览器断言、物理点击记录、两负载原始 RAF 与释放证据 | 非目标设备验收，无烟花/原版纹理联合负载、纯 GPU 时间或准确显存 |
| 8 双入口及产物隔离 | 根/仓库子路径 HTTP 与构建白名单通过，首页依赖图隔离 | 未上线 Pages，不假设私有仓库等于站点私有 |

D04/D05：本轮没有无限目录、临时组、领取、剩余物或批量加工，未替任何候选定案。D06：没有发现策略。D07：只使用实验独立布局保存、拆除删除实例；不保存光标/槽位内容，因为本轮没有这些系统；不影响正式适配状态。

## 3. 原版资源证据与许可边界

沿用 P1 官方构件的 Java **26.3 client SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`**。本次重新按完整 JAR SHA-1 校验后，从仓库外构件提取 16 个 JSON（3 blockstates + 模型父依赖），解析并核对 8 个 PNG 依赖的存在/哈希，不将 PNG 导出。未下载或运行客户端，没有接受新许可，也没有将“可取得”当成可分发。

实际分析路径：

- 输入：`C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p1-20261020/client.jar`。
- 外部提取：`C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-models-20261020`。
- 仓库内证据：[model-probe.json](evidence/model-probe.json)，只含资源路径、哈希、尺寸/数量、断言摘要，不含原始模型 JSON、像素或转换顶点。

| 样本 | 实际核对 | 结果/限制 |
| --- | --- | --- |
| stone 4 状态样本 | 父继承、纹理变量、6 面/12 三角形、单位边界、有限 UV | 通过；不是贴图视觉对照 |
| furnace 8 状态样本 | 四方向 × lit，独立 north/east/south/west 前面法线预期，依赖与几何 | 通过；lit 贴图仅依赖解析，没有浏览器显示/亮度证明 |
| hopper 5 朝向样本 | 多元素、状态变换、真实 BufferGeometry，向下射线穿过上开口命中内部高度 | 通过；证明非完整立方体几何可解析，不证明所有可视/命中政策一致 |

转换器支持继承、子元素覆盖、纹理 # 引用、显式/默认面 UV、面 UV 四分旋转、variant x/y 四分旋转；对 UV-lock、element rotation 显式报错。multipart、AO/色调、透明/镂空/动画、特殊模型/实体均未覆盖。高炉/工作台本轮只提供调试模型，未做其原版转换探针。

结论分层：**已核实事实**是这些同版输入能够经过受限转换、CPU Three.js 几何/射线断言；**工程建议**是继续采用开发期转换并由 adapter 实例化；**未验证假设**是完整资产闭包、UV 视觉、照明/透明与 Java 画面可保持一致。合法来源/分发依据仍须按具体清单落实，不能把原版资源直接放入公开运行产物。

## 4. 测试、性能与截图证据

自动检查：TypeScript 严格检查通过；[单元 20/20](evidence/unit-tests.txt)、[HTTP 2/2](evidence/http-tests.txt)、根/子路径两次构建与产物审计通过。浏览器检查 **13/13，0 失败**，详细独立预期与原始结果见 [browser-baseline.json](evidence/browser-baseline.json)。浏览器检查包含真实 WebGL2 绘制、透视、前墙遮挡、正 Z/上方面、拆除露出后方、预览不命中、端口、旋转断连、炉前面朝东、删除映射、12 次几何增删回基线、模态门禁。

真实浏览器使用 Codex in-app browser，通过可见 DOM 诊断读取状态与证据，实体点击通过浏览器输入 API 执行；没有从后台隐藏状态虚构测试。13 项中 B13 使用直接分发的合成 PointerEvent 特意挑战门禁，物理 GUI 点击另外记录，二者区分。截图是辅助视觉证据，交互通过领域状态/命中 ID 记录，性能通过原始 RAF 样本证明。

性能环境：Windows，Intel i9-12900H（14 核/20 线程），Chromium **155.0.0.0**，WebGL2 / ANGLE Direct3D11，实际后端 **NVIDIA GeForce RTX 3080 Ti Laptop GPU**，Windows 驱动 `32.0.16.1714`。CPU/驱动来自本机只读 CIM，GPU 使用者来自实际 GL renderer 字符串。CSS 画布 **310×610**、DPR **1.25**、实际 backing **387×762**，Angle 相机；这是窄侧栏测试，未覆盖 Vincent 的桌面分辨率或其他引擎。

每个负载三次，各预热 2 秒、采样约 10 秒；原始 `frames`、p50/p95/max/FPS、环境和资源计数均保存。**此初测短于完整 P2 建议 30 秒/60 秒协议，没有正式预算批准。** 不把高刷新率或计数等同显存/GPU 时间/点击延迟。

性能数值、物理点击、渲染器重建和截图索引在 [browser-results.md](browser-results.md)。构建完整字节和 SHA-256 见 [root-build.json](evidence/root-build.json)、[subpath-build.json](evidence/subpath-build.json)。游戏 chunk 约 555 KB（未压缩，Vite 发出 >500 KB 提示），首页 JS 依赖闭包 3,525 bytes，不包含 Three 场景 chunk。该提示没有隐藏；是否分包/压缩/按需加载等待真实资产与预算后评估。

构建同时输出 Vite 生成的 `THIRD_PARTY_LICENSES.md`（1,187 bytes），保留实际 bundled Three.js 的 MIT 文本；白名单和 HTTP 测试校验其存在及内容。最终构建记录见 [build.txt](evidence/build.txt)、[build-subpath.txt](evidence/build-subpath.txt)。许可输出没有改变采样对应的 game JS 哈希 `794c11f11b19557437e4faaea8bd3ce3db180e8617c44a8528ee348af0cc514d`；这份第三方库许可不覆盖 Minecraft 资产。

已遇到并排除的执行问题：严格类型检查暴露无效 Box3 方法/未用导入；PowerShell 解析空 blockstate variant key 需保留空键的 hashtable；零尺寸初始化导致投影无效，现对尺寸钳制并在 ResizeObserver 后更新诊断；窄面板溢出已调整。这些问题不作为通过项。最终报告只统计实际执行后的结果；没有 Java 客户端测试结果。

## 5. 未解决门槛与审查建议

1. **原版视觉/分发仍阻断正式资产集成**：原版 browser 展示、UV/透明/AO/动画、高炉/工作台/实体、原版 GUI/字体和声音的具体路径与使用依据。下一次只在明确许可边界内运行原版资源验证，不把本轮调试模型转正。
2. **完整 P2 仍未完成**：原版 GUI 和快捷键、五种烟花 + trail/twinkle、音频及联合性能，多个 DPR/视口/引擎、冷加载/解码/拾取延迟、完整场景进出/自动上下文丢失恢复。显式销毁重建不等于驱动重置自动恢复。
3. **输入/场景设计仍待审**：相机可选范围、正式左右键/旋转手势、每场景区域与支撑规则、遮挡/透明/非立方体空隙选择政策；本轮三预设及按钮仅诊断操作。
4. **正式状态合同仍待批**：D04–D09；不能把布局 localStorage 或直接调试授予解释为完整库存、关闭/拆除剩余物或发现策略已定。漏斗真实物品传输仍由 P1 参考、P6/P7 正式实现承担。
5. **P7 仍需完整四场景集成**：自然补货/种植/实际必要来源/视觉软锁、数据闭包与原版材质、正式实例内容存档和传输。两个保护格只证明拒绝逻辑，不证明主线不会卡关。

工程建议保留 **Three.js + WebGL2 的独立适配器方向**：本轮没有实质兼容阻点，领域坐标/ID、Raycaster 和渲染所有权已可分离；不需要世界引擎。尚不足以冻结完整 P2 或宣称正式原版视觉/目标设备性能通过。复用时优先保留合同/测试与适配器边界，实验控制器、调试素材和夹具不直接升格为产品。

当前只请求审查这一技术切片及证据。本地提交后停止；后续原版资产/GUI/粒子音频验证或 P3 均需下一轮明确范围授权，不自动续做，不推送或部署。
