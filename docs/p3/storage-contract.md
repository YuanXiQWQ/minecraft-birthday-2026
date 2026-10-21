# P3 状态与存档契约

后续扩展：P5第二部分已按用户明确要求加入九格/装备等稳定布局和P3迁移，当前实现见[P5布局合同](../p5/storage-input-contract.md)。下面保留P3交付时的版本及保留位说明；D07候选仍未批准。

日期：2026-10-21。范围是正式应用基础，不批准 D04–D08 的产品候选。D09 已由用户明确决定：**仅重置进度，保留语言和音量**；静音作为音频设置一并保留。重置不自动导航或更改其他项目的数据。

## 状态边界

`app/web/src/domain/types.ts`、`state.ts` 不依赖 DOM/Three.js。命令经 `transition` 验证，返回冻结快照与本次新增事件。页面只能向 `SaveSession.dispatch` 发送语义命令，不能上传一个自行修改的存档对象。

| 字段 | 当前合同 |
| --- | --- |
| `progress.unlocked` | 按首次取得排序的唯一 ID 数组；正常命令仅增加，重复取得不重复事件；固定主线顺序由 `MAINLINE` 选择器给出，副产物保留首次顺序 |
| `progress.scene` | plains/cave/farm/home 的稳定 ID；不表示四场景已经制作 |
| `progress.scenes[id]` | `layoutVersion:1`、工作站与作物数组；工作站有稳定 ID、三维整数坐标、kind、朝向；不保存 GPU 对象 |
| `contents` / `growth` / `player` / `recipeBook` | 仅 `{version:0,data:null}` 保留位；非空未经批准的数据明确拒绝，未来必须增加版本迁移 |
| `cakePlacement` | 唯一完成事实，null 或 `{scene:'home',table:'birthday-table'}`；需已解锁蛋糕且当前在家；主页直接投影此事实 |
| `settings` | locale、volume、muted；与进度在一个信封中提交，重置保留 |
| 运行时 | `celebration`、屏幕状态、自然资源访问/移除集合；不进入存档，不在读取完成事实时自动播放庆典 |

当前物品身份集合仅是 P3 验证子集，不是 P4 可达配方白名单。场景布局/作物内容和离线时钟没有填入产品规则。`put-station` 要求注入作者区域策略；正式界面没有授予、放置或拆除控件，测试用策略不成为 P7 建造范围。坐标 ±32767、数组上限等只是序列化安全边界。

## 信封与迁移

- 唯一数据 key：`minecraft-birthday-2026:formal:save`。两入口共享；与 P2 实验命名空间隔离。URL 子路径不隔离 localStorage。
- `format:1`，`contentVersion:'p3-foundation-1'`，`vanillaVersion:'26.3'`，`generation`，`revision`，`state`，`checksum`。
- checksum 为排序对象键后的 canonical JSON SHA-256，数组顺序保留。仅检错，不声称加密、防作弊或身份认证。
- 读取校验大小、精确信封字段、校验值、内容版本、ID、重复、坐标/方向/重叠及完成事实一致性。未知字段和未支持版本不会被静默丢弃。
- 唯一旧版路径是 **合成测试用 development-v0**（format0/contentVersion p3-development-0）；只在内存迁移成当前格式，下一次有效变更才提交。迁移失败保持原始字节。没有实际旧正式版本，不能声称已迁移 P1/P2 实验存档。

## 并发与恢复

全部协作页面逐事务取得同名独占 Web Lock：`minecraft-birthday-2026:formal:save:transaction`。锁内重新读取/校验最新值，再执行命令和一次 `setItem`，不使用 revision 比较冒充 CAS。不永久霸占“主标签”，主页设置与游戏命令均走同一合同。等待超过三秒提示 lock-busy，不抢占持锁方。

1. 命令调用时捕获 generation 和生命周期 serial；锁内读取最新状态再应用命令，同代次并行操作保留两者结果。
2. 重置确认捕获 `generation:revision:checksum`，锁内必须仍完全匹配，防止确认期间抹掉他页新进度。重置提交新 generation 和空进度，保留最新已确认设置。
3. 重置前排队的旧 generation 命令即使没收到 storage 通知也会拒绝。pagehide 增加 serial，pageshow 先禁写、重读；排队的旧页面命令不能复活。
4. 本页内部订阅更新，其他页由 storage 通知更新；focus、可见性恢复和 pageshow 补读。无 pagehide 自动上传旧快照。
5. 本机真实两标签页已验证 native Web Locks 合并、reset-before-stale-write；挂起/恢复 serial 的极端时序有注入测试。实际 BFCache 缓存命中、其他浏览器和隐私模式仍未验证。

保障范围是使用同一命名锁的协作页面；不能防止用户手改存储、不遵守协议的同源脚本或浏览器外部删除。重置后新发起的合法命令可以正常取得物品；不会永久封禁旧标签。

## 错误与 D09 剩余策略

仅真正不存在的 key 在锁内初始化。损坏、未来版本、未知内容、迁移失败或写入失败保留原始字节，显示本地化错误并停止写入/重置；可重试读取。写失败不先发布内存成功事实。存在上一有效内存快照时保留显示并同时提示不可保存，不伪装成空档。

Web Locks 不可用时保守只读；localStorage 读取不可用时显示错误。故障注入测试与真实浏览器能力验证分开，不声称已实测所有禁用存储/隐私环境。没有自动备份轮转、导出、强制删档恢复或失败迁移回滚 UI；原始 key 保留即是当前无损失败路径。建议后续先提供显式备份/恢复设计再决定破损档重置方式，**不把这个建议当作已批准产品交互**。

D08：建议未来使用可注入模拟时钟、保存剩余阶段进度，先明确离线/后台策略再实现，当前不累计离线作物或工作站产出。D04–D07 的数量、结果领取、发现与关闭策略须在对应正式业务前另审。
