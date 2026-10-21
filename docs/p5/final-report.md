# P5 有限范围功能收尾与P6接口交接

日期：2026-10-21。用户已审查D07提交`c05387f`，只授权补齐G17、G18、个人2×2输入及回归。已通过的D04/D07、完整输入状态机及稳定存档不重做。旧报告和原始失败/证据文件不改写。本次不进入P6，不部署。

## 实际补齐

1. **G17外侧点击**：现有`drop{cursor:true,all}`领域操作现在接上浏览器输入。鼠标在GUI外按下并于外侧释放，左清整组、右减一个；中键无丢弃。独立OutsideClick只提交静止、匹配按钮的外侧点击；从槽位拖出、超4CSSpx移动、异常按键、关闭/失焦/取消均不能变成外侧删除。保护整个dialog（包含边框、标签、Done、提示）与可见Tooltip，额外2CSSpx边缘保护，关闭不派发外侧drop。取消时释放所拥有的捕获。永久解锁不变，无掉落实体。
2. **G18总览**：复用`player.data.presets[9]`，不增加预设存档。原版creative背景、9列/5个可见行、滚轮/原版滚动精灵配透明语义range、空组对角信息纸、原版图标/数量/Tooltip。九行都能访问，C/X仍用已审查的保存/加载命令；复制单元由preset/cell引用读取权威预设，复制不会修改预设，重验解锁、组件和原上限。空组提示不可取得；空白不是有限库存槽，沿用项目来源操作适配，不新增Java完整创造库存系统。
3. **个人2×2输入**：独立Crafting页使用已有原版`container/inventory.png`及原版槽位；四个真实输入、当前装备/副手、无限目录和九格在屏幕二维平面。取放/拆半/合并/交换/拖动/数字/F/有限Shift复用原SlotPolicy及状态机。没有可领取结果，不调用配方引擎、不授物、不发现配方、不处理剩余物。角色预览仍为空，不宣称新增人物模型。
4. **退出/事务**：PersonalCursor同一epoch现在同时保护光标与四输入。`editInventory(intent,cursor,expected,crafting?)`在原共享锁中处理新鲜稳定布局；返回页内临时组，`layout()`显式剥离cursor/crafting，存档严格字段仍拒绝它们。pagehide/关闭/重置清个人格；仅失焦/PointerCancel取消未提交动作而保留当前组。格式仍p5-layout-1/player1，P3迁移不变。设备内容仍Reserved0，按已批D07留P6/P7。

## 原版证据及明确差异

输入仍为已核验client SHA1 `e877b6a07acd633fb3bb475002175cec036e7b87`，复用已有JDK25 `javap -c -p`只读查看，没有启动Java客户端或安装依赖。[证据指纹](evidence/final/native-evidence.json)记录同版class和GUI资源SHA256。

- `CreativeModeInventoryScreen.hasClickedOutside`字节码0–79：容器半开矩形、排除所选标签。`slotClicked`1171–1316：有carried且outside才丢弃，原button0整组并清carried、button1 split(1)。DOM按钮0/2是左右键，不能照抄客户端0/1。项目按用户边界删除临时组，不生成原版ItemEntity。
- 原版HOTBAR页读取HotbarManager九组；空组有锁定用途的信息纸，ItemPicker五行滚动。项目使用原九组数据和信息提示；世界移动、能力切换、完整生存背包不加入。创造来源已审查的项目适配保持，不宣称空白/异类来源等所有原版slotClicked分支一致。
- 原版个人菜单会返还/掉出临时组；D07已明确选择关闭清光标和个人格。这是批准适配，不标为Java实机一致。G17外围矩形在网页加入导航/Tooltip保护，避免将网页扩展控件当作世界丢弃区。

## 自动化与真实浏览器

| 检查 | 结果/证据 |
| --- | --- |
| 类型 | 通过，[check.txt](evidence/final/check.txt) |
| 正式单元/存档/规则 | **84通过，0失败/跳过**，[unit.txt](evidence/final/unit.txt)。含9项新增测试：外侧边界、取消、预设组/组件、四格与数量/权限、锁内临时事务、全113锁定反例、真实GameInventory方法的延迟个人格关闭隔离、旧事务等待中重置后立即使用个人格；原P3/稳定布局/迁移/重置测试保留 |
| P4 | 113物品/112可达配方/2042分类/18步蛋糕证明及哈希通过，[data.txt](evidence/final/data.txt)；无P4数据或配方规则改动 |
| P2关键回归 | **48通过，0失败/跳过**，[p2.txt](evidence/final/p2.txt) |
| 普通根/Pages构建 | 两构建和审计通过，[根](evidence/final/build-root.txt)、[子路径](evidence/final/build-pages.txt) |
| 实际HTTP | **2通过**，[built-http.txt](evidence/final/built-http.txt)：逐字节478资源/清单及规则文件，排除docs/AGENTS、实验、客户端、测试入口和内部数据全集 |
| 普通dev/构建浏览器 | 4183、4185、4186子路径均实际打开个人四格与预设页，113图标初始化，锁定主线仍18，滚动条End到4、焦点E能关闭、无控制台error，[built-browser.json](evidence/final/built-browser.json) |

本次真实环境为Windows Chromium155。1280×720/DPR1.25使用GUI3×；显式1440×900与700×600视口观察DPR约1，个人板528×498/352×332，导航、格子和文本可见，[布局记录](evidence/final/layouts.json)、[1280个人](evidence/final/crafting-1280.png)、[1440个人](evidence/final/crafting-1440.png)、[700个人](evidence/final/crafting-700.png)、[1280预设](evidence/final/presets-1280.png)。这不是所有DPR/设备/引擎都通过。

可信输入证据与规则测试分开：

- [trusted-initial.json](evidence/final/trusted-initial.json)：32光标外右击变31；经真实左拖跨三个人格各加10、余1；边框未减少组；拖出界不提交/不丢弃，随后外左击余1→空。记录器Look初始及结束均为null，不将它当作相机矩阵或实体右拖隔离测量；相机门禁沿用原代码与回归，实体右拖仍待人工。
- [trusted-presets.json](evidence/final/trusted-presets.json)：原生滚动条左拖到底，第九预设10组点击复制10、数字复制到第8格为64；C9及刷新保留源数据，复制不消耗预设。
- [trusted-close.json](evidence/final/trusted-close.json)：分别E/Esc/Done从非空光标/个人格关闭，都为空，稳定九格/头盔/副手保留。刷新前后见[before](evidence/final/trusted-before-refresh.json)、[after](evidence/final/trusted-after-refresh.json)。
- [native-delayed-close.json](evidence/final/native-delayed-close.json)：既有验证按钮持有真实Web Lock约1.5秒期间，可信点击个人格并Esc关闭；锁释放后重开仍无光标/个人格复活。这是测试夹具控制调度，未伪装为人工自然发生的竞态。
- [native-lock-pickup.json](evidence/final/native-lock-pickup.json)：同槽两个协作session一成功、一inventory-conflict，游戏标签收到稳定更新而保留自己的个人格。随后[reset](evidence/final/native-lock-reset.json)拒绝旧代次命令；[另一标签上的GUI](evidence/final/after-other-tab-reset.json)清空光标/四格/稳定布局，[锁定路径](evidence/final/trusted-reset-locked-paths.json)中中键/数字/X9不能复活旧物品。原生Web Locks与storage同步实际执行，但不是两名用户同时物理点击。

实体右键拖动、中键拖动、拖动中Esc、真实窗口失焦/最小化、PointerCancel及跨引擎没有新增通过声明；没有重复尝试不支持的工具，没有用合成DOM事件充当实体操作。最终逐行状态见[覆盖矩阵](final-coverage.md)，剩余人工步骤见[清单](manual-checklist.md)。没有启动Java客户端。

中间检查曾因新增两张原版滚动精灵而使资源数量断言仍预期476失败；已将预期更新为478并保留逐文件哈希检查，最终测试通过，不是删除审计。新增测试类型检查的未用导入/断言窄化问题也已消除。旧报告、截图与原始失败记录不覆盖。

## 资源与复现

新增原版`scroller.png`和`scroller_disabled.png`两文件；inventory.png已在P2 cohort中，本次加入catalogue加载依赖。资源共**478文件/清单**，catalogue段363条、401依赖；[catalogue-manifest](../../resources/minecraft/26.3/catalogue-manifest.json)保存输入、版本、字节及哈希，导出器可从同一已校验客户端复现。113默认图标/字体/Tooltip正常Git/build，不增加外部缓存限制。没有扩展复杂组件、人物模型或正式加工资源。公开发布权利仍独立审查，本次无部署。

普通运行`npm --prefix app run dev`→4183/game/。完整取放验证用`dev:verify`→4184/__verify__/index.html的Fixture: unlock catalogue，再开同源/__verify__/input.html；验证入口不进普通构建。三个菜单标签与C/X共用同一布局，Crafting只显示输入。外侧点击按住后拖动不会丢弃，静止左/右点击才提交删除。

## 进入P6的技术建议

**P5代码功能已经足以支持进入P6，建议在用户审查并另行授权后推进。** 依据是：可复用槽位权限/有界状态机已经覆盖目录、九格、装备和个人输入；临时与稳定载体边界明确；真实锁、关闭/重入/刷新/重置及普通资源构建有证据；本次三项代码缺口已补齐，无已知必须先修的P5工程阻断。

这不是“全部原版操作及人工验收通过”。实体/跨环境项继续保留，并在P6工作站集成后对同一状态机复验；公开交付前必须收敛。P6结果/余留/续燃/有界批量须先明确D05，配方书须明确D06，设备计时按D08另审；不能把输入基础当作这些产品决定。设备内容版本/迁移、站点路由/结果onTake仍是P6工作。本次提交后停止，不自动进入下一阶段。
