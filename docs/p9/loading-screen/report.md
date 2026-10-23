# 原版加载画面与全景背景

基线：`90b7c4b768be1706de8c5f56c9a2e020579bd6c7`。本报告对应包含它的普通新提交；构建标识始终由实际源码提交生成。

## 实际效果与边界

普通`/game/`不再以空黑页等待整个应用。HTML先显示原版全景首面作为网络引导背景，轻量入口加载独立加载画面，再动态导入正式app。加载使用原版字体、绿色细条、中央黑底白/灰方块与六面全景。四按钮和HUD仍到原有首帧就绪条件后出现，面板5秒由此开始。

用户后续明确“区块加载只需要一个平滑动画，我们没有区块”，因此中央图形仅为装饰性加载指示，不表示生成、下载或模拟真实Minecraft区块；没有新增区块系统。其中心方块随平滑就绪值展开。读条只由真实启动阶段推进：启动资源、模块、存档读取、正式资源校验/解码、物品模型生成、规则校验、首帧。各阶段等权分配是依据用户自主执行授权作出的工程决定，表示初始化工作完成度，不表示字节百分比或预计剩余时间；等待屏障时不会自行涨到100%。无假等待或最短展示时长。

范围是用户截图中的游戏入口，主页生日布局保持。

## 原版依据与资源

只读分析锁定的Java26.3客户端，未启动客户端或控制实体桌面。[类/参数摘要](native-evidence.json)记录原始class与shader哈希：

- `LevelLoadingScreen.extractRenderState/tick`：白色Loading terrain、宽200高2的黑底/`#00FF00`读条、50ms tick以float .2平滑；状态格2逻辑像素，无间隙。
- `CubeMapTexture`：+X/-X/+Y/-Y/+Z/-Z分别用1/3/5/4/0/2号图，垂直翻转后立方体采样；`CubeMap`/`GuiRenderer`：视角85°、pitch10°、近平面.05、远平面10。
- `Panorama`：realtime delta tick × .1°，float运算及wrapDegrees；默认约180秒一周。与设备/作物活动时钟及tick sprint无关。
- `Screen`/原版post blur：全景及overlay→原有六pass模糊→原版menu_background→清晰加载内容，不混入未就绪世界/按钮。

客户端jar内的六面图片是1×1占位，初次像素核查发现纯色后未收为有效证据。正式素材来自该版本[官方资源索引34](https://piston-meta.mojang.com/v1/packages/0c8f43b28f837869c1e54a6aeb22c396a1548946/34.json)：六张1024×1024原图及overlay，合计4,109,982字节。`startup-manifest.json`保存官方SHA-1及运行SHA-256，`app/tools/startup-assets.py`可复现提取；普通Git与两种构建均包含它们，不依赖开发机客户端或外部缓存。共享原版字体/菜单背景仍按原清单验证，无改色或手绘替换。

## 生命周期与实际接线

`LoadingScreen`在`#app`之外，正式mount不能将它意外移走。`loadResources`只在成功校验解码后报告数量，`loadCatalogueArt`将实际依赖与模型任务纳入进度，并每8个模型让出一帧，使全景能在批量建图时继续更新。正式规则和第一帧也有独立完成条件。

一次性就绪后移除层、停止RAF、abort监听、释放两张模糊FBO/立方体纹理/几何/材质和临时WebGL上下文。导航离开阻止迟到回调再次显示；真实失败保留可读原版字体错误，不把进度假装完成。加载动画不更改任何存档、采集、计时、物品、聊天或庆典规则，不申请定位。

## 当前证据及回归

- [最终全景A](evidence/final-panorama-a.jpg)、[最终全景B](evidence/final-panorama-b.jpg)：同一隔离页、原生截图，真实转动；[状态记录](evidence/final-icons-state.json)包括spin、就绪值、帧数和正式mount断言。视口1280×720，DPR1.25、逻辑缩放2.4；同一有效工作树，基于上述基线，非Java客户端逐帧对照。
- [资源等待](evidence/resource-wait.jpg)、[真实503失败](evidence/resource-failure.jpg)、[失败断言](evidence/failure-state.json)：测试专用fetch屏障与故障只在隔离`__verify__`，未改资源/存档；使用可信浏览器点击释放。普通构建不包含夹具。
- [首帧就绪](evidence/final-ready.jpg)：加载层消失，正式场景/HUD可用；GPU资源计数归零的断言来自真实LoadingScreen和mount。
- 普通静态构建双入口实测：[根路径加载中](evidence/ordinary-root.jpg)、[根路径就绪](evidence/ordinary-root-ready.jpg)、[Pages子路径就绪](evidence/ordinary-pages-ready.jpg)、[双路径状态](evidence/ordinary-paths.json)。没有测试授物或屏障；另有[规则等待/实际完成度](evidence/rules-state.json)验证七阶段均完成为1。截图为工具返回的真实JPEG字节，后缀与编码一致。
- 579项正式测试（保留原570项，新增9项）及类型检查；P2保留48项；P4仍113物品、112可达配方、2042分类、18步蛋糕链。双路径构建/HTTP/资源字节和内部资料隔离检查见最终交付结果。
- 新断言验证实际资源尺寸/哈希、防占位、固定进度不自行推进、原版float平滑/360°时钟、DPR/窄屏锚点和真实清理方法；不是以scale字段替代画面。

本次浏览器证据是隔离Chromium/IAB，不操作用户真实存档或实体桌面。180秒完整圈的计时公式有确定性测试；连续截图验证实际旋转，不宣称已做Java客户端动态等价、跨引擎、OS最小化、人工试听或跨屏DPR。旧104.2ms/545.6ms未确定峰值结论保持。

## 覆盖矩阵

|项目|当前结果|
|---|---|
|普通游戏入口黑屏|原版首面引导+真实启动读条；无占位按钮|
|全景|正式26.3原图、立方体采样、原版转速/pitch/FOV及模糊|
|中央区块样式|按用户明确要求为装饰动画，没有真实区块|
|完成/失败/导航离开|首帧后交接、明确失败、清理与迟到隔离|
|原有游戏与存档|不改业务合同，现有安全测试全部保留|
|实体/Java/跨引擎|本次未执行，继续独立待验|
