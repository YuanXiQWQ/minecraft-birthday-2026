# P6 定向修复：图标轮廓蒙版与Steve玩家预览

日期：2026-10-21。基线：`539942da4620e5cb43b51ac7ae25fd6097872ead`。本次仅处理这两项显示问题及直接依赖，不扩展合成、炉、高炉、漏斗、配方书或后续阶段。D04、D05完整合同/A返还、D07与领取票据门禁保持；不修改存档结构、配方、生日主页、世界摄像机或移动方式。

## 修复前后

修复前`GameInventory.draw()`在图标之后填满16×16黑矩形；人物区域只有原版背景，没有玩家模型。这两项均为不完整实现，不是用户接受的最终方向。[此前真实截图](evidence/receipt-race/after-receipt.png)保留原文件与原始报告，不改写过去的验收结论。

现在所有目录页面均按最终图标alpha轮廓遮黑；个人背包和装备页显示真正的三维Steve、原版外层皮肤、已提交装备与双手物品。工作台没有增加人物。

- [最终1280×720个人界面](evidence/gui-visual/steve-locked-1280-final.jpg)
- [蒙版局部原始截图，可放大查看](evidence/gui-visual/mask-detail-final.jpg)
- [Steve局部原始截图](evidence/gui-visual/steve-detail-final.jpg)
- [完整1440×900 GUI](evidence/gui-visual/steve-1440-fullpage.jpg)
- [1440×900视口的铁盔甲/双手样本](evidence/gui-visual/armored-desktop-1440.jpg)
- [800×600视口的装备页](evidence/gui-visual/equipment-narrow-800.jpg)、[个人页](evidence/gui-visual/personal-narrow-800.jpg)
- [普通构建默认显示](evidence/gui-visual/ordinary-build.jpg)

截图均来自实际页面，没有编辑补人、改蒙版或重采样；局部图使用浏览器截图clip。工具返回JPEG，因此新截图按实际编码保存为`.jpg`。`screenshot-index.json`保存实际截图尺寸：完整页截图为1440×900，部分viewport截图受工具捕获边界影响为1331×900或785×589，但GUI完整；相应JSON单独记录实际DOM视口1440×900/800×600，不能用文件名替代尺寸证据。

## 图标蒙版

`ui/icon-mask.ts`逐像素保留最终RGBA的alpha，把RGB覆盖为黑色。遮罩在独立透明canvas中生成，绝不把槽位背景作为合成输入。`GameInventory.stack()`统一选择原图或遮罩，然后独立绘制数量文字；所有目录页共用，不影响快捷栏、光标与结果图标原色。

缓存是`WeakMap<最终帧canvas,遮罩canvas>`。原版图标缓存不被修改；动画使用各自不可变帧对象，更新帧即选择对应遮罩。解锁后直接选择原图，不缓存“已锁定”状态。空Stack直接返回，不接触画布。CSS悬浮高亮、槽边框、Tooltip与领域取得权限没有改动。

验证器读取正式GameInventory实际使用的图标缓存，并在 **与正式GUI相同的canvas尺寸及绝对绘制坐标**生成参考；比较完整18×18槽位、alpha为0的位置及边框，另逐像素检查64×64遮罩alpha和源图不变。没有放宽误差容限。

| 样本         | 16×16目标中透明像素     | 最终alpha/槽位/透明区/边框差异 |
|--------------|-------------------------|--------------------------------|
| 木棍         | 219                     | 全部0                          |
| 木镐         | 188                     | 全部0                          |
| 鸡蛋         | 166                     | 全部0                          |
| 奶桶         | 110                     | 全部0                          |
| 三维原木图标 | 个人页84；装备/目录页83 | 全部0                          |

原木目标透明像素数因nearest采样的绝对目标坐标不同而差1；其原始64×64alpha没有改变。参考采样与正式绘制使用同一位置，透明区不出现额外黑像素。`locked-personal-final.json`、`locked-equipment-final.json`、`locked-catalogue-final.json`全部通过；`unlocked-all-final.json`五项均已解锁、恢复原色并通过相同像素比较。重开及刷新后的原色检查也有`unlocked-personal-final.json`记录。

原始失败记录保留：初次独立GPU重渲染/18×18局部参考画布在原木边缘出现一个像素（3个RGB通道）不一致，见`independent-raster-mismatch.json`、`small-canvas-*-mismatch.json`；最终验证使用实际帧与相同绝对采样坐标消除此参考差异，没有删除断言或改变生产蒙版来掩盖结果。初始资源总数断言478→490的失败也保留在日志，随后按新增资源实际数量更新断言。

`locked-tooltip-keyboard.jpg/json`记录真实Tab焦点显示“Stick / Not unlocked yet”，随后数字1仍不能取得。实际坐标鼠标点击及中键尝试保留空光标/九格；全113物品的越权路径继续由原有领域测试覆盖。浏览器工具会拒绝直接操作aria-disabled定位器，因此没有把定位器失败当作游戏取得门禁通过。

## 原版玩家与资源来源

唯一输入仍为已取得、SHA-1为`e877b6a07acd633fb3bb475002175cec036e7b87`的Java26.3客户端；本次使用已有JDK `javap -p -c`只读检查，没有启动Java客户端、安装工具、连接皮肤服务或下载新客户端。

`resources/minecraft/26.3/player-manifest.json`记录原始依赖SHA-256、13个相关客户端类哈希及提取器哈希。新增11项原始资源：

- `textures/entity/player/wide/steve.png`：默认Steve宽臂64×64皮肤，SHA-256 `06628f9cef88520da742ab280a01677ce17c99717f964ed89ed791673121094c`。
- `equipment/iron.json`及`textures/entity/equipment/{humanoid,humanoid_leggings}/iron.png`：当前可达铁盔甲的原版定义及64×32atlas。
- `models/item/{wooden,stone,iron}_spear_in_hand.json`、`spear_in_hand.json`及三张对应持物纹理：原版第三人称路径实际新增依赖，不能用其GUI图标代替。

382项资源依赖中371项复用已有素材。普通Vite现在发布490资源/清单（486原始资源、4份清单），完整客户端和class字节不进入产物。正常克隆运行不需要提取输入；重新提取仅用于审计：

```powershell
node app/tools/player-assets.ts --client <同哈希client.jar>
```

本次没有恢复外部缓存、手动加载按钮或原版资源禁令，公开发布权利事项仍按原索引独立处理。

| 同版本静态依据                                                                                | 实现与边界                                                                                                                    |
|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `PlayerModel`、`HumanoidModel`、`ModelPart$Cube`                                              | 头、身体、宽臂双臂、双腿及原始Cube UV；hat外扩0.5，其余外层0.25；保留皮肤透明区与左侧独立UV                                   |
| `LayerDefinitions`、`HumanoidArmorLayer`、`equipment/iron.json`                               | 头/胸/腿/脚对应可见部件；外层1、护腿0.5、腿部-0.1修正，左侧镜像与32高atlas；只支持当前可达默认铁四件，不声称支持饰纹/装饰组件 |
| `AvatarRenderer.scale`                                                                        | 0.9375实体比例；显示于原版人物窗口                                                                                            |
| `InventoryScreen`                                                                             | 个人窗口(26,8)–(75,78)、scale30；鼠标相对中心/40取atan，body/yRot/xRot的20系数；屏幕坐标转换至Three坐标                       |
| `CreativeModeInventoryScreen`                                                                 | 装备页窗口(73,6)–(105,49)、scale20；保留原版面板背景                                                                          |
| `HumanoidModel.poseRightArm/poseLeftArm`、`ItemInHandLayer`                                   | 静止持物姿态及手部附着；没有行走、自动旋转或攻击动画                                                                          |
| item definition、父模型、`ItemTransform`、`ItemModelGenerator`、Shield/Chest special renderer | 左右thirdperson分支、原始display变换/UV/色调、生成物品前后面与alpha边缘厚度、特殊模型；组合模型原始0..1变换中心有独立回归     |

`PlayerItems`复用既有模型继承/编译能力。原`iconParts`新增可选display context，GUI默认行为不变；catalogue适配源码哈希重新生成，113图标原始依赖/名称未减少。双手模型不使用GUI截图或通用图片。持物动画贴图复用既有textureFrames/animationAt按原版mcmeta取帧，使用现有显示时钟，不增加计时器、不修改源图或存档时间；不加入人物行走动画。

`PlayerPreview.sync()`只投影最新`permanent.progress.player.data`：验证过的装备槽组件、选中九格与副手。未提交乐观布局不是其稳定数据源；失败/回滚、跨标签更新、刷新和重置仍通过原会话反映。没有新增持久字段或解锁操作。

## 渲染、输入与生命周期

每个正式GameInventory只创建一个可复用的玩家WebGL渲染器及透明canvas，放在屏幕二维GUI的原版人物窗口。canvas为`pointer-events:none`，按窗口尺寸裁切，原GUI背景留在下面，装备槽/物品格/Tooltip位于原有输入体系。没有世界面板、Pointer Lock、准星或移动。

预览使用独立framebuffer，不改变世界renderer的viewport/scissor/清屏/深度状态。GUI整数scale与实际DPR驱动像素尺寸（采样预算上限DPR2）；CSS窗口比例不变。没有新增RAF；打开且应显示人物时响应鼠标或既有UI重绘，关闭、工作台/目录/预设页隐藏，不渲染人物。卸载时释放实例几何、材质/纹理缓存、renderer及context；反复打开不创建新context。

浏览器8轮关闭/重开后只有一个预览canvas，关闭display=none，见`repeat-open-close.json`。未装备模型为12份几何、1张纹理；已装备及双手样本有对应有界计数。`held-models-final.json`以另一份测试专用渲染器逐项执行113物品×左右手=226个上下文，全部运行无错误，结束调用dispose；这是实际浏览器模型/资源执行检查， **不是113项人工Java视觉对照或长期GPU泄漏验收**。

## 真实浏览器状态与交互证据

Windows/IAB Chromium155。使用真实Web Locks和localStorage；授物/装备夹具只在4184隔离验证源，不修改4183/4185普通用户存档。浏览器工具的鼠标/按键记录为`isTrusted=true`，与Node测试事件替身及用户实体设备验收分开。

| 检查                          | 证据与结论                                                                                                                                                           |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 新进度/无装备Steve            | `steve-locked-1280-final.jpg`；六个身体部件及六外层存在，头脚完整、无槽位覆盖                                                                                        |
| 四件铁盔甲、镐/盾与其他主副手 | `armored-desktop-1440.*`；真实稳定命令夹具装备；实际UI卸头盔、目录F复制副手、F槽交换、选中第二格原木均更新模型，见`unequipped-held-change`、`f-swap`、`selected-log` |
| 鼠标观察                      | `pose-left-final.*`/`pose-right-final.*`：实际指针位置改变，body/head/pitch数值与图像改变；持久布局和世界look记录不变，无自动转台                                    |
| 刷新恢复                      | `refresh-equipment.json`：无头盔、其余三甲/副手蛋/选中原木均与已保存事实一致，个人光标为空                                                                           |
| 跨标签卸装                    | `cross-tab-unequip.json`：另一真实标签卸头盔并关闭，本页预览与存档同时为head=null，其余装备保留                                                                      |
| 重置                          | `cross-reset-with-player.json`：清装备/九格/实例/解锁、不复活光标；随后新Steve窗口与锁定图标正确。最终也经正式设置UI重置隔离测试进度                                 |
| GUI页面边界                   | 个人/装备页都显示；`workbench-no-player.json/jpg`中真实3D实例工作台3×3没有data-player，预览display=none；不把个人预览加到设备窗口                                    |
| 尺寸及DPR                     | JSON观察值1280×720、1440×900、800×600；`native-dpr.json/jpg`为1280×720、DPR1.25、实际framebuffer183×262；另有DPR1记录。GUI缩放后头脚完整、比例正常，不覆盖输入格     |
| 默认正常构建                  | 4185普通/game/原版GUI与Steve直接显示；`ordinary-build.json/jpg`，无验证夹具或加载按钮；控制台采集无warn/error                                                        |

当前工具截图捕获边界与DOM视口尺寸已分开记录，完整1440图使用fullPage获取。没有修改截图填补或放大人物。

## 领取竞态与业务回归

生产`inventory-input.ts`、`SaveSession`及领域合成算法本次未改；领取门禁、票据身份、队列和D07回执epoch保留。新增显示层在`clearPersonal`隐藏、dispose释放，不改变退出语义。

`race-*-with-player.json`是真实浏览器中已解锁产物的延迟回执：

1. 个人原木预览4木板，开启测试专用延迟；人物同时显示三甲与双手物品。
2. 等待中点击空九格4、数字4从目录复制均被拒绝；acquiring=true、光标空、目标格空。
3. 释放真实事务回执：光标4木板、目标仍空、门禁false，装备/人物稳定布局不变。
4. 新点击成功把4木板存入九格4；重复延迟领取后Done关闭，释放仍不复活光标或个人四格。

首次解锁/重复领取/合并、2×2/3×3、失败写入、布局冲突、重置、实例拆除、卸载和旧票据清理等原24项真实SaveSession时序测试全部保留并通过；本次没有用规则测试冒充实体拖动。

## 自动化检查

原始输出位于`evidence/gui-visual/`，观察记录的二次断言摘要见`assertions.json`。初期资源数量断言/像素参考失败均保留，没有覆盖P1/P2/P3/P5/P6历史报告。

| 检查                                         | 结果                                                                    |
|----------------------------------------------|-------------------------------------------------------------------------|
| `npm --prefix app run check`                 | 通过                                                                    |
| `npm --prefix app test`                      | 141/141，含原24项领取回归、新8项显示/几何/资源/空槽/文字分层合同        |
| `npm --prefix app run data:verify`           | 113物品、112可达配方、2042分类与18步蛋糕链/哈希通过                     |
| `npm --prefix experiments/scene3d test`      | 48/48 P2关键回归                                                        |
| `npm --prefix app run build` / `build:pages` | 根路径/Pages构建与资源审计通过                                          |
| `npm --prefix app run test:built`            | 两路径真实HTTP、两入口、全部490资源字节与规则通过，内部/测试资料路由404 |
| JS/HTML额外扫描                              | 无visualChecks、装备/像素夹具、延迟通道或P3_TEST_ONLY泄漏               |

没有新依赖、工程或部署。仅普通新提交及快进推送，不修改历史。

## 本机复现与剩余边界

普通模式：`npm --prefix app run dev`，进入/game/，E→Crafting/Equipment即可查看默认Steve与锁定轮廓；无需外部资源缓存。正常build/preview同样可用。

可复现的隔离验证：`npm --prefix app run dev:verify`，同时打开`/__verify__/index.html`和`/__verify__/input.html`。新进度先检查三种目录页的“Run GUI alpha pixel checks”；“Fixture: unlock catalogue”完成后再查原色；“Fixture: equip Steve sample”仅通过真实会话命令设置四甲/主副手。实际卸装、Esc/E/Done、F/数字选格、移动鼠标、刷新及跨标签检查；“Run held model dependency checks”执行113样本；原延迟按钮可重复领取竞态用例。这些测试操作不进入普通应用。

尚未执行真实Java26.3客户端并排视觉对照，完整Java着色/光照/像素采样一致性不能声称通过；当前证据是同版本资源/字节码、实际浏览器模型及代表性画面。当前只实现默认Steve、可达默认未饰纹盔甲/物品，不新增在线皮肤、饰纹业务或攻击动画。实体右/中键拖动、真实窗口失焦及跨浏览器沿用既有人工清单，本轮不虚报完成。

两项要求已形成可运行实现、明确的像素/状态断言和浏览器视觉证据，交付后停止等待独立审查；不自动推进后续功能。
