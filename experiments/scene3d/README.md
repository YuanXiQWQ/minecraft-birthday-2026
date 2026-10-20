# P2 第一轮：独立实时 3D 技术切片

本目录是隔离实验，不是正式游戏或完整 P2。验收结果与原始证据见 [P2 报告](../../docs/p2/report.md)。不引用 P1 二维界面，不自动进入未来正式构建。

## 运行与检查

使用已有 Node 25.2.1 / npm 11.6.2 验证。所有命令在本目录执行：

```powershell
npm ci
npm run check
npm test
npm run build
npm run build:subpath
npm run test:built
npm run preview
```

浏览器打开 `http://127.0.0.1:4178/` 或独立的 `http://127.0.0.1:4178/game/`。开发时可用 `npm run dev`，与 preview 使用同一端口，不能同时运行。子路径产物另用 `npm run preview:subpath`，访问 `http://127.0.0.1:4179/minecraft-birthday-2026/game/`。未创建部署工作流。

依赖精确版本及完整性见 package.json / package-lock.json：Three.js 0.186.1、Vite 8.3.4、TypeScript 7.0.2；没有 React、物理引擎、世界框架或浏览器自动化依赖。

## 浏览器复现

默认画布填充页面主视区，从场景内部眼高观察，主要内容居中，无准星。点击 `Developer tools` 展开下列实验工具，可再次收起；网格/邻接线随开发面板显示。Front/Left/Right 是眼高诊断观察站，不能作为正式视线手势决定；本原型没有 Pointer Lock、WASD、飞行或拖动转视线。材质与环境树木/石块均为明确标识的调试几何，不能计作原版模型通过。桌面实测见[第一人称修正报告](../../docs/p2/first-person-review.md)。

1. `Inspect` 点击真实设备打开屏幕二维占位面板，点击面板按钮时检查状态的 `pointerEvents` / `actions` 不变；关闭或 Escape 返回场景。
2. `Place`，选择设备，移动指针显示带深度测试的三维预览；左键确认。`Rotate preview` 调整候选方向；`Rotate selected` 调整已选实例。普通设备四方向，漏斗另有 down。
3. `Remove` 点击真实设备拆除。改变相机预设验证遮挡和深度，不允许穿过红色障碍物选后面的设备。金色保护块和越界位置不可建造。
4. 初始七实例显示上方供料、侧面燃料、下方抽出及漏斗容器邻接。旋转、拆除后检查 `Derived ports`；这些线段是诊断标记，不传输物品，也不参加拾取。
5. `Save layout` / `Load layout` 使用独立 localStorage 键 `minecraft-birthday:p2-scene3d:layout-v1`，保存 ID、类型、坐标、方向，不保存 GPU 对象、预览或正式游戏进度。刷新不会自动加载，需点击 Load。
6. `Run browser checks` 运行 17 项真实 WebGL2 断言；B13直接分发合成 PointerEvent 验证模态门禁，不能冒充真实指针。B14–B17验证眼高、中央构图、偏心射线与各实例可见面；物理点击证据另记。B07单独使用顶面探针相机，不是可选择的产品视角。
7. `Measure 3 × 10 s` 固定当前布局，三次各 2 秒预热 + 10 秒采样，在可见页面保持前台，查看原始 RAF 帧间隔、分位数、draw calls 等。`Load dense fixture` 后再测；此初测不替代正式 30 秒预热 / 60 秒采样及目标设备联合负载验收。
8. `Restart renderer` 释放旧 renderer、几何、材质、观察器和 canvas，用同一逻辑布局创建新实例；检查释放记录，再点击新场景确认仍可操作。

## 原版模型的隔离分析

**浏览器完全使用自行编写的平色调试几何，没有原版模型/贴图/字体/声音。它们不是正式替代资产。**

已有同版原始 client.jar 时，用 PowerShell 7 在仓库外提取少量分析样本：

```powershell
pwsh -File tools/extract-model-samples.ps1 -Jar '<外部 client.jar 绝对路径>' -Output '<仓库外的新分析目录>'
npm run probe:models -- '<同一分析目录>'
```

脚本要求 client SHA-1 为 `e877b6a07acd633fb3bb475002175cec036e7b87`，拒绝输出到仓库内，只提取 stone/furnace/hopper blockstates、模型与父依赖；PNG 只读取计算哈希，不导出。CPU 几何探针解析父继承、贴图变量、面/UV 和状态朝向，用 Three.js BufferGeometry / Raycaster 验证尺寸、炉前面与漏斗开口。输出仅路径/哈希/统计/断言结果，不输出原始 JSON、像素或转换顶点。

`model-format.ts` 没有浏览器入口引用，也没有原版资源静态拷贝。元素旋转、UV-lock、multipart 显式不支持；未做真实贴图视觉对照、AO/动画/透明适配或实体模型。没有启动 Java 客户端，没有获得资产分发依据。

## 简化边界

- 一个局部夹具；四场景、正式布局/容量/摄像机手势未实现。
- 有限整数坐标、稳定实例 ID、方向、派生端口与固定保护格；允许区域中的悬空放置仅为实验，不确定产品支撑规则。
- 直接授予调试放置能力；没有永久解锁、临时物品组、配方/炉加工/漏斗五槽传输、自然补货或完整防软锁。
- 二维 GUI 仅三个空白槽和输入隔离，不是原版 GUI / 原版快捷键验收。
- 未实现 GUI 焦点陷阱、完整键盘控制、失焦拖动恢复或触控适配。
- 没有粒子、烟花、音频、主页蛋糕同步或正式存档。D04–D07 仍为待审候选。
- 模型和资源释放有明确所有权；未优化 InstancedMesh/几何批次，未承诺性能或包体预算。

生成目录 node_modules / dist / dist-subpath 仅在本地 `.git/info/exclude` 排除，没有修改根 `.gitignore`。构建白名单及双入口 HTTP 测试拒绝开发资料、原始构件和 P1 实验输出；部署时仍必须只选择审核后的静态产物目录。

Vite 的许可输出在两个产物中生成 `THIRD_PARTY_LICENSES.md`，包含 bundled Three.js 的 MIT 文本；这与尚未落实的 Minecraft 资产使用依据无关。游戏 chunk 的 >500 KB 构建提示如实保留，不通过提高阈值掩盖。
