# 原版进度聊天纠正

用户指出获得进度时聊天文字不是原版。本次按锁定 Java26.3 的原始公告组件修正，不用物品解锁提示代替进度公告。

## 实际问题

在普通构建的隔离浏览器中，使用原生鼠标空手采集第一块橡木，实际聊天出现 `First acquired: Oak Log`，此时任何原版进度都没有完成。原始截图和消息组件见 [before-root.png](evidence/before-root.png) 与 [before.json](evidence/before.json)。这句是自定义物品取得文案，不能作为原版进度通知。此前测试预置了目录资格，没有覆盖第一次解锁的实际聊天，是验证缺口。

## 同版原版依据

仅只读锁定官方 client.jar，SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`，没有启动 Minecraft 客户端。原始数据/语言/类哈希和可复现 javap 方法位置保留在 [native-evidence.json](../advancements/native-evidence.json)。

- `assets/minecraft/lang/en_us.json`：`chat.type.advancement.task = %s has made the advancement %s`，`chat.square_brackets = [%s]`。
- 当前已有官方简体中文资源的对应模板是 `%s取得了进度%s`。没有自行翻译。
- `AdvancementType.createAnnouncement` 的参数依次是玩家显示名、`Advancement.name(holder)`；这是系统公告，没有玩家聊天的 `<name>` 前缀。
- `Advancement.decorateName` 生成方括号组件，使用该类型的聊天颜色，标题携带 `HoverEvent.ShowText`；悬停内容为原版标题、换行、描述。TASK 使用 `ChatFormatting.GREEN`（`#55FF55`）。
- `PlayerAdvancements.award` 只在未完成转为已完成时处理公告；其公告分支检查 display 的 `announce_to_chat` 和原版公告游戏规则。网页当前没有自定义禁用进度公告的设置，使用原版默认开启行为。
- 两个根节点的原始 `announce_to_chat=false` 保留。其他六条使用默认 true；Toast 与公告各自处理自己的原版显示标志。

## 当前行为

普通物品取得、图鉴资格、合成预览、cursor、设备内部输出都不会生成进度聊天。已删除运行文案 `First acquired: …` 和直接发送入口，通用自动聊天策略也拒绝该旧消息键。物品资格及配方发现事实没有删除；既有操作教学、图鉴教学、真实失败和容量反馈保留。

保存成功后，`advancements-completed` 事件读取本次已保存的 criterion 和用户名，生成原版消息。例如：

`sireoh has made the advancement [Stone Age]`

玩家名与正文沿用白色，方括号与原版进度名绿色。打开聊天后悬停进度名，使用现有原版 Tooltip 资源和字体显示标题/描述；不添加 NBT 或其他高级信息。原版字符串在共享独立语言模块中供进度页、Toast、聊天使用，支持原版位置参数和英文回退。

没有在按钮、DOM 观察、动画或定时器里授予进度。未改进度判定、存档格式、有限数量、设备、生日流程。失败提交不公告；刷新、迁移、同代重复操作不重播。重置之后可以凭新的真实动作重新完成并公告。

用户本次明确要求原版进度公告，覆盖旧“首次永久取得”自定义聊天及禁止新增原版进度公告的冲突条款；相关当前合同已同步，历史证据不改写成原版行为。

## 验证

规则/事务检查见 `app/tests/advancement-chat.test.ts`：原始英文与中文模板、白色/绿色组件、悬停内容、原版参数顺序、普通取得与根节点静默、cursor 延后、真实存档完成后只公告一次、失败回滚、重置及多槽变化。

普通浏览器复现从 `app/` 执行：

`node --experimental-transform-types tests/advancement-chat-production.mjs <Playwright包目录> <Chrome可执行文件>`

测试只预置圆石/石镐的目录资格，不预置橡木、木板、工作台或玩家组。使用真实世界射线持续挖橡木；在正式二维 GUI 内将橡木合成木板，再实际消耗四块木板合成工作台，检查普通取得与根进度没有公告。之后目录取圆石到 cursor 不公告，实际进入玩家快捷栏才显示 Stone Age；取得石镐显示 Getting an Upgrade。重复取得不重复公告，刷新不重播；实际指针悬停验证绿色标题和原版描述。

root / Pages 两条普通构建路径分别通过，截图和实际消息组件见 [browser-results.json](evidence/browser-results.json)。正式测试 **673/673** 通过，记录见 [tests.log](evidence/tests.log)；TypeScript 与两路径普通构建/资源审计通过。修改前截图来自 `565e1ea2ce80` 构建，修改后截图来自 `2e110c87de35` 基线加本次源码；这些是本地普通构建证据，最终提交由 CI 重新构建。

所有图片均为原始浏览器截图；实体输入、人工试听、用户目标浏览器及启动 Java 客户端对照没有冒充已验。最终提交的 CI、部署与线上实际 build 在交付时分别核对。
