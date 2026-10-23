# P9工程候选交付报告

基线：62041c22439c22f87635bf51225f01dfaa2a4e74，已独立审查。当前用户授权是最终回归、正式产物与既有Pages链收尾，非新玩法阶段。唯一入口：[P9索引](README.md)。当前正式合同及十九项/采集容量修复继续有效。

## 候选身份与证据边界

P9没有修改app/web/src运行逻辑、业务数据、资源或存档格式。新增变更仅是Git生成数据字节约束、CI补入既有P2回归、静态HTTP/MIME/标识/敏感串审计和当前文档。普通页面及性能样本由基线62041c2的隔离克隆构建，其运行源码与P9候选相同；当时页面build为62041c22439c，不虚称提前具有最终提交标识。

最终候选由包含本报告的新提交确定；提交后另以全新克隆在最终HEAD完成检查，Actions也从最终HEAD重建。交付回复记录最终完整SHA、远端SHA、Actions run及线上实际build；不能把本报告所列预提交浏览器build冒充最终线上版本。线上比对以该次Actions实际上传的静态artifact为准，绑定HTML、哈希JS、两份规则及原版清单/依赖，不借用户存档排除混版。

## 证实并修正的问题

干净Windows克隆受到全局core.autocrlf=true影响，recipe-book.json由LF变为CRLF。原版发现证据要求的SHA256为0e41f933…45ee，克隆所得为d3d447da…ec64；389项中这项失败。原工作区的LF文件及此前Linux CI没有暴露该问题。

在.gitattributes为recipe-book.json与同类按来源哈希审计的animal-models.json声明-text，沿用已有原版资源/规则/注册表的字节约束。没有更新原始哈希、删除测试、重新提取客户端或改变发现规则。失败原始日志：[windows-checkout-before.log](evidence/clean-copy/windows-checkout-before.log)；补齐后389项通过。最终新克隆再次直接验证，无复制开发机数据修补步骤。

这是依据用户自主执行授权作出的工程决定。未发现需要重新实现已通过玩法的缺陷；不改背包、返还、采集、生日或输入合同。

## 可重建、CI与静态审核

- 从仓库克隆到独立临时目录，初始git status干净；app及保留的P2原型分别npm ci --no-audit --no-fund，Node25.2.1/npm11.6.2，使用各自锁文件；未借用原工作区node_modules或外部Minecraft缓存。第一次克隆暴露上述换行缺陷；预提交修复验证只复制相同Git内容的两个生成数据及属性，不伪称该轮已经是最终提交克隆。
- 类型检查、正式389/389、P4来源/配方/哈希、P2 48/48、root与Pages构建及2项HTTP检查通过。[原始日志目录](evidence/clean-copy)。其中原24领取时序、11炉队列、21设置、9配方书生命周期及13采集容量回归均保留；旧档迁移、损坏/未来版本、禁用/写失败、竞争/旧代次及其他项目键保护由正式SaveSession测试覆盖，不冒称真实浏览器禁用存储或跨引擎通过。
- 既有工作流沿main→build→deploy。正式测试/P4/P2/双构建/HTTP任一步失败均阻断上传/部署，没有continue-on-error/always部署。补入P2已有锁文件安装和48项测试，未复制一套管线。Action均使用现有固定commit；build仅contents:read/pages:read，deploy仅pages:write/id-token:write，needs:build；不改私有仓库和发布目标。
- 实际审计目录app/dist-pages，预提交共677文件、10,955,776字节，其中667份原版资源/清单9,833,987字节、2份运行规则；另为两入口、哈希JS/CSS、Vite映射和三方license。最终提交标识改变时JS命名/总字节可变，以最终artifact核验为准。
- 沿用实际文件白名单、原版及规则逐字节/哈希比对；补充所有JS/CSS的HTTP原字节与当前commit标识断言，以及PNG/OGG/JSON/JS/CSS/HTML/favicon MIME。构建文本额外拒绝token/private-key形状。开发资料、AGENTS、docs、会话、完整client/JAR、参考代码、测试/授物/观察器及私人路径不在允许产物中。无Service Worker、无清档缓存修复。
- 正式构建不导入experiments；P2仅CI回归。原版资源仍直接Git/build，来源/26.3版本及哈希保留；用户发布授权不等于权利方许可，本次不新增授权判断或强制素材替换。

## 当前普通构建浏览器回归

仅使用agent的IAB隔离浏览器和本次独立4222/4223/4224源，没有操作用户Edge/实体桌面或用户正在玩的页面。原生Tab点击/长按/键盘与Playwright可信输入用于操作；evaluate只读取DOM可观测状态，未派发合成玩家事件、直接调用领域命令或修改普通存档。

|本次操作|实际结果/证据|
|---|---|
|普通root新档主页→Settings→邀请|空3D桌、原版English/滑块/静音/重置可用；音量55%/静音保存；static-home-new/settings.jpg|
|普通新档长按原木→E|实际取得原木1进入27格，永久图鉴同步解锁；static-new-harvest.json|
|图鉴复制已取得原木、中文橡木搜索、箱子页|来源无限而真实组独立；搜索筛选、锁定门禁、共享27+9、Steve保留；static-personal-steve.jpg|
|实际原木1→木板4→书填工作台→领取|消耗原木及4木板，工作台进真实快捷栏；static-real-crafting.json/jpg、static-refreshed.json|
|T聊天输入含E/F/Q/数字及尖括号文本；Esc菜单；刷新|文本不触发快捷键、不执行HTML；只显示Game Menu/Options层级，刷新保留实际原木/工作台；static-chat-menu.txt/jpg|
|普通Pages前缀home/game直开、邀请及Settings|原版3D/GUI/资源可用，无测试按钮；static-pages-settings.json及截图|
|独立有限原料样本→蛋糕|先在4222 verification显式prepare cake，仅准备真实3×3材料/实例；随后停止verification，同一端口改为普通静态preview，导航无观察器/game/后才执行玩家操作。这是准备样本，不是新档主线。birthday-preview/taken.json/jpg|
|领取、正常关台、家中放桌|真实3奶/糖/麦消耗，3实际空桶生成并返还背包；取得未完成；命中birthday-table后实际消耗蛋糕并演出，独立主页3D蛋糕；birthday-returned/placed/home-synced|
|刷新、重播、结束、双标签重置|刷新cake=true而active=false；可信重播/Finish后粒子/voices=0；主页正式重置清蛋糕，音量55%/静音保留；测试用户名字段被工具遮盖，用重置后实际聊天<P9_guest>确认；birthday-refreshed、birthday-replay-ended、birthday-reset-home、reset-username-chat、reset-home-empty|

当前工具确实拒绝真实Pointer Lock；首次手势回退可见指针，不据此声称真实锁定/相对移动通过。桌面407像素处几次右击未完成放置，保留birthday-first-gesture-fallback/other-tab-fallback及home-before-placement，不计为成功或擅自归因；改按当前截图的390像素实心桌面后命中birthday-table，cake=true、主手减少，才是有效证据。

视口必须按实际记录：主流程/性能1280×720，DPR1.25。viewport能力只对选定标签生效，其他标签保持原大小；原请求1440截图实为1331×900，标为actual1331x900，不当作1440通过。请求482的Pages目录图实际482×900；部分root图仍1280×720，文件名明确requested482-actual1280。见image-dimensions.json/viewport-observations.json；不编辑图像或用名字冒充尺寸。精确1440/1920四场景及页签的未改路径证据沿用十九项矩阵，不宣称本次重跑全部。

## 未改路径的证据复用

|范围|可追溯记录|本次边界|
|---|---|---|
|最新数量规则普通新档→蛋糕完整主线、主手工具反例、炉耗料、播种12秒|[十九项报告](../p8/experience-19/report.md)“普通新档真实流程”及evidence|运行源码未改，复用；本次新档仅实际走到工作台，不虚报重跑完整主线|
|部分容量/完全满包采收、真实设置草稿/跨标签、写失败Retry|[62041c2修复报告](../p8/settings-harvest-fix/report.md)|13项本次全跑；浏览器容量/故障原样复用|
|漏斗空间网络、多个实例、端口/冷却、旧代次和刷新|[P7续验](../p7/followup-review.md)、world.test.ts|既有空间原型记录不替代最新有限消耗；本次正式389项及当前有限生产链实跑验证现行内核|
|旧档、异常存储、跨标签锁、设置和幽灵生命周期|persistence/settings-regression/book-queue/crafting-queue/furnace-queue/harvest-capacity等正式测试|本次全部执行，未删弱断言；存储故障为明确注入，非用户电脑隐私模式测试|
|模型/GUI/粒子/音频基础、上下文及释放|P2历史报告及本次48项|旧客户端/人工试听缺口不自动转为通过|

## 有界性能核查

固定当前运行源码、链布局（bottom/receiver/producer/top/side五实例，源及燃料均有限）、1280×720/DPR1.25，Chrome155/Windows IAB，WebKit WebGL匿名renderer，有非disjoint GPU timer结果；硬件型号及目标低端设备未知。复用现有正式app/SaveSession/活动时钟/渲染器的verification测量夹具，非另一套业务。普通链在plains，联合链在home并打开真实个人目录、可信Replay触发20秒正式五形状演出。没有降低烟花、停止加工或削减B。

冷启动为进入测量页的初始加载，不计入稳定帧统计；没有定量冷加载性能结论。两个cohort各由Measure开始，再连续5秒预热，之后60秒采样；联合演出前5秒也在预热内，稳定区覆盖余下演出及结束后的GUI/生产。期间无构建、测试、HMR、截图，visibility记录为空。不是60秒持续烟花，也不混称普通静态build的无仪器性能。

|同协议cohort|帧数|p50/p95/p99/max ms|>16.7/33.3/50ms|
|---|---|---|---|
|有限生产链|14364|4.2/4.3/4.4/33.2|2/0/0|
|链+GUI+正式演出|14133|4.2/4.3/8.3/25.0|2/0/0|

原始逐帧、阶段、GPU与LongAnimationFrame记录：performance-chain-1280.json、performance-joint-1280.json，均没有longtask/long-animation-frame条目。联合最大模拟1.7ms、解码校验2.4ms、seal1.1ms、storage0.6ms、UI2.3ms、场景更新0.3ms、CPU提交1.4ms、GPU6.512ms、粒子模拟2.1ms/batch7.2ms、音频调度0.3ms；异步lock-wait31.2ms。普通链最大lock-wait65.2ms，不计作CPU执行。每段240次5tick提交；有界追补及逐tick等价原world-performance测试保留。

联合完整演出记录10次爆炸覆盖五形状、Trail/Twinkle，峰值11913粒子、35次声音调度、非零signalPeak；结束粒子0/voices0、created1/released1，之后手动重播结束同样清理。调度和信号不等于人工听觉通过。

旧104.2ms与545.6ms根因仍未确定；本次两段没有复现，也没有证实需优化的应用瓶颈，故无生产性能改写、无虚构前后优化对照。当前单环境的有限时段支持工程候选运行，不等于目标设备/全浏览器预算已验收。风险为不确定偶发卡顿，保留原始记录及[人工清单](manual-checklist.md)，不以修改报告文字消除风险。

## 放行建议与发布记录

工程候选可交付，等待所列人工体验与独立审查；本轮未发现阻断核心流程、存档安全或现有发布链的代码问题。干净克隆换行缺陷须以最终新克隆与CI通过为放行条件，部署必须成功且线上artifact字节一致才报告已发布。若这些条件失败，保留现状并报告，不擅自历史回退或清档。

真实Pointer Lock、实体右/中拖、OS后台、跨屏DPR、人工试听、Java动态/图标/Steve观感对照、其他引擎和目标设备性能保持待人工/环境验证；不宣布“全部最终验收通过”。恢复步骤见[recovery.md](recovery.md)。最终SHA/Actions/线上标识随交付回复提供；后续审查以Git提交、该run和页面build共同定位，不从旧报告猜“当前版本”。
