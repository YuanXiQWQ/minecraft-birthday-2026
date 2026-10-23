# 聊天边界、狭小矿洞与世界方位指南针

基线1cd19d5c6f89ecf0edb3555e4bcc00cb13550da6。2026-10-23最新用户决定生效；此前catalogue-review中“固定左上/compass_12”的实现判断错误，不能再作为当前规范。该历史报告与原截图保留，不改写当时结果。物品搜索页自动聚焦保留，配方书不被强制聚焦。

## 当前聊天合同

自动系统聊天只保留：首次永久取得、操作说明、图鉴教学、场景切换、存档状态转换、蛋糕放桌、失败提示。放置/旋转/播种成功、普通入包数量、挖除成功不再发送聊天；存档不是每次tick都发消息。

`ui/system-feedback.ts`集中判定自动聊天，所有进入聊天的失败采用Java `ChatFormatting.RED`的`#FF5555`，包括容量余量、位置/操作/桌面要求、指针锁、声音及存储异常。初始化前消息经同一策略重放。`items-acquired`数量收据未改，仅容量余量生成红色聊天。

这不是全局删除反馈：配方Toast/动画/声音、Tooltip、GUI及设置内就近提示、玩家主动聊天、破坏粒子/声音、生日祝福与演出全部保持。策略只作用于自动聊天发送入口。

## 指南针原版依据与实现

只读现有Java26.3官方client.jar，SHA1 e877b6a07acd633fb3bb475002175cec036e7b87，不启动客户端。类哈希及方法证据见[原版核对](world-compass-native-evidence.json)。

- CreativeModeTabs创建真正COMPASS物品；CreativeModeInventoryScreen经GuiGraphicsExtractor.item传入实际player/level，不存在“菜单强制左上帧”规则。
- CompassTarget.SPAWN读取ClientLevel.getRespawnData().globalPos；有效同世界目标使用目标方块中心与观察者XZ的atan2方位。无有效目标才随机旋转，无owner才回退0。本项目有合法固定目标，不能拿这两个退化分支代替正常指南针。
- CompassAngleState取原版视觉yaw，使用20Hz wobbler：最短环绕差、0.1弹性、0.8阻尼；输出经原版range_dispatch(scale32及半帧阈值)选原始模型/纹理。不是旋转一张图片。
- `SceneView.compassView()`从真实相机读取位置和朝向，转换Three yaw到Java yaw；`NativeCompass`复现float边界、一次tick更新及代次惯性失效。全部32帧预渲染至有界CPU图标缓存，原有一次性图标WebGL渲染器随加载释放，没有逐帧新增上下文。
- **依据用户自主执行授权作出的工程决定**：四个作者场景属于同一项目世界，固定出生参考方格为[0,0,0]，实际导航目标为该方格中心；当前眼位保持[0,1.62,7]。这是项目坐标选择，不冒称用户指定，也不是固定屏幕方向。转向后针的屏幕角度改变，指向的世界地点不变。未新增走路、传送导航或随机世界。
- 原版compass item definition、32模型和32纹理正常入Git/build。总737份运行文件（含9清单；增加62个原始模型/纹理），哈希照常校验。113项物品注册表不扩充成新玩法。

## 狭小矿洞

查阅[2015年自然洞穴游玩记录](https://endless.ersoft.org/using-minecraft-to-study-level-design/)（正文可读，但其Torches0/1历史图片实际返回404，未将这些缺失图片记作已观察的视觉证据），并用[官方洞穴更新说明](https://www.minecraft.net/pt-br/article/caves---cliffs-part-ii-the-features)区分旧洞道与新大型noise洞穴。低顶、转折、不规则分支是作者场景造型，不冒充26.3完整生成算法。

`domain/cave-shape.ts`共享有限作者洞体：入口约6格宽、2–3格顶高，内侧矿脉凹室、窄工作袋和后方弯曲2–3格高洞道，墙/顶有层差；不复刻完整carver或随机生成。移除原大跨度平顶大厅。原版stone真实实例、透视/遮挡、眼位与所有来源坐标保留。

新放置以实际洞壁实体判断，不划专用禁建区。对原存档中因背景收窄落入洞壁的既有设备，仅在显示壳体中保留邻域和可视通道，不移动、删除或清空实例/内容；逻辑仍不允许新设备穿墙。

## 验证与限制

- 正式新增6项：聊天白名单/红色容量；原版32帧阈值与四方位；wobbler浮点及tick/代次；正式相机桥接；洞体与旧实例空间；生产AuthoredWorld+SceneView.pick实际几何的全部矿石逐层可达及旧炉可见、内容不变。
- 浏览器普通/game/使用独立4250来源新档，无授物：真实点击切Cave/Home、真实短右键桌面；红色失败截图与消息runs有原始证据。搜索页原生E自动聚焦仍验。
- 隔离world fixture的相机姿态按钮调用正式SceneView.movePointer、compassView和正式图标加载器；固定tick采样得到不同相对针帧，附实际WebGL画面和目标/眼位/yaw数据。**这是受控姿态测试，不冒称实体右键拖动或Pointer Lock通过。**
- 原版几何审计全部来源可达；密集合法设备逐个可拆：平原126/126、矿洞75/75、农场45/45、家40/40。洞壁变化后审计必须按当前WORLD_REGION过滤实际合法方格，并经syncWorld生产接线，不把原大房间126个位置继续假称全部合法。几何剥离不是人工操作证据，也不是所有任意混合布局的穷举。
- 真实截图、观测见[world-compass-evidence](world-compass-evidence/)。浏览器原生输入与受控fixture分开标识。Java动态并排、实体右/中拖、真实锁定、OS后台、跨引擎/人工试听仍未验。既有长帧不因这三项变更被宣称解决。
- 最终完整检查及上线状态见交付回复；本项不重开玩法、存档合同或庆典。

截图检查：最初批量点击/截图的姿态观测滞后一项，保存为invalid-stale/invalid-batched，不能作为方向通过证据。有效姿态仅采用分步确认后的compass-left/center/right-final及相应JSON。普通页面实际1280×720；fixture尺寸/DPR取各自JSON，不能把一次视口设置请求当作实际1440通过。

完整检查：类型、正式428/428、P2 48/48、P4 113物品/112可达配方/2042分类及哈希核验通过；根路径与Pages普通构建、全部737份资源字节与HTTP双入口检查2/2通过。未移除原领取/炉队列/设置草稿/生命周期测试。
