# 十五项实际整改矩阵

依据用户完整新授权，保留历史P1—P7报告。状态“代码完成”与真实输入/Java客户端/人工视听验收分别判定。附件文件只有文字，未声称看过未实际附上的四张参考截图。

| # | 正式实现 | 自动化证据 | 普通页面及实际画面 | 剩余边界 |
|---|---|---|---|---|
|1 两原版页签/搜索|ui/inventory.ts、i18n/items.ts/原版zh_CN|experience词表/ID检索，P4图标113|catalogue1920-chinese-search、catalogue1440；木镐/wooden pickaxe指向同ID，只有指南针/箱子图标|无新增故事翻译，默认英文|
|2 共享27+9|domain/inventory/state、codec p8-inventory-1|迁移/输入/取得/队列/重置全部回归，初始27空且解锁不入库|普通新档source→切箱子→bag0，后设备GUI显示同组；inventory1280-restored/helmet-hands|D07实际关闭清光标/四格保留；预设数据未删|
|3 书并列/有限填料|recipe-book fillOwnedRecipe、UI|缺料拒绝、重复材料数量、标签回溯、组件冲突、Shift有界，代次9项保留|新档木板/棍/工具/蛋糕实际填料；inventory1920-main、inventory1440-book-and-player；560书内返回|原炉发现数据保留但隐藏入口，无免费材料|
|4 图标清晰|ui/icons128px、GUI/HUD/cursor高密度backing|113依赖及原版几何/UV/alpha全部回归|catalogue1440-alpha-and-icons、inventory1280-helmet-hands原木/板/台/炉/漏斗/工具同倍率|原版Java逐像素光照对照未验，不把哈希当外观证明|
|5 工作台对齐|VanillaModels外层定位/内层中心旋转|四朝向Box3逐轴落在cell..cell+1、预览共工厂；实际射线回归|02-table-and-sticks、普通Farm实际台及链；刷新后原UUID/坐标|非立方漏斗保留，不改旧坐标|
|6 光标中心|inventory draw/scaledCanvas/icon16中心|原输入/布局与边界测试保持|01-planks-acquired/个人页切换与trusted-drag-cursor实际画布，主体偏移8×scale|真实跨显示器DPR未验，当前实测约1|
|7 来源取消|reduceInventory source|3物品×左/右/Shift/clone、同/异组件/锁定/上限真值表|普通source切页持物、清空重选，领域门禁未放宽|普通有限槽未改成来源语义|
|8 来源Shift一组|同上/InventoryInput|原版64/16/1上限，无逐空格复制|新档取64原木、64种子、1奶桶、1头盔均可信Shift|非空光标不暗中覆盖|
|9 松手前投影|draw(false)+同reduceInventory，鼠标状态机|奇数余数、重复/非法/满格/组件、取消及守恒回归|trusted-drag-intermediate.png为实际按住期间GUI原画布（非编辑/非松手后）；JSON isTrusted=true、已提交21/64与预览64/64不同、黄色满格；after全页|原生AX无右/中拖参数，二者实体中间帧留人工；GUI画布不含独立Steve WebGL层，完整GUI另有全页截图|
|10 Steve观察|playerLook绝对角/预览尺寸复用|对称/无累积/垂直不相消，装备及缓存回归|steve中心/四方/四角九张实际局部；inventory1280-helmet-hands实际制作头盔、双手联动|保留pose-initial失败图；未声称Java客户端逐帧对照|
|11 炉消耗|tickFurnace|每点火扣1/完成扣1、堵塞余火/短燃料/能力/有限输出及队列11项|06 input64/fuel63→07 input60/fuel63/output4，手搭链20木→木炭；新补64有限组运输实测|永久目录资格仍无限，不自动补充|
|12 有限Shift|playerTargets36、上下文炉/漏斗|10源+60目标→64+6；含主背包总量守恒、满/部分/异组件|真实main20木Shift入漏斗，来源变空；drag62→20/20/20余2；链63实际剩余|目录/结果各自有界特例不污染有限槽|
|13 结果Tooltip|inventory.showTooltip|原像素/Tooltip与输入回归|实际木板/工具/蛋糕结果悬浮仅物品名，无A返还/点击教学|不是实现全游戏所有组件文本引擎|
|14 原版耗时挖掘|domain/mining、WorldUse/SceneView|8正式WorldUse/SaveSession可控时钟：松手/GUI/转向/工具/代次/失效，工具硬度/掉落分离|普通3.3秒原木、1.4秒石/铁/煤；设备0.4秒不拆、1.4秒真拆，裂纹/反馈|原版破坏精灵/声音，12片纹理碎屑不是完整TerrainParticle复刻；实体右转期间的取消留工具限制|
|15 真实表面自由放置|WORLD_REGION真实边界/碰撞、supported/sourceOccupied、自然层冲突|活来源拒绝/清地允许/支撑拒绝、方块面射线、占位与补货/网络回归|[-2,0,0]台、Farm前排支撑超旧区，Alt/Ctrl+Alt分层链、R端口；挖掉前支撑恢复空间|旧build参数仅历史负载夹具，不是正式白名单。全部布局数学上穷举并未证明，现有可见挖掘恢复兜底|

## 仍需实体/外部环境验证

1. 当前AX只提供左键drag；可信右键短击、中键单击与组合键可用，但实际右键/中键拖动、拖动中Esc、真实窗口失焦和跨显示器DPR仍需对应后端或人工。未用dispatchEvent冒充。
2. OS最小化/真实后台返回、其他浏览器引擎与低端GPU；可见性报告为空说明当前样本未发生切后台，不是后台通过。
3. 原版Java26.3视觉/听觉逐项对照和12事件人工试听。调度35条、analyser非零只证明浏览器输出信号，不等于耳听通过。
4. 当前四场景及可见可恢复反例已实现/回归；有限场景所有可能自由布局并未穷尽证明。没有通过穿墙、免费解锁或清档掩盖。

以上是验证条件的精确缺口，不能写成所有实体输入或全环境已经通过；十五项代码修正及P8可供独立审查，不自动进入P9。

最终检查另发现并修正：可配置音效时点的局部同名变量（原失败日志保留）；炉Shift双击仅扫描来源区域，避免刚转入另一玩家区域的组被再次搬回；碎屑使用已有RAF平滑更新直到750ms释放，36项几何/纹理/材质dispose断言通过。音频受阻时Replay保持可见、暂停拒绝有反馈。以上直接回归不扩大业务。
