# P6 熔炉/高炉交付与验证

日期：2026-10-21。基线aab05b4已审查；本次只实现两种加工设备及后续漏斗端口，未开始配方书、P7或P8。蒙版、Steve、领取票据、D04/D05 (A)/D07、生日主页及真正3D/第一人称/方案B保持。[D08明确批准与存档合同](furnace-contract.md)。

## 已实现

- `app/web/src/domain/furnace.ts`：确定性加工、输出来源校验、有限领取、Shift优先路由、原版GUI燃料权限和侧面传输计划。
- `domain/state.ts/types.ts`、`persistence/session.ts/codec.ts`：明确version2设备内容、`p6-processing-1`迁移、加工/取得命令和原子写入。正常生产不依赖渲染帧数；output出现不永久解锁。
- `persistence/processing-clock.ts`：用户批准的D08活动时钟和独占执行者；GUI关闭不销毁模拟，所有场景设备一起推进。
- `ui/inventory.ts/inventory-input.ts`：原版熔炉/高炉背景、输入/燃料/输出、火焰/箭头、名称/数量/Tooltip、共享目录/九格/输入状态机。设备无Steve；个人和装备页继续使用既有原版Steve。实际有限输出复用票据门禁，不套合成预览生成逻辑。
- `ui/workbench-use.ts/domain/workbench-region.ts/render/scene.ts`：持对应设备短右键地板放置、短右键打开、Shift短右键拆除；默认朝向承载房间观察者，保存/显示原版facing和lit。当前地板区域仅为P6承载区域，不是P7规格。视觉签名只含坐标、方向和lit，计时更新不重建所有GPU几何。

## 原版证据与资源

没有启动或安装Java客户端。使用同一已校验官方客户端，SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`，通过已有`javap -c -p`只读检查；类/标签哈希见[data证据](../../data/minecraft/26.3/furnace-evidence.json)，复现工具`app/tools/furnace-evidence.ts --client <client.jar>`。

关键依据：`AbstractFurnaceBlockEntity.serverTick`（燃烧、点火、加工、堵塞、冷却）、`setItem`（输入变化）、`getSlotsForFace/canPlaceItem/canTakeItemThroughFace`（端口），`FurnaceFuelSlot`（桶容量），`AbstractContainerMenu`（有限结果取/拆半/已有光标收取/数字与F），`AbstractFurnaceScreen`（原版坐标及火焰/箭头裁切）。加工数值和可达配方继续取P4数据，34燃料全部运行测试；完整P4数据没有改写。

`catalogue-assets.ts`把两张设备背景和四张进度精灵加入实际GUI加载依赖；这些原始文件已在P2资源集中，本次无须复制完整客户端或增加重复资产。`resources()`仍核验490个运行资源/清单文件。正常Git、dev和双路径构建直接加载，不需要缓存或调试按钮。`inventory-rules.ts --check`同时核验同步加工投影和原版底部提取标签，来源是P4已校验catalog；没有新增手写配方表。

## 自动化

最终类型检查通过，正式 **183/183**、P2关键回归 **48/48**、构建HTTP **2/2**，零失败/跳过。P4仍为113物品、112可达配方、2042分类、18步蛋糕链。原24项领取时序断言保留，只补齐DOM替身的`setAttribute`能力；未删除或弱化断言。

新增`furnace.test.ts`与`furnace-queue.test.ts`直接调用正式内核、GameInventory方法和真实SaveSession，覆盖：

- 原木设备限制、圆石/石头/平滑石、粗铁、铁镐回收；34燃料两设备上下文，短燃料续燃；逐tick/1200步一致。
- 无配方、堵塞/解堵、组件不合、剩余火、输入变化/燃料移除更换、不同设备内容；输入可放与Shift路由区分。
- 生产未解锁、实际有限领取、左右/Shift/数字/F与容量；首次事件幂等；写入失败、布局冲突、跨会话竞争/重置、拆除/迟到/关闭/释放门禁。
- version2来源/结构/容量验证、旧P6迁移保留非空工作台；正常放置不能注入输出；上下/侧端口条件及有限源目标守恒。
- 50ms时钟、锁内及校验后活动身份失效阻断；原P3/P4/P5/合成、蒙版和玩家预览回归保持。

日志：[正式](evidence/furnace/formal-final-v5.log)、[类型](evidence/furnace/typecheck-final.log)、[P4](evidence/furnace/p4-final.log)、[投影](evidence/furnace/projection-final.log)、[P2](evidence/furnace/p2-final.log)、[根构建](evidence/furnace/build-root-final-v3.log)、[Pages构建](evidence/furnace/build-pages-final-v3.log)、[HTTP](evidence/furnace/http-final-v3.log)。构建存在既有Three共享块超过500kB的提示，构建/边界审计通过；不冒称低端设备性能验收。

## 实际浏览器

Windows、内置Chromium155，1280×720/DPR1.25及1440×900/DPR约1。使用隔离verification入口挂载 **正式app**，测试夹具仅提供源物品解锁/布局和真实事务回执延迟；没有替换加工/输入实现，没有直接授予产物。

1. 真实鼠标短右键在地板放置熔炉，从原版模型打开GUI；目录各复制一件原木/木棍填入。截图[加工中1280](evidence/furnace/processing-1280.jpg)，实际状态`burnTotal=100,cookTotal=200`。产物留槽时解锁集中没有木炭：[领取前](evidence/furnace/before-first-pickup.json)。稍后累计2木炭，实际点击后光标2、炉输出空、木炭事实增加：[领取后](evidence/furnace/after-first-pickup.json)。两个记录之间持续生产，不能把前图的1与后图的2误判为复制。
2. 独立高炉允许原木暂放但不点火：[无配方](evidence/furnace/blast-nonrecipe.json)。换粗铁后实际`burnTotal=50,cookTotal=100,speed=2`；[1280原版高炉](evidence/furnace/blast-native-1280.jpg)、[三维两设备](evidence/furnace/world-two-devices-1280.jpg)。模型之间有真实前后遮挡，点击可分别打开对应ID。
3. 输出领取成功但测试回执延迟时，再点空快捷栏格：等待期`acquiring=true,cursor=null`，不会提交旧光标；释放后光标 **3铁锭**、空目标仍空，随后正常放入目标。证据[等待](evidence/furnace/receipt-wait-empty-click.json)、[释放](evidence/furnace/receipt-released.json)、[后续正常移动及真实GUI右键](evidence/furnace/after-pickup-move-right-input.json)。等待时炉继续生产，后来输出4是新的加工结果。
4. 实际Shift把当时34木炭移动到九格：[有限Shift](evidence/furnace/shift-finite-output.json)。刷新后实例内容、方向、布局仍在。1440原版熔炉：[最终截图](evidence/furnace/final-furnace-1440.jpg)。真实右键把24输出分成光标12/输出12：[前](evidence/furnace/right-output-before.json)、[后](evidence/furnace/right-output-after.json)。数字8指向已占用格被拒绝：[证据](evidence/furnace/numeric-occupied-rejected.json)；F移14到空副手，源清空：[证据](evidence/furnace/offhand-output.json)。测试延迟状态中的旧failed表示前一个数字领取拒绝，不表示随后F失败；正式GUI已清除旧错误。
5. 真正双页、同源Web Locks：最终R3两页均`visible`；44.7秒内A提交0tick，B提交895tick（采样批次边界约±5tick），没有两页各推进一遍。原执行页离开后，另一页累计860tick/172次提交，证明接管。[R3原始记录](evidence/furnace/two-pages-r3-start-a.json)及同目录start/end-a/b、[接管](evidence/furnace/after-owner-transfer.json)。首次记录`two-pages-start-b.json`在发布DOM前读取为空，保留但不用于通过结论；R2遇开发热更新，不用于最终连续计时判断。
6. 设置界面保持打开121.698秒，实际执行者增加2436tick，炉内木炭8→20；[前](evidence/furnace/settings-clock-before.json)、[后](evidence/furnace/settings-clock-after.json)。没有因设置中断。
7. 另一游戏标签打开高炉时，在第一标签真实Shift短右键拆除：另一页GUI自动关闭、实例及64件内部输出删除、快捷栏/副手保留；[前](evidence/furnace/before-cross-tab-removal.json)、[后](evidence/furnace/after-cross-tab-removal.json)。
8. 两游戏页离开后仅主页及只读夹具存在；55.874秒内revision仍1716、checksum完全相同：[前](evidence/furnace/home-only-before.json)、[后](evidence/furnace/home-only-after.json)。没有主页加工或离线时间戳补算。

这些是浏览器可信点击/按键和真实生产状态证据，不是Java客户端实操对照。实体右键拖动、真实窗口最小化/系统后台节流、BFCache命中、其他浏览器/低端设备仍待人工验证，未使用合成事件冒充通过。原P2/P5人工清单继续保留。

最终视觉回归另发现：炉输出投影未更新缓存签名时，返回原先为空的个人四格可能残留炉输出图标；领域领取会拒绝，但显示错误。保留[失败原图](evidence/furnace/personal-regression-1280.jpg)，不作为通过证据。已为生产输出投影设置独立缓存签名；正式GameInventory回归反复打开/关闭两种上下文，个人空格结果始终empty。真实浏览器[修正后画面](evidence/furnace/personal-regression-fixed-1280.jpg)和[状态](evidence/furnace/personal-regression-fixed.json)同时显示空结果、六部件Steve/外层/双手、图标轮廓蒙版，未重做既有视觉。

## 复现与剩余范围

普通运行：`cd app; npm run dev`，`/game/`；持已解锁炉/高炉短右键合法地板放置，短右键开GUI，Shift短右键拆除。P7采集尚未实现，因此空进度不会自动获源物品；普通页面没有授物按钮。

完整隔离复现：`npm run dev:verify` → `http://127.0.0.1:4184/__verify__/index.html` 点击`Fixture: furnace source carriers`，打开`/__verify__/input.html`；该夹具只授原料/燃料/设备并配置九格，木炭/铁锭仍需实际加工和领取。使用同源第二游戏页检查独占；都离开到主页检查暂停。回执延迟沿用`Arm next crafting receipt delay/Release crafting receipt`，同时支持真实炉事务；正式构建不含这些控制或记录。

待人工步骤：分别使用两设备取放及Shift/数字/F；有余火时关闭GUI/切场景；播放时最小化、后台再回到可见，检查不集中补产；关闭所有游戏页等待后重入，检查仅保留原进度；真实右拖与GUI右拖隔离沿原清单验证。当前正式四场景导航未制作，切场景通过领域及会话测试，不假称浏览器四场景演示通过。

未实现：完整漏斗网络/自动取得事务的网络接线、配方书/D06、P7四场景及作物、P8蛋糕放置庆典。端口接口已保留，不意味着漏斗业务完成；合成/熔炼不会改变生日完成事实。无公开部署，交付后等待审查。
