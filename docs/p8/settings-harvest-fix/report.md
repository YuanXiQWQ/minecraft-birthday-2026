# 主页设置与采集容量定向修复

基线：dbcc8c984461f0009ac7a60b26495fd57810e0d7；仅修主页设置接线、有效掉落取得/部分入包及直接回归。十九项已有GUI、图标、指针、合成/返还/生日系统保留，不进入其他阶段。Pages沿用现有main自动更新，未改权限、目标或工作流。

## 正式复现与修复

### 主页Settings

实际普通主页调用mount('home')，打开Settings后，language/volume/mute三个节点的isConnected均为false；只有重置与Done留在dialog。原因是append将原节点移入section，而只有游戏分支再挂section。证据：[原画面](evidence/home-before.jpg)、home-before.json。

app.ts按入口明确装配同一组section：主页直接显示语言、声音及原有重置；游戏仍走Esc→Options的层级。没有复制字段、SettingsEdits或保存逻辑，也未恢复游戏顶层Settings/Items按钮。底层select/checkbox仍连接到document，用原版English按钮与Sound ON/OFF呈现；只支持en。音量继续使用原版滑块，而非裸HTML样式。

实际画面检查还发现主页资源过滤器只允许button精灵，滑块画布没有已提交的slider资源；修正resources.ts的主页共用widget白名单，载入既有slider/handle及mcmeta，不新增原版资产。主页Settings截图现在有实际可见原版轨道与手柄；不是以range变量存在代替视觉验收。

真实浏览器可信操作：主页音量.20→.35、静音ON→OFF，关闭重开、刷新均一致；同源游戏标签从Esc→Options→Music & Sounds改至.45/非静音，主页无需刷新即同步。初始仅主页期间world.tick持续为0。游戏Player Settings用户名保存仍可用。

实际mount监听器集成测试另外标注为合成DOM输入：home与game分别将本地音量草稿置.8，同时经真实SaveSession提交processing-tick与另一份.35设置快照，实际控件/80%标签保留草稿，change后存档.8。主页故障注入仅在隔离页临时拒绝SAVE_KEY写入，实际保存回调显示失败、回到已提交.8、存档不变、控件禁用；恢复浏览器API并按正式Retry后恢复。原21项设置/迟到回执回归保留。这些DOM合成事件不冒称物理滑块拖动；可信键盘/点击与真实跨标签同步有独立记录。

普通静态产物的两个入口均实际打开主页Settings、调整音量并切静音：

|普通构建|实际页面|结果与图像|
|---|---|---|
|root|4213/|三个底层控件连接，English/原版轨道/静音/重置可见；音量.25/静音true；[截图](evidence/root-build-settings.jpg)、root-build-settings.json|
|Pages前缀|4214/minecraft-birthday-2026/|同样可见可操作，无测试按钮；[截图](evidence/pages-build-settings.jpg)、pages-build-settings.json|

### 有效掉落、取得和实际数量

state.ts将已由world-state/原版loot确定的一次有效掉落交给局部depositHarvest：沿用quickMove先合并再填空，每组分别收集实际交付与剩余量，不因容量不足抛出整笔失败。有效掉落全部登记首次取得和适用发现；节点/作物原生命周期仍同笔结算，不保留可重取的来源。随机只在原harvestNode/harvestCrop分支计算一次，容量分支不重新调用loot；world-state.ts及harvest.ts原规则未改。

items-acquired明确包含：stacks=本次有效掉落，deposited=实际进入27+9的组，overflow=未入包组。首次item-unlocked事件另行幂等。harvest-feedback.ts作为正式聊天投影，仅对deposited显示+n；overflow明确说明未装下、可从Items图鉴取用。overflow只存在本次事件，不写入存档或隐藏容器，不创建世界实体。

|同类用例|dbcc8c9|本次实际结果|
|---|---|---|
|满27+9首次采蛋|真实SaveSession抛inventory-full；字节不变、蛋未解锁、来源保留|有效蛋1，deposited0/overflow1；首次解锁及cake发现成立；蛋来源消失，背包原组不变|
|成熟麦：seed63，其余位置满|旧代码因首个放不下的掉落ensure回滚（代码路径判断，未伪称旧浏览器实测）|真实点击小麦：有效麦1＋种子2；种子补1至64，overflow麦1＋种子1；麦解锁/发现、作物清除。聊天只显示+1 Wheat Seeds，并分别提示两种未入包数量|

满包基线正式复现见harvest-before-valid-node.json；harvest-before.json是最初使用错误测试节点ID得到resource-unavailable的无效尝试，保留但不作为满包证据。部分采收首次点到非命中位置的partial-off-target文件同样保留，不计为成功；partial-after才是实际有效采收。

[部分容量实际画面](evidence/partial-after.jpg)、partial-before/after.json；[满包实际画面](evidence/full-after.jpg)、full-before/after.json。容量夹具先在隔离4212源显式准备，再导航普通/game/，采收通过真实鼠标/SceneView/WorldUse/SaveSession正式路径；没有以领域命令代替本次玩家采收。这是准备过容量的样本，不是无授物的新档流程。

设备破坏使用同一部分入包结算，但只结算设备自身合法掉落，内部输出仍按D07清理而不隐式领取。错误实际主手无合法掉落时不产生取得/入包/错误解锁；原工具规则保持。挤奶仍单独原子转换：单桶可在原手位替换成奶桶，桶组大于1且无输出空间则整笔失败，不能因普通采收放宽而吞桶/复制奶桶。

工作台返还、合成结果、实际空桶余留物、炉输出的容量校验未全局删除；真实存储写失败、旧代次、已采资源、竞争和票据等仍拒绝/回滚。没有新增持久字段，内容版本仍p8-experience-2，迁移未变。

## 数量与事务自动测试

新增harvest-capacity.test.ts 13项调用正式transition和真实SaveSession，分别断言有效掉落、首次事件、deposited/overflow、来源及聊天含义：空包、完全满包、兼容组部分容量、多掉落一类可装另一类不可装、重复取得无首次重播、错误主手、两会话竞争同节点/作物、写失败后同随机结果重试、重置后排队旧命令、设备本体掉落不授内部炭，以及一桶/两桶的原子容量差异。

experience-19.test.ts原“满包整笔拒绝”产品预期已明确改为有效取得与数量分离，并保留背包不覆盖、资源一次结算及不重复首次事件断言；没有删除并发/失败安全测试。原24领取、11炉队列、21设置、9配方书生命周期和迁移/原版资源等均继续运行。

## 生日与返还定向冒烟

显式cake夹具仅预置实际工作台与有限原料，未预置蛋糕/完成事实。可信右键真实工作台打开3×3，领取后确认真实输入消耗及3个空桶，蛋糕实际进入当前快捷格；完成仍null。正常E关闭后3桶合并入包、九格清空。Home场景持实际Cake右键桌面，保存后才进入celebration=true；独立主页实际3D蛋糕同步。

证据birthday-preview、birthday-taken、birthday-workbench-closed、birthday-placed及birthday-home的JSON/JPG。第一次冒烟缓存了领取前的槽位坐标，结果提示改变面板布局后点到界外、触发既有临时组丢弃；失败图birthday-stale-coordinate-discard及birthday-not-held-at-table保留，不计为通过。重新用当前语义槽位定位后才完成上述验证，没有修改GUI业务来掩盖测试误点击。

最后从主页正式重置，蛋糕/设备/解锁/组清空，保留最新en/.8/非静音/capacity_user；home-reset-after保存实际状态。没有一键完成或正式页面测试授物按钮。

## 检查与证据索引

- 类型检查通过；正式389/389（原376保留，新增13）。
- P2 48/48；P4 113物品/112可达配方/2042分类/18步蛋糕链及来源/资源哈希一致。
- root/Pages构建审计及2项HTTP逐资源字节验证通过，仍667份原版资源/清单；新增capacity-browser与observer仅在verification，普通产物测试路由404。
- 实际mount双入口、原版Settings截图与普通静态双路径见上；DOM草稿/故障注入与可信输入严格分开。
- 日志evidence/check.log、formal-tests.log、p4.log、p2.log、root-build.log、pages-build.log、http.log；原画布按SHA256去重、不重采样，JSON保留rect/backing与文件哈希。已更新十九项矩阵7/9及当前合同；旧失败文件保留。

复现：普通app执行npm run dev，主页Settings直接可用；构建后npm run preview及preview:pages核对双路径。隔离测试用npm run dev -- --mode verification --port 4212，/?settings-audit&capacity-fixtures显式准备full/partial/cake（会替换该隔离源测试存档），随后仍在普通/game/输入；不在普通dev/build提供这些控制。仅需查看时用不带capacity-fixtures的普通入口。

不控制实体桌面。真实PointerLock成功、实体右/中拖、OS后台及Java客户端逐帧/听觉对照维持未验；104.2ms长帧与原545.6ms未定结论原样保留，本次不声称修复性能。提交后仅沿用现有Pages自动更新，核实远端/部署后停止独立审查。

补充：原版语言/静音按钮随实际只读状态一同禁用，Done仍可用；最终挂载失败验证见home-mounted-write-failure-final.json。截图和只读观测中的build字段使用编译时HEAD dbcc8c9加本次工作区源码；最终main部署会按新提交重建，不将工作区画面冒称纯基线结果。
