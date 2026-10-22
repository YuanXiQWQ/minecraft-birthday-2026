# 有限缺料、耕地放置与 Steve 证据定向修复

基线 `f31d7069816045ff44f35f15cfae5823090822da`。仅处理指定缺陷及相关回归；不改变现有有限背包/合成/炉/生日合同，不进入 P9、不部署。原截图、失败记录及此前报告保留。

## 1. 有限材料幽灵

正式旧 `RecipeBookView` 配合真实 `GameInventory` 和 `SaveSession` 复现：仅持一个木板、真实四格为空，四次幽灵背景均为 `#ffffff30`，没有任何红色缺料格；真实结果仍为空。见 [baseline-reproduction.log](baseline-reproduction.log)。复现直接加载 Git 基线的完整生产类，临时模块已移除，不是测试中重写算法。

新增 `analyzeOwnedRecipe`，实际填料、可制作筛选和幽灵提示共用同一材料分配。每份有限数量仅分配一次；输入组固定在原格，27+9 是独立可分配池，光标不参与。按组件身份扣减组，重叠标签回溯求完整分配；缺料时求最大可满足子集，避免先占用稀缺候选的贪心误判。冲突掩码与缺料掩码分开：异物输入提示英文 `Existing inputs conflict with this recipe.`，不把冲突伪装成全缺料。幽灵不修改任何槽位或存档，不覆盖真实输入/结果。

- 木板 1/3/4：分别缺 3/1/0 格；奶桶 1/3：蛋糕分别缺 2/0 桶。
- 输入已有九木板只满足它所在的一格，不能挪用到另三格；背包与快捷栏余料按数量补足。
- 重叠 coal/charcoal 候选、组件不兼容、Shift 有界及失败无修改均有正式测试。
- 正式 UI 方法测试实际记录绘制颜色，不只检查填料抛错；跨会话补料、首次领取、冲突、重置和旧生命周期均覆盖。

浏览器在隔离验证来源使用夹具仅准备解锁资格、有限一木板和设备；后续操作走 `/game/` 的真实鼠标/键盘。不是重新声称从无授物新档走完整主线。

| 实际页面证据 | 结果 |
|---|---|
|[一木板全页](evidence/ghost-1-plank-full.jpg)、[状态](evidence/ghost-1-plank.json)|一个可用格、三个红格，四个真实输入及真实结果为空|
|[另一标签补足后全页](evidence/ghost-cross-tab-sufficient-full-v2.jpg)、[状态对照](evidence/ghost-cross-tab-v2.json)|原菜单/幽灵不重开，四格全部可用，27+9 中实际四木板；随后可信点击填料并领取工作台|
|[实际填料领取](evidence/ghost-filled-and-acquired-full.jpg)|真实输入成功，光标取得工作台|
|[同场景远端重置前](evidence/ghost-same-scene-before-reset-full.jpg)、[后](evidence/ghost-same-scene-after-reset-full.jpg)、[状态](evidence/ghost-same-scene-reset.json)|另一标签通过正式设置确认重置；原菜单不关闭、不刷新，旧幽灵消失|

`ghost-cross-tab.json` / 第一张同名无 v2 截图是提交尚未投影时的即时观察，仍记录旧数量；不是补足成功证据。有效补足证据使用 v2，在实际提交及跨标签投影后检查。首次 `ghost-4-planks-before-fill` 已切换菜单，因此无幽灵，也不作为同生命周期更新证明。`ghost-before/after-remote-reset` 是Farm重置到Plains引起菜单关闭的记录；同场景保持打开的有效序列使用 `ghost-same-scene-*`，不混用。

## 2. 原版非完整高度耕地

[旧正式路径复现](baseline-farmland.log)：实际原版模型/相机射线得到 `point.y=-0.0625`、支撑逻辑格 `[-5,-1,-2]`；旧放置得到 y=-1 无效，旧 Use 发出 `plant-crop`，没有放设备。

`AuthoredWorld` 为批量地形保存每实例逻辑格，为耕地及自然方块保存逻辑格；`SceneView.hit` 从真正命中的实例/父对象取支撑身份与面。`placement` 对逻辑格加真实面法线，预览与提交共用该函数。未改模型高度、未扩大 epsilon、未划禁建资源区。水模型明确标记非实心支撑，原领域水域/占用/支撑/代次检查继续生效。设备（含漏斗凹槽）仍按实例方格和实际命中面计算。

`WorldUse.use` 仅在命中耕地且实际选中种子时播种；持允许设备进入正常放置；其他持物不发播种命令。已有作物/设备仍按领域占用拒绝覆盖。

[实际世界操作状态](evidence/world-actions.json)包含：
1. 普通鼠标右击真实 15/16 耕地，工作台落在 `[-5,0,-2]`；刷新仍为同 ID/坐标，真实设备可打开。
2. 石镐/按住左键挖掉，依次在同一耕地放熔炉和漏斗，打开对应 GUI，再耗时拆除。
3. 同地块持种子右击播种；换工作台再次右击，作物保留且不新增实例。

画面：[工作台放置](evidence/farmland-table-placement-full.jpg)、[工作台 GUI](evidence/farmland-table-open-full.jpg)、[熔炉 GUI](evidence/farmland-furnace-open-full.jpg)、[漏斗 GUI](evidence/farmland-hopper-open-full.jpg)、[真实播种](evidence/farmland-planted-full.jpg)。

新增 7 项射线/正式接线测试实际调用 `AuthoredWorld.build`、原版模型编译器、`SceneView.pick/hit`、`WorldUse` 及真实 `SaveSession`。含三种设备、原版 dirt_path 非完整高度、负坐标/边缘、水面实际射线、并发占位、重置和切场景后的迟到提交。原设备/漏斗面射线、挖掘与输入安全测试保留。

## 3. Steve：证据失败而非已证实人物消失

[旧证据逐文件审计](evidence/historical-steve-audit.json)确认：`steve-left.jpg`、`steve-top-left.jpg`、`steve-bottom-right.jpg` 是 147×210 单色图，**无效**。`pose-initial-*` 还有五张单色图（具体文件见 JSON），原来已标失败，继续保留。其余旧局部图非空并不单独构成姿态正确证明。

本次以相同截图接口复现：`steve-repair-up-full.jpg` 同帧完整 GUI 清楚显示 Steve，但随后按实际 DOM 预览边界调用浏览器 clip，`steve-repair-up-local.jpg` 返回纯背景；另有 top-left/bottom-left clip 同样失败。完整 GUI 和模型始终显示，所有实际 DOM 边界均有效。此处证实的是截图局部截取路径异常；旧样本缺少同时全页和逐帧边界，无法完全逆推出旧图的单次内部原因。没有证据支持重写人物渲染系统。

有效证据采用九张 **未修改全页截图作为主证据**，配套局部仅从对应全页按当帧 DOM 边界裁切（不放大、不插入像素、不补人物）。[原图哈希、裁切框与方法](evidence/steve-verified-crops.json)可复核；失败 clip 原图保留，[像素审计](evidence/steve-pixel-audit.json)明确识别三张无效新 clip。不会把这些失败图计为通过。

[九姿态元数据](evidence/steve-repair-poses.json)逐项记录实际指针、面板/预览窗口、1280×720、GUI scale3（147×210 预览）、DPR1.25、实际盔甲/双手和相对头身姿态。逐张查看有效局部：头/身体/四肢、铁盔甲、石镐及副手桶均实际存在，左右/上下与四角产生对应观察差异；没有裁掉头脚。详见 [截图索引](screenshots.md)。

另有无装备、卸下头盔、切换主手炉子、1440×900 与 560×820（书覆盖后返回容器）完整截图。未修改玩家模型/皮肤/装备资源或姿态参数，没有引入新上下文/监听器。Java26.3客户端逐帧姿态/光照一致性仍待外部对照；本次截图不使它自动通过。

## 4. 生日闭环针对性冒烟

[实际操作状态](evidence/birthday-smoke-actions.json)：隔离夹具准备资格后，真实目录取三桶奶与有限糖/蛋/小麦→普通放置工作台→书搜索蛋糕→实际有限填料→领取蛋糕。领取时 `completed=false`；蛋糕放入真实快捷栏后切 Home，用所持蛋糕右击真实桌面，保存成功后庆典开始。五形状均出现在活动时间线；20秒结束 active=false、粒子/voice=0、created/released=1/1。另一同源主页显示蛋糕；正式设置重置后两页均为空桌。音频 ready 只算浏览器激活/调度，不宣称人工试听。

[填好蛋糕](evidence/birthday-cake-filled-full.jpg)、[放桌庆典](evidence/birthday-table-celebration-full.jpg)、[主页同步](evidence/birthday-home-synchronized-full.jpg)、[重置后主页](evidence/birthday-reset-home-full.jpg)。保留原来不授物的新档完整流程证据，本次不拿夹具补资格冒充完整新档主线。

## 5. 检查与边界

- 正式类型检查；341 项正式测试（原324全部保留，新增17）；原24项领取时序、11项炉队列、21项设置、9项书生命周期等均保留通过。
- P4 数据验证：113物品/112可达配方、2042分类及导出哈希一致。
- P2关键回归48项。
- 根路径/Pages构建，643份原版资源及2份规则资源逐字节审计；测试夹具、开发资料不进入普通构建。两路径HTTP入口、资源字节及内部路由404检查通过。
- 普通生产预览也实际打开根与Pages的个人GUI/Steve，非verification构建：[根原图](evidence/normal-build-root-player-full.jpg)、[Pages原图](evidence/normal-build-pages-player-full.jpg)、[状态](evidence/normal-build-paths.json)。
- 日志：[正式测试](formal-tests.log)、[类型](typecheck.log)、[P4](p4-data.log)、[P2](p2-tests.log)、[根构建](root-build.log)、[Pages构建](pages-build.log)、[HTTP](http.log)。保留目标测试初次断言/测试夹具错误、类型检查初次失败；均不冒充通过记录。未删除安全断言以求通过。新日志仅规范化行尾空白，捕获/存储哈希见 [日志来源](log-provenance.json)；历史报告及旧截图字节未改。
- 浏览器为本机 IAB Chromium155，可信 AX/Playwright 原生鼠标点击、按住、键盘；只读 DOM 观测。不是 dispatchEvent 合成输入。1280×720 原始 DPR1.25；显式1440×900/560×820时浏览器报告DPR约1。未声称完成真实OS失焦/最小化、右/中键实体拖动、其他浏览器或低端GPU验收。

修复未要求存档迁移/清用户档；`p8-inventory-1` 和既定合同保持。仅隔离验证来源执行过明确的测试重置。停止等待独立审查。
