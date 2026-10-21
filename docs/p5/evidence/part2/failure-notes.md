# 当前切片中发现的问题与证据限制

- 首次集中单元运行有6项失败：5项旧测试仍假定player为P3空保留位/用新结构伪造development-v0，另1项占用装备样本误用了113候选中不存在的leather_chestplate。更新迁移夹具和已可达同ID不同组件样本后通过；没有增加皮革来源或缩减113物品规则。原P5第一部分报告及其50项结果不改写。
- 早期事件记录器在document capture微任务读取defaultPrevented，早于后续bubble监听器，导致初始记录显示false。后续使用事件结束后的任务采样；`trusted-input-initial.json`保留，不能使用其defaultPrevented列证明输入阻断。其isTrusted、鼠标轨迹及实际UI数量另行记录。
- 数量变化重建语义按钮会丢失聚焦来源，连续数字操作可能失去悬浮语义。当前只更新像素/标签并保留按钮；真实连续3/4键保持来源焦点，两个目标九格均填64。
- Windows Computer Use按文档初始化、轻量重试、重置再初始化仍失败：failed to write kernel assets，系统找不到指定路径。没有通过自制系统输入程序绕过，也未安装工具。浏览器drag接口只支持左键；右/中拖及拖动中Esc/窗口失焦保持待实体测试。
- 锁定槽aria-disabled=true使工具默认locator click与locator press超时，工具行动性阻断不是应用取得行为已测试。读取当前状态后，使用force可信点击及已悬浮状态的全局可信键执行尝试；中键、数字、F、Shift和旧X预设均无产物。
- D07未收到批准。关闭后的页内光标与不持久化光标是未完成合同边界，不用现有行为反推用户已经批准清空/保留方案。正式2×2与工作站内容仍未实现。
