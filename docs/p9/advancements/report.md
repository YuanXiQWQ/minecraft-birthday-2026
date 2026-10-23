# Java 26.3 原版进度

本次在当前 main 上实现现有玩法可完成的七条进度，另保留不可完成的农牧业根节点用于原版树展示。没有增加玩法、物品、配方或奖励；聊天采用[用户最新要求的原版进度公告](../advancement-chat/report.md)，普通取得不再使用自定义消息。生日桌仍独立执行先保存再庆典。并行的洞穴、快捷栏和居中采矿音效成果保留。

## 原版数据与完成条件

只读使用 [Mojang 官方 26.3 client.jar](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar)，SHA-1 为 `e877b6a07acd633fb3bb475002175cec036e7b87`。未启动客户端。八个原始 JSON、石工具材料标签、GUI 和模型依赖均按原始路径提取；没有使用镜像 `_all.json`。文件大小、SHA-256、类哈希和可复现 javap 方法行号见 [native-evidence.json](native-evidence.json)，运行资源见 [advancement-manifest.json](../../../resources/minecraft/26.3/advancement-manifest.json)。

下表的 JSON 路径均相对于 JAR 的 `data/minecraft/advancement/`，ID 均以 `minecraft:` 开头；括号是原版 criterion ID。

| ID / 原始 JSON | 原版触发与谓词 | 当前真实动作 | Toast / 聊天原值 |
|---|---|---|---|
| `story/root` / `story/root.json` | `inventory_changed`，`crafting_table` 匹配工作台 | 工作台实际进入玩家槽 | false / false |
| `story/mine_stone` / `story/mine_stone.json` | `inventory_changed`，`get_stone` 匹配 `#minecraft:stone_tool_materials` | 圆石实际进入玩家槽 | 默认 true / 默认 true |
| `story/upgrade_tools` / `story/upgrade_tools.json` | `inventory_changed`，`stone_pickaxe` 精确匹配石镐 | 石镐实际进入玩家槽 | 默认 true / 默认 true |
| `story/smelt_iron` / `story/smelt_iron.json` | `inventory_changed`，`iron` 精确匹配铁锭 | 任何合法途径取得的铁锭进入玩家槽 | 默认 true / 默认 true |
| `story/obtain_armor` / `story/obtain_armor.json` | 四个 `iron_*` criterion 同一 OR 组 | **任意一件铁甲进入玩家槽即可，不要求穿戴或全套** | 默认 true / 默认 true |
| `story/iron_tools` / `story/iron_tools.json` | `inventory_changed`，`iron_pickaxe` 精确匹配铁镐 | 铁镐实际进入玩家槽 | 默认 true / 默认 true |
| `husbandry/plant_seed` / `husbandry/plant_seed.json` | `placed_block`，`wheat` 的 location 匹配 `minecraft:wheat` | 合法空耕地上成功扣一颗实际种子并生成作物 | 默认 true / 默认 true |

同版 `data/minecraft/tags/item/stone_tool_materials.json` 包含 cobblestone、blackstone、cobbled_deepslate；网页当前只有圆石可达。普通 stone、木镐、石斧、石铲及更高阶工具均不能代替圆石条件。原图标是木镐，图标不是判定谓词。

Suit Up 的同版简体中文标题是“整装上阵”。`plant_seed` 的其他六个 criterion 和原始 OR requirements 完整保留于提取数据，但没有添加其他作物行为。七条均无 rewards、frame 缺省为 task。

`minecraft:husbandry/root` 使用 `consumed_item` / `consume_item`。网页没有吃喝行为，因此该节点始终不会被本实现授予。**父节点未完成不阻止子节点播种达成；子节点也不会补全祖先。** 原版可见性允许已完成子节点的未完成祖先显示出来。

## 事务接入与存档

- `domain/advancements.ts` 只处理本次子集的原版谓词、criteria / requirements 和可见性。requirements 外层 AND、内层 OR；parent 只用于树结构与展示。
- `domain/state.ts::transition` 在所有合法命令完成后、校验与封存之前，逐项比较事务前后 41 个玩家槽：27 主背包、9 快捷栏、4 盔甲、副手。与原版 `ItemStack.matches` 对齐，比较 ID、数量和完整组件，使用现有默认 damage=0 的规范化比较。
- 每个库存 criterion 只有一个 item predicate，只匹配这次实际改变后的非空槽组，不因无关动作扫描全部已有库存。一次多槽变化逐槽处理。纯选择、预设保存、查看目录、设置和时间变化不构成取得。
- **cursor 不等于玩家槽。** 个人/工作台输入、预览、设备输入/燃料/输出、漏斗内部和预设模板都不属于该 41 槽集合。正常领取到 cursor 不授予，随后真正放入玩家槽才授予；满包只有图鉴资格时不授予。
- 数字键、F、Shift、装备、目录、预设、设备取出、合成结果、采集和关工作台返还共用此接入点。没有把 `item-unlocked`、`items-acquired`、`receipt.acquired` 或配方发现作为触发器。
- `plant-crop` 先通过已有 `plantCrop` 的位置、持物、占用和扣种子检查；只有成功走完事务才记录 `wheat`。拿种子/锄头、失败点击、成熟、收获和旧作物不产生该事件。
- `progress.advancements = {version:1, criteria:{[原版ID]:[原版criterion ID]}}` 独立保存。完成从 criteria 和原版 requirements 导出，不随物品消耗或拆除撤销。完成后不继续监听该节点，保持原版 OR 完成后的事实含义。
- `SaveSession` 保留共享 Web Locks、generation、revision、校验和与生命周期。进度与物品/播种事实同一次写入；保存成功并发布快照后才发送 `advancements-completed`。失败写入、过期布局或旧代次不会发布事件。
- 重置创建空进度、新代次并保留设置。UI 按代次清空可见和待播 Toast，普通刷新或另一个标签同步不重播旧通知。

### 旧档适配与初始化证据

保留内容版本 `p9-commands-1`，进度字段使用独立 version 1，继续走现有旧版本迁移链。只有缺少 `advancements` 字段的旧档执行一次库存同步。

同版 `ServerPlayer.initInventoryMenu` → 初始化菜单 → `AbstractContainerMenu.addSlotListener` 立即 `broadcastChanges`；`addSlot` 的 lastSlots 初始为空。`triggerSlotListeners` 用 `ItemStack.matches` 比较并逐槽调用监听器。`ServerPlayer$2.slotChanged` 排除 ResultSlot 且只接受 slot.container 等于玩家 Inventory 的槽。`InventoryMenu` 对主背包、快捷栏、装备、副手使用玩家 Inventory，对合成使用独立容器。`InventoryChangeTrigger$TriggerInstance.matches` 的单谓词分支只检查 changedItem 非空且匹配。

依据该初始化行为，旧档仅按**当前真实玩家槽**补记库存 criterion。这是项目新增字段的**迁移适配**，不是原版历史回放；不从 unlocked、设备、配方、现有作物或生日事实推断过去。旧播种无记录时等待下一次真实成功播种。

`decode` 校验原始校验和后在内存构造补充记录；`SaveSession.refresh` 在同一独占锁内将该增量静默保存一次，revision 加一，generation 和既有数据保留。写入失败保留原字节并明确进入不可写状态；没有锁时只读投影，不写盘。随后刷新不重复迁移或播放 Toast。

## 展示与项目适配

- 默认 **L** 打开/关闭进度页；Esc 和原版 Done 关闭。屏幕位于游戏视口内，使用同版 252×140 窗口、234×113 内部区、原版背景、标签、task frame、Tooltip 盒、物品模型和现有位图字体。
- 原版树可见性：完成子树中的祖先显示；未完成普通节点遵循两层祖先的 SHOW/HIDE 判断。没有任何完成时显示同版 empty / sad label。农牧业根保持原版标题、图标、未完成边框。
- 复用既有菜单背景处理和输入门禁。打开 GUI 解除指针锁并取消世界手势，关闭、失焦、页面离开和重置不复活旧手势。按项目既有合同 GUI 不暂停活动时钟；Esc 原按钮排列未改。
- 根进度不创建 Toast，其余六条为普通 task。每条使用原版 `toast/advancement`、黄色 task 标题、物品图标及白色原名；独立 ToastInstance 600ms 平方进出和 5000ms 可见时段。多行标题沿用 1500ms / 300ms 淡入淡出分段。
- 配方与进度共享原版五个 32px Toast 行，满行等待，不覆盖正在显示的通知。使用现有 `ui.toast.in/out`、UI 分类和设置；普通 task 不播放 challenge_complete，也没有经验、奖励或庆典。
- 英文标题、描述和控件文字从同版语言资源提取并外置，保留英文回退。官方简体中文来自现有锁定 asset index 34 的语言原件，沿用其 SHA-1 核验；没有混称为 client.jar 内的中文文件。没有新增语言设置选项。
- 原版六条非根进度的 `announce_to_chat` 缺省为 true。当前按原版模板生成独立系统公告，玩家名和正文白色、方括号及进度名绿色，进度名悬停显示原版标题/描述；两个根节点遵守 false。用户最新纠正覆盖之前禁止原版进度聊天的适配，`First acquired` 自定义物品取得消息已移除。
- 布局缩放、子集树排布、独立增量字段及迁移静默通知是依据用户自主执行授权作出的工程决定。

## 范围排除

注册表仍为 113 种可达物品、112 条运行配方，没有因分支变化新增其他可达行为。未实现旧版/基岩版木镐、木锄、烤面包、做蛋糕成就；没有将生日桌对应到 The Lie 或 Birthday Song。后者需要悦灵向音符盒递送蛋糕，本网页无此行为。

吃喝、动物繁殖/驯服、钓鱼、战斗/伤害、睡觉、剪羊毛、格挡、磁石指南针、比较器、探索、其他维度、钻石/熔岩桶/黑曜石等未加入。没有缩减原版“全部”类要求，也没有加入基岩版作弊禁用规则。

## 验证与复现

原版提取：在仓库根目录执行 `node --experimental-transform-types app/tools/advancement-assets.ts --client <锁定的官方JAR>`，使用已有 `javap`。构建和运行只用已提交的资源，不需要 JAR 或外站。

领域与事务证据见 `app/tests/advancements.test.ts`：七条真实库存/播种路径、四件铁甲分别 OR 完成、精确谓词反例、cursor 排除、Shift/数字键/F/装备/预设/容器取出、多槽变化、组件/数量比较、满包资格、失败播种、成熟作物收获、真实合成结果、并发、失败写入、重置、旧档和静默持久迁移。相关原有蛋糕余留桶、工作台返还、有限容量、炉/漏斗、播种消耗、生日桌和设置回归继续运行。

普通浏览器复现：从 `app/` 执行 `node --experimental-transform-types tests/advancements-production.mjs <Playwright包目录> <Chrome可执行文件>`。测试使用隔离浏览器上下文和明确的目录资格预条件；通过正式构建的真实键鼠事件将物品从目录取到 cursor，再点击玩家槽，且在两步之间检查不能提前授予。没有往应用注入授予进度函数，也不把预置解锁事实称为从零游玩。

浏览器还通过正常世界手势进入实际 Pointer Lock，再由空处短右键回到可见指针，使用真实耕地射线播种。检查七条事实、六条 Toast 均实际显示、农牧业根未完成、Done/刷新，以及 390、1280、1920 三种实际视口截图。root 和 Pages 子路径各覆盖干净首开及已有旧清单/纹理 HTTP 缓存后的更新。迁移当前库存的恢复不播放 Toast。

执行结果：正式测试 **664/664**、保留 P2 测试 **48/48**；TypeScript、原版数据核验、root / Pages 普通构建与资源审计通过，两路径 HTTP 检查 **2/2** 通过。日志见 [tests.log](evidence/tests.log)。

具体浏览器结果、截图、资源请求和构建标识见 [browser-results.json](evidence/browser-results.json)。截图构建标识对应 `3043052492ea` 基线加本次工作区源码，最终提交由 CI 重新构建；发布后的 CI、部署和线上实际 build 在最终交付消息中分别核对，不将本地截图冒充线上截图。所有截图均为原始浏览器输出。标题在小视口避让既有悬浮导航属于项目布局适配。人工试听、用户目标浏览器、真实硬件输入及跨引擎/OS 后台行为未冒充已验；未启动 Minecraft 客户端进行人工对照。
