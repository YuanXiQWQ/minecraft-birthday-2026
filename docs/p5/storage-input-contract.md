# P5 稳定布局与输入事务合同

本合同扩展[P3](../p3/storage-contract.md)的稳定载体；不覆盖历史报告，也不批准D07退出候选。

- 信封：format1，contentVersion=p5-layout-1，vanillaVersion26.3；同一SAVE_KEY/LOCK_NAME、generation和revision协议。
- player.version1/data：selected0–8、hotbar固定9组、equipment精确head/chest/legs/feet/offhand、presets固定9个null或9组数组。每个非空组是{id,count,components?}，必须已永久解锁且符合原版上限/装备组件。原版数量/槽位规则来自`app/web/src/data/inventory-rules.json`，由工具从已校验P4规则投影，测试逐项比较113条。
- components只接纳已处理的damage、custom_data JSON；未知容量/装备等覆盖拒绝。JSON身份忽略键序，原版默认damage0归一，非同组件不得合并；不模拟耐久磨损。
- cursor不写入该稳定布局。个人2×2、站点内部内容仍没有因此获得退出/刷新语义；D07批准后按新合同实现，未来非空字段需要明确版本迁移，不能塞进Reserved.data。
- 稳定槽变更必须发送`inventory`命令：intent、cursor、expectedLayout；光标是本页输入载体，结果从成功事务返回，不广播为他页光标。expect不是全存档快照，必须在独占锁内与最新稳定布局比对。它用于拒绝同槽竞争；并不是用revision冒充原子锁。
- 一次完整拖动是一个命令，移动时只收集唯一合法目标，不改组；释放时计算分配。合法性在提交时再检查。source复制、creative中拖/预设加载和drop是显式非守恒操作；普通取放/转移/交换按身份守恒。
- UI乐观显示本页有序命令，但只把最后成功的cursor作为已提交运行态。锁内拒绝/写失败会撤掉未提交投影；后续队列失效。generation变化及卸载也使队列失效；无pagehide快照回写。
- P3 migration仅从校验通过、player精确version0/data:null的旧内容转换；复制其他持久事实，原档保留到实际变更写成功。未来/损坏/未支持字段继续保留原字节并只读。
- reset使用原有完整确认token，清全部进度载体/预设，保留设置；同锁内旧epoch命令拒绝。页面恢复先读最新再写，不接受旧快照复活。

当前强制互斥覆盖协作应用页面；不能抵御不遵守协议的同源脚本或用户手改localStorage。原版客户端关闭/掉落行为与本项目的最终适配仍待D07。D05/D06/D08业务没有在本合同中隐式决定。
