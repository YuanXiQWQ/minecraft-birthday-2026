# 游戏启动残留清理

基于955a3a4，处理用户截图中加载时短暂出现的底部说明及未套用原版素材的导航按钮；不改变聊天七类、玩法、主页故事或存档。

## 原因与修正

| 项目 | 正式路径中的原因 | 当前行为 |
| --- | --- | --- |
| 空桌说明、场景名等底部小框 | home/game共用装配仍给game挂载table-caption；reflect先写home.empty，再写scene名；chat-ready前的CSS重新显示该节点 | game不再挂载或赋值桌面说明、主页copy及独立save-status；删除相关启动CSS。主页保留原有展示 |
| 顶部普通字体/灰色按钮 | nav先进入DOM，原版PixelUI随后异步装饰；图标、规则和HUD尚未完成就启动面板控制器 | GameStartup保持实际尺寸但隐藏未完成世界/GUI与nav，并阻断输入；原版素材、目录、规则、HUD及首帧就绪后统一呈现 |
| 初始5秒被加载耗掉 | NavigationPanel在目录/规则加载前创建 | 完整游戏可见时才创建控制器；展开、悬停、离开5秒、圆角小边沿用已验实现 |
| 真正启动失败 | 不能与正常说明一起静默 | 独立本地化红色role=alert显示资源/WebGL失败；未完成按钮不露出。存档与运行中反馈继续原通道 |

导航和世界尺寸通过visibility保留，避免隐藏期间测得0尺寸。异步初始化在页面销毁后不能重新发布。没有添加加载说明、测试按钮或授物路径到正式入口。

## 本次证据

隔离浏览器Chromium、1280×720；使用实际mount及正常资源，验证模式只在fetch入口延迟请求并提供明确的TEST ONLY释放按钮，不改存档/资源/业务，不是完整新档主线。

- [初始资源](resources.json)、[图标阶段](icons.json)、[规则阶段](rules.json)：真实DOM记录显示loading期间nav/world不可见，game的caption/status/copy不存在；释放后原版按钮、首帧、inventory、chat同时就绪，所有断言通过。
- [主页](home.json)：实际mount('home')仍有生日故事、邀请和桌面说明。
- [资源503](failure.json)：实际加载器失败路径进入failed并显示错误，不显示部分游戏或按钮。
- 慢加载实际截图：[resources](evidence/resources-held.jpg)、[icons](evidence/icons-held.jpg)、[rules](evidence/rules-held.jpg)。其中右下角TEST ONLY按钮仅属隔离验证器。
- 普通根路径preview真实输入：场景按钮切换、面板小边点击展开、E打开物品目录且搜索自动聚焦、Esc关闭均成功。[完整游戏](evidence/ordinary-ready-panel.jpg)、[收起后](evidence/ordinary-ready.jpg)。图中的Plains/Cave是保留的场景切换聊天，并非已删除的底部说明框。
- 普通Pages子路径preview真实打开及Esc菜单正常；没有验证器或手动加载按钮。

## 检查与边界

- 类型检查通过，正式463/463（保留459项，新增4项启动门禁测试）；已有面板计时测试继续通过。
- P4：113物品、112可达配方、2042分类、18步蛋糕链，来源及导出哈希一致；P2关键48/48。
- 根路径与Pages子路径普通构建及HTTP资源逐字节检查2/2；startup验证页在普通产物中为404，开发资料仍隔离。
- 本项无存档/资源/配方/领取业务修改。历史实体输入、人工试听、跨引擎、Java客户端和性能峰值缺口保持原状态，不以本次检查替代。

复现：`npm run dev:verify --prefix app -- --port 4262`，访问`/__verify__/startup.html?stage=resources`、`stage=icons`、`stage=rules`；点击TEST ONLY释放按钮后查看隐藏的startup-evidence JSON。`failure=1`验证503；`page=home`验证主页。普通页面使用`npm run build --prefix app`及`npm run preview --prefix app`，无需任何夹具操作。

提交与线上版本以Git提交、同SHA Actions和线上脚本BUILD_ID分别核实，不把本地测试当作部署成功证据。
