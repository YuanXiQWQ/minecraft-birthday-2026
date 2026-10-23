# 十九项体验整改交付

## 范围与基线

从实际main 68fa0b3（用户格式化）继续，之前38be864已配置Pages。没有回退用户格式化、改写Git历史、重新制作P8或扩大其余P9。原始十九项见[授权原文](authorization.md)，当前行为见[合同](../current-contract.md)，逐项状态见[矩阵](matrix.md)。原合同副本留在prior-contract.md，历史P1—P8测试与失败截图保持。

用户随后新增两处页签反馈，并明确实体电脑检查由用户以后完成。未再操作实体电脑；继续使用内嵌浏览器的原生可信点击/键盘，未用dispatchEvent、授物命令或存档修改冒充普通流程。

## 实现与安全边界

- `domain/crafting.ts`在实际输入上逐批重新匹配、整批交付、扣除材料、放回真实余留物，Shift最多64次且受有限输入/结果/余留容量约束。失败不部分提交，不从图鉴隐式续料。奶桶的原版craftingRemainder生成实际空桶。
- `close-workbench`锁内返还九格实际组并清格；容量不足整笔拒绝，界面保持可恢复、提示腾位重试。`GameInventory.close`等待返还，关闭/导航/退标题不吞料。刷新/崩溃恢复仍读取实例快照，不依赖pagehide异步成功。炉/漏斗内容不套用返还。
- `world-state/state/harvest`按当前选中主手和原版loot函数给实际数量，首次与重复采集都入27+9。满包整体拒绝，保留资源/事实，允许腾位重试；牛奶消耗一实际空桶，播种扣一实际种子。原版小麦种子采用binomial_bonus_count，不将所有来源写成掉1个。
- 原24领取时序、11炉队列、21设置回归、9配方书生命周期及其他既有断言保留。载体门禁、代次/票据、锁、旧回执隔离、跨标签与生日保存顺序不变。旧预期中“合成材料不扣”“仅目录返桶”等按本次明确覆盖调整，不以删除安全断言造通过。
- 当前版本`p8-experience-2`，兼容原p8-inventory-1及更早版本，补默认`sireoh`，不清进度。设置命令校验3–16位ASCII字母/数字/下划线；重置保留最新用户名及原有语言/音量/静音。
- Esc原版按钮菜单、支持的选项子页及T聊天均位于游戏视口。非模态show，不让整个网页inert；场景/HUD局部虚化，外部导航保持可用。导航等待合法关闭和保存。聊天100条/输入历史100条/输入256字符上界，原版位图+Unicode，安全文本，不伪造作者发言、不在hydrate/tick重播消息。
- 两指针模式独立记录desired/actual/pending/epoch。隐藏模式仅在用户手势申请真实PointerLock，相对移动/中心射线不加准星；可见模式自由指针/右拖。E/T/Esc、GUI、隐藏/失焦、重置、场景重建失效化申请及手势；空处右击切换与实际Use/失败/拖动互斥。浏览器失败明确回退。真实锁定成功尚未在可用IAB中取得，不能宣称已验。

满包拒绝关闭/采收、字段命名/字体缓存等属于依据用户自主执行授权作出的工程决定，不冒称用户逐项指定参数。个人关闭仍按未被覆盖的D07清光标/四格，炉/漏斗按实例持久。

## 图标清晰度与光照分别验收

完整链为原版item definition/继承/GUI矩阵/贴图 → 256离屏图标 → 容器、配方书、分类、展开层、页签、HUD和光标各自最终物理密度 → 屏幕。二维精灵nearest、三维模型投影在高密度目标上采样；不是先压到16物理像素再CSS放大。缓存不改共享图标、alpha轮廓蒙版和数量层分离。

测试浏览器DPR实际为1.0000000149011612，之前Math.ceil误进位造成CSS2倍却3倍背板；使用微小浮点容差保留物理整数。四种尺寸GUI物理密度为2/3/4/2；配方书441×498而非147×166再放3倍。`final-tab-and-framebuffer-chain.json`、最终`verified-seam-*`保存实际rect/backing。并列布局的奇数物理宽度向像素边界取整，避免桌面半像素边沿。未模拟DPR2，不声称跨显示器DPR实测。

原木、木板、工作台、箱子、楼梯、台阶、漏斗和工具在真实背包/图鉴/工作台配方书的图像及原始背板见native-icons-*、icon-native-workbench-*、final-book-aligned-*和verified-seam-*。截图为浏览器CSS分辨率JPEG；JSON所指PNG是实际画布toDataURL原像素，未重采样。对照裁切另有源图与坐标，未修改效果。部分较早图是中间失败/改进对照，不再作为最终接缝证明。

光照单独采用只读Java26.3 `Lighting.ITEMS_3D`及原版`shaders/include/light.glsl`：归一化(.2,1,-.7)/(-.2,1,.7)，原矩阵的Y/Z和GUI坐标转换，强度clamp(.4+.6×正dot之和)。纹理以编码RGB进入GUI着色，不再混入世界Lambert/色调映射/重复输出转换，alpha单独保留。资源shader/hash可审计，`icon-light.ts`测试方向对比而不是全图亮度。浏览器画面已检查，但未启动Java客户端做同尺寸并排，不能标记为完全原版等价。

## 页签后续反馈的实际修复

用户指出未选中遮挡及搜索选中连接不连贯。根因有三层：所有页签共用高层级；将26×32精灵画成28×32且向下多偏2像素；随后使用transform定位父nav形成独立层叠上下文，使选中子按钮无法越过容器。

现在nav不形成变换层叠上下文，以relative left跟随容器；未选中z0、面板z1、选中z2。原版26×32，27逻辑像素间距，面板上方28像素，选中底部4像素接入；195宽搜索页与176宽个人页各自定位，展开书后跟随人物面板，窄屏书覆盖时不留浮空页签。

最终证据仅以`verified-seam-{personal,directory}-{1280x720,1440x900,1920x1080,482x900}`为准。`verified-seam-layouts.json`核对父transform为none、尾页签与容器右边一致；`verified-seam-pixels.json`在八个实际截图连接中心取样均为(198,198,198)，未穿过黑白框；同源裁切*-join.png。较早tabs-layer/accepted-tabs截图保留为中间证据，不能算最终接缝通过。

## Steve与GUI

根据tilt→body→native→head的完整矩阵及native(.9375,-.9375,-.9375)，头部相对yaw在坐标共轭后须与body相反，最终正面向量才追踪鼠标；没有自动转台/动画。8个方向调用正式PlayerPreview.draw、实际Group.updateMatrixWorld与最终正面向量断言，重复同鼠标稳定。原六身体部位、外层、盔甲与双手保持。

`steve19-{center,left,right,top,bottom,top-left,top-right,bottom-left,bottom-right}`各有完整GUI、PNG实体背板、鼠标/窗口/缩放/DPR和裁切；按Enter触发只读捕获避免鼠标移到捕获按钮影响姿态。九图alpha范围均完整且未碰顶底，左右/上下/四角实际图检查有人物、身体和头部反馈。`steve19-poses.json`、`steve19-visual-check.json`记录坐标/颜色/完整范围；非空检查只是防止误收纯色图，不替代原版姿态对照。Java逐帧、穿戴头盔的九姿态并排仍属用户外部复核。

结果框不再叠普通slot；标题按只读InventoryScreen/CraftingScreen/AbstractFurnaceScreen规则。普通悬浮采用原版前/后精灵；quick-craft白色128覆盖与raw数量越界黄色分支，不用strokeRect或count==max造黄色。真实右/中拖动未宣称验收。

## 普通新档真实流程

4202的普通/game/页面，最初新档通过真实界面取得原木；后加verification只读观测，未更换业务入口、预置进度、unlock命令或调用领域方法。主动从已取得图鉴复制材料属于正常玩家无限来源，之后均在实际27+9中消费。

1. 原木1→木板4→四格消耗得工作台1，实际放置消耗工作台；图鉴主动复制木板，配方书填料制作木棍和木镐。
2. 木镐已解锁且位于未选中快捷格，实际空手长按石头：目标清除但不掉圆石、无取得事实；选中木镐长按邻石才给圆石。石镐再采铁得粗铁1。代码trace保存实际选中/工具与实际事件，工具资格测试涵盖不在手中的所有反例。审查所述空手掉落在当前普通页面未复现，不能编造根因；确认旧通用“采集成功”反馈会误导，将其改为实际items-acquired才提示。
3. 实际放置炉、放粗铁与木板燃料，经历原版200tick，输入扣1/燃料扣1；输出铁1尚未永久取得，成功领取才解锁。`iron-unclaimed-1280`保存输出/事实；较早furnace-unclaimed是175tick进度，不能冒称当时已出铁。
4. 合法复制取得的铁组、消耗3铁做桶，实际牛Use消耗空桶得奶；采鸡蛋、甘蔗。真实草loot随机：前20次未得种子记录保留，后续采集得种子1，不伪造必掉。
5. 实际种子右键耕地播种扣种子；打开GUI继续活动生长，观察140tick到240tick，成熟采得小麦1/种子2，地块恢复空耕地。甘蔗合糖消耗1。
6. 主动从已取得目录补齐3奶/糖/麦，工作台填入真实材料。Cake预览不完成；领取实际Cake1并生成3真实空桶；正常关台返还桶到实际背包3、九格清空。`cake-preview-real-inputs`→`cake-taken-three-real-buckets`→`workbench-close-real-return`。
7. 家中选中实际蛋糕Use桌，锁内先保存完成并消费蛋糕，随后播放庆典；独立主页显示3D蛋糕，刷新不自动重播。`cake-placed-celebration`、`home-cake-synchronized-1280.jpg`。没有新增一键完成。另实际制作箱子、漏斗、楼梯/台阶作图标对照，材料真实消耗。

另真实聊天输入`Hello 你好 <script> E R F Q 123`作为安全文本，默认sireoh；通过Options保存sireoh_test，不改变生日专名；外部Plains导航可关闭设置。中文“橡木”图鉴搜索真实返回橡木相关项，原版选择/字段绘制证据catalogue-unicode-selection。系统IME候选、物理粘贴和Windows焦点不冒称通过。

## 性能与工具边界

单独4204验证源，`/__verify__/performance.html?layout=chain&joint=1&gpu=1`，显式夹具五设备有限链+已完成重播。普通流程的4202存档未被该夹具覆盖。开启真实背包并点击既有Replay，5秒预热+60001.9999ms连续测量；期间无构建/单元测试/HMR/截图，实际visibility数组为空。环境Chrome155/Windows，WebKit WebGL，DPR约1，1280×720；不是低端设备预算或用户批准门槛。

- 13,349帧，p50 4.2ms/p95 8.2ms/p99 12.5ms/max104.2ms；>16.7/33.3/50ms为36/3/1。
- 粒子模拟max3.2ms，粒子batch max6.9ms，CPU提交max1.6ms，GPU timer max8.918ms；音频调度max.4ms。
- 240笔实际5tick推进：模拟max1.5ms，校验max1.8ms，seal max1.2ms，storage max.3ms，UI投影max1.3ms；排他锁等待异步跨度max100.3ms，不能把等待时长当作CPU执行。
- 长动画帧原始归因保留：启动阶段51.3ms记录birthday按钮脚本16.4ms（强制布局12ms）及首次场景提交30.5ms；另65ms/106.5ms记录没有脚本归因。104.2ms峰值不能据此归为GC/自动化/GPU或某个函数，也不声称消除旧545.6ms。最终UI页签定位调整后未重跑相同60秒负载，不伪装为优化前后对照。

`joint-chain-gui-celebration-1280.json`保存逐帧/阶段/GPU/LongAnimationFrame。短时高端本机结果不等于正式性能验收。用户要求不操控实体电脑后，未再做实体测试。IAB实际拒绝PointerLock；7项正式类测试验证状态机，不代替成功实际锁定。Java客户端未运行、人工试听、OS后台/最小化、右/中拖动、跨引擎、DPR2仍未验。

## 自动化与复现

- `cd app; npm run check`通过；正式`npm test`376/376（原341保留，加35），失败中间日志留在忽略测试目录。新增实际类/真实SaveSession、正式矩阵、工具loot、关闭返还、版本/用户名及局部外侧点击边界测试。
- `npm run data:verify`：113物品、112可达配方、2042已分类、18步蛋糕链、输出/导出器hash通过。用户格式化改变项目导出器/适配器源文件hash，更新项目源码来源记录；原版资源与官方输入hash未伪改。
- `cd experiments/scene3d; npm test`48/48。两种普通构建与HTTP逐字节资源/开发资料隔离检查见最终运行结果；不将验证观察器、完整客户端、docs/原实验资料打入网站。
- 本机普通`npm run dev`访问/game/，无需特殊加载。E打开、指南针/箱子切换；T聊天；Esc菜单。`npm run build:pages`/preview:pages核对仓库前缀。根路径及Pages实际静态HTTP遍历每个清单资源并比对字节。

源码/资产/证据/文档使用普通新提交及快进推送，Pages沿用已有main工作流。Git SHA和实际远端/部署状态在最终交付报告，不能在提交前伪填。完成后停止审查，不自动扩展其他业务。

最终运行日志：evidence/check.log、formal-tests.log、p4-data.log、p2-regression.log、root-build.log、pages-build.log、static-http.log及checks.json。两路径667份原版资源/清单共9,833,987字节均逐一HTTP比对通过；版本化规则单独验证，开发/测试路由均404。原始画布920个引用按SHA256去重到157份不变PNG，JSON保留捕获名、rect/backing与哈希，不重采样。

静态产物真实浏览器补验：4205根路径个人页含完整Steve、4206仓库子路径主页实际3D桌和邀请→/game/→原版目录均可用，无Capture/Measure/测试授物按钮；ordinary-root-build-personal-1280.jpg、ordinary-pages-home-1280.jpg、ordinary-pages-directory-1280.jpg与static-browser.json。截图/观测中的build字段为编译时HEAD 68fa0b3加本次工作区源码，不冒称纯基线提交具备新功能；main部署会重建为最终新提交标识。
