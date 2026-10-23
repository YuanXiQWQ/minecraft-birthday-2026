# P9交付候选索引

当前修正：[连续挖掘及原版反馈边界](held-feedback-fix/report.md)。缺料/无配方不额外提示，操作消息统一聊天；正常物品Tooltip、成就及配方Toast保持独立。

当前显示修正：[游戏启动残留与占位导航清理](startup-fix/report.md)。只在完整游戏就绪后呈现原版按钮与HUD，保留实际错误和聊天。

当前新增：[圆角面板、天空与天气](environment/report.md)，原版数据/类证据及资源清单单独可审计，保留此前原始报告。

最新显示层修正见[文字颜色与悬浮导航](native-ui-fix/navigation-review.md)，此前五项行为回归与历史证据保持。

当前基于8f80bd9执行已授权的五项界面定向修复，当前矩阵/证据见[五项修复交付](native-ui-fix/five-review.md)；保留聊天七类、指南针、自动聚焦和狭小矿洞，历史阶段成果不重做。

既有基线：基于4eade6d的八组原版界面定向整改，见[用户授权](native-ui-fix/authorization.md)、[交付报告与八组矩阵](native-ui-fix/report.md)、[原版证据](native-ui-fix/native-evidence.json)。既有P9工程结果保留；本次不新增玩法。

- [有效行为合同](../p8/current-contract.md)
- [十九项覆盖矩阵](../p8/experience-19/matrix.md)
- [主页设置与采集容量13项回归](../p8/settings-harvest-fix/report.md)
- [P9交付报告](report.md)：本次/历史证据边界、构建、上线、风险与候选状态。
- [集中人工验收](manual-checklist.md)：仅需用户实体/感官/目标环境判断的项目。
- [兼容与恢复](recovery.md)：无历史改写、无清档的恢复步骤。
- [原版资源及来源](../../resources/minecraft/26.3/manifest.json)，其余profile清单在同目录，正式构建校验全部10份profile及依赖。

工程命令入口：app/package.json；正式478项（保留原463项）及安全队列测试，data:verify，P2关键48项，build/build:pages/test:built。原P1—P8报告保留当时事实；当前不从历史待审字样推断未获授权。

- [当前聊天七类、狭小矿洞及世界方位指南针](native-ui-fix/chat-cave-compass-review.md)。
- [物品搜索自动聚焦及固定帧历史记录](native-ui-fix/catalogue-review.md)（固定左上已纠正）。
