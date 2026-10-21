# P6 合成事务与实例内容存档

依据：[用户批准的D05完整合同及A](d05-proposal.md)、[D04/D07](../p5/storage-input-contract.md)。本页扩展P3/P5，不改写历史测试报告。

## 结构与迁移

- 信封仍是format1、vanillaVersion26.3、同一SAVE_KEY/LOCK_NAME、generation、revision和canonical SHA-256；contentVersion升级为`p6-crafting-1`。
- player.version1的selected/hotbar/equipment/presets精确字段保持。光标和个人crafting[4]不序列化；InventoryState新增的workbench[9]只是事务投影，`layout()`必须同时剔除个人/实例输入。
- 工作台`contents={version:1,data:{grid:[9个Stack|null]}}`。实例id/kind/cell/facing及场景容器不变。每个输入必须为已解锁、符合26.3上限/支持组件的ItemStack；未知字段/版本拒绝。
- 炉/高炉/漏斗contents仍是精确`{version:0,data:null}`。recipeBook、crop growth不填未批准规则。空工作台version0保留位可作为兼容输入读取，第一次有效编辑产生明确version1内容，不往Reserved.data塞任意值。
- 先校验原信封checksum及支持版本，再验证旧状态。P3精确空player迁移为P5稳定布局；P5旧稳定布局原样保留，空工作台保留位升级为9空格。设置、解锁顺序、完成事实、其他实例/位置方向均保留；不在读取时覆盖原始字节，下一次有效持久变更才写新版本。
- 未来版本、损坏、迁移失败/未知旧字段维持原始字节与只读。旧版应用不支持新contentVersion时也应拒绝写入，不能猜测降级。

## 命令与前置条件

`inventory`延续原命令，可带`workbench={scene,id,expected:contents}`。锁内验证当前场景、真实实例存在且kind=crafting_table、完整contents等于观察值、稳定player布局等于expectedLayout，再运行P5 reducer。UI传入的workbench数组不是权威输入，实际数组从锁内最新实例提取。编辑后grid9和player布局同次保存。

`craft-take`包含`take={mode:cursor|shift|hotbar|offhand,index?}`、本页光标/个人四格、expectedLayout及可选workbench前置。领域层从注入的已校验26.3规则重新`findCrafting`，不接受UI指定产物/数量/配方ID。3×3必须有当前场景真实工作台上下文，不能靠传九个个人格获得3×3能力。

1. 验证现有载体、已解锁材料、组件和输入维度。
2. 获取原版result、used、remainders；仅归一已证明等于原版默认值的max_damage，其他未知覆盖不放开。
3. 规划完整产物批次，按合法目标与同组件容量有界；原输入ItemStack完整保留。
4. 规划取得顺序：主产物，然后输入行优先的余留物种类去重。A余留只返还永久无限目录，receipt中的returned是聚合事务事实，不是存档组或隐藏库存，聚合数量可超过单组上限。
5. 在同一领域转换中更新player/实例及永久首次取得；最终整态校验、seal、一次setItem成功后才发布事件/回执。

输入不匹配、未知能力、整批容量不足、布局/实例冲突、旧generation/lifecycle、写失败均不能发布半份领取。已解锁产品的纯页内光标变化可能不需setItem；仍经过锁内校验与领域命令，不新增持久数量。

## 并发与GUI生命周期

- 共用P3真实独占Web Lock，在锁内重读最新信封，不靠revision比较声称CAS。布局前置独立于设置/解锁；实例contents前置独立于player，阻止两个标签对同一九格重复取物。无冲突的其他事实保留。
- UI已有稳定命令队列继续用于输入，快速连续格操作捕获对应的乐观实例内容前置。失败撤未提交投影，最终从最新持久事实恢复，不直接上传旧snapshot。结果领取不乐观授物，等待成功回执。
- PersonalCursor epoch隔离关闭前的异步光标/个人输入回执。已接受且成功保存的稳定事务不因关闭回滚；迟到回执不能把物品塞回关闭的窗口。D07关闭个人/工作台GUI清本页光标/个人四格，但工作台九格留实例。
- 跨页移除当前工作台或切离其场景会关闭GUI，清本页手势、cursor、stationId及结果投影。刷新从存档恢复实例输入，不恢复个人光标/四格。拆除无返还/掉落/隐式授物；工作台结果是派生预览，不是待领物品库存。
- reset沿用确认token与新generation，清进度/实例/稳定布局，保留语言/音量/静音。旧代次排队合成拒绝。没有pagehide旧快照回写。

## 当前范围

工作台输入的普通左右取放、拖动/克隆/收拢/Shift/交换复用原SlotPolicy与reducer；结果从通用SlotRef排除，只能经专用领取。原版creativeroute与9格项目路由的差异见D05，不称作完整Java36格背包。

炉引用续燃、实际输出、漏斗自动取得虽然合同已批准，本次没有实现。D06配方发现、D08活跃/后台/离线推进仍待审。证明及实际浏览器范围见[交付报告](crafting-review.md)。
