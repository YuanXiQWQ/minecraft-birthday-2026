# P9 原版界面定向整改交付

当前后续修正见[聊天/矿洞/指南针](chat-cave-compass-review.md)：自动聊天七类、原版红色失败、低顶洞道和固定世界目标指南针，覆盖固定左上的错误解释；以下保留原八组测试事实。

源码基线：`4eade6d684a9d110761e4f1bde3f7ec54e626d7e`。本报告对应[八组用户授权](authorization.md)。P9原有干净构建、字节审计、数量/存档安全、十九项整改和生日闭环保留；本次没有新增玩法或重做庆典。最终提交、CI、部署与线上构建标识分别在交付回复中核实；网站的 `#app[data-build]` 由构建时 Git SHA 自动注入。

## 原版依据与八组完成矩阵

只读分析官方 Java 26.3 client.jar，SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`。没有启动Minecraft客户端，也没有操作用户实体桌面。逐类/资源的原始大小和SHA-256见 [native-evidence.json](native-evidence.json)；完整JAR、class及javap转储均未入仓库/产物。

|组|26.3实际依据|正式实现|验证与边界|
|---|---|---|---|
|1 原版追踪|ChatScreen、ChatComponent、GuiMessageTag、EditBox、CreativeModeInventoryScreen、RecipeBookComponent、RecipeButton/TabButton、RecipeToast/ToastManager/ToastInstance、PauseScreen、OptionsScreen/SubScreen、LanguageSelectScreen、SoundOptionsScreen、HeaderAndFooterLayout、OptionsList、Hud、RenderPipelines、BlendFunction|上述资源及参数对应下列七组，不以网上其他版本教程替代|只读方法/资源证据已核实；完整动态客户端逐帧/听觉对照仍待用户|
|2 聊天|ChatScreen：输入(4,H−12,W−4,12)、无边框、max256；背景(2,H−14,W−2,H−2)、默认黑50%；ChatComponent：x4、基准H−40、行高9、宽320、聚焦180/非聚焦90、200tick平方淡出、100条/100折行；GuiMessageTag的单人系统条色0xD0D0D0、x−4..−2|`ui/chat.ts`；原版字体、阴影；系统/玩家/作者显式类型；发送时冻结用户名；历史滚动保留锚点；标签/提示；独立聊天输入画布，无PixelUI.field白框|真实T/Enter/Esc、长消息、历史Up、反向选区、清晰世界画面及DOM状态；IME系统候选/实体剪贴板仍待用户|
|3 消息迁入|本项目真实事务事件及状态变化，不伪造客户端/服务器签名或作者发言|`app.ts feedback()`＋原取得事件链；详见[消息去向表](message-routing.md)|首次教学、取得/余量、场景和保存状态按事件/状态转换发送；非每tick发送；聊天前错误保留可见兜底和Retry；重置可重新教学|
|4 菜单/设置|PauseScreen：标题y40、原版204×20按钮、4px格边、FrameLayout(.5,.25)；OptionsScreen：61/33头尾、150宽双列/8px间隙、Done200×20；子页33/33，语言36/53、18px列表行；Sound MASTER大选项310宽；AbstractSliderButton的4px端距、width−8分母及键盘步长|`ui/native-screens.ts`复用现有设置控件和事务；语言是真实单项列表及搜索；滑块文字位于原版把手之上、零为OFF、百分比按原版截断；玩家页明确为项目扩展；首页/游戏两入口共享实现|真实双入口、语言/声音/玩家页、30%→0.303311258278146键盘步长、静音、保存/刷新；保留草稿、失败、分层Esc和关台返还|
|5 配方提示|RecipeButton：15tick，s=1+.1sin(remaining/15×π)，中心(8,12)，背景与图标整体缩放；RecipeBookTabButton同式，仅纵向缩放|`ui/native-animation.ts`、`recipe-book.ts`；移除黄色点；known/unseen、启动过的瞬时动画、Toast三者独立；真实展示后book-seen，不因回执消灭动画，不由快照重启|6个原始控件连续帧及分类canvas；独立0/187.5/375/562.5/750ms预期；真实SaveSession seen回执/无关快照/重置回归|
|6 Toast/声音|RecipeToast160×32，标题#500050于(30,7)、说明于(30,18)，小工作站图标.6缩放；同类NO_TOKEN合并，图标按fullyVisibleFor轮换；ToastInstance600ms平方滑入/滑出，完全显示后5000ms；SHOW/HIDE管理器调用ui.toast.in/out，UI音高/音量1，事件样本volume .4；RecipeToast无额外专有声音|`recipe-book.ts`、`native-animation.ts`、`render/world-audio.ts`；限定游戏视口；按实际密度画原图标；合并/更新/退出计时；音频手势激活、音量草稿预览/静音/解码校验、代次/隐藏/导航取消、有限缓存和有界调度记录|21幅实际全页连续截图＋40幅原始控件帧；同时记录ui.toast.in/out成功解码和scheduled的实际sample/gain/pitch/audioTime。**未宣称人工听见**|
|7 编辑控件|RecipeBookComponent：有边框EditBox(25,13,81,14)，max50，白字、GRAY #AAAAAA斜体hint；创造搜索无边框(82,6,80,9)、max50；TextCursorUtils300ms、EditBox focusedTime；末尾/空串下划线，中间或满长度竖线；活动端、滚动及文字后反色再加蓝选区|`native-field.ts`复用HTML的IME/剪贴板/可访问性；分别传入聊天、配方书、图鉴、改名配置；真实输入不显示浏览器光标；保留P5高清图标链|真实反向选区cursor=8,start=8,end=10；50字符scroll=199；聚焦/未聚焦框、灰斜体hint；规则断言覆盖空串、末尾、中间、满长度和焦点相对时间|
|8 条件准星|Hud：15×15 hud/crosshair；原版整数居中；RenderPipelines.CROSSHAIR → BlendFunction.INVERT：RGB ONE_MINUS_DST_COLOR/ONE_MINUS_SRC_COLOR，Alpha ONE/ZERO|`render/native-crosshair.ts`＋SceneView；共用渲染器，不建第二个HUD上下文；仅实际浏览器所有权＋actual＋隐藏模式＋世界可操作＋非pending/paused/lost才画|正/负所有门禁、原版资源、材质混合因子、中心NDC(0,0)、原版像素取整边界、释放测试。IAB无法取得真实锁成功；没有伪造浏览器actual=true截图|

原版聊天标签在这个单机网页中的适配：系统条使用原版single-player系统标签；本地玩家标签明确说明是无服务器签名的本地单人消息；作者类型只接受实际作者消息并固定身份YuanXiQWQ，本轮没有编造作者发言。没有联网、账号、报告或服务器命令能力。

### 背景效果与缩放

- 输入所有权和 `data-effect` 分开：聊天阻断世界输入但effect=none；容器用原版C0101010→D0101010暗化，不模糊世界；菜单使用原版纹理及模糊。
- 菜单不再使用CSS高斯blur近似：`native-menu-blur.ts`移植26.3 `post_effect/blur.json`的三组横/纵共六次box pass及`box_blur.fsh`的半像素/两像素采样、末像素半权和(radius+.5)归一化。默认radius5来自Options常量。Three线性场景先转回原版字节色域，再进入这些pass；两个有界RenderTarget复用，结束恢复target/viewport/scissor/clear。渲染计数累计所有pass。
- 原版16像素菜单纹理按Screen的32逻辑像素重复；列表背景、头尾分隔使用对应原图，不用任意黑色矩形替代。Options网格页没有伪造列表背景。
- 聊天/HUD继承正式容器的DPR对齐GUI倍率。桌面菜单保持原版双列；窄屏不足310逻辑像素时，支持项使用原版200宽控件单列并调整内容位置，保留字号与头尾锚点。**此窄屏适配是依据用户自主执行授权作出的工程决定，不声称Java原生页面也采用同样响应式分支。**

## 实际浏览器证据

使用隔离IAB Chromium标签、项目新端口；未重置用户线上游玩存档。普通`/game/`用于聊天、菜单、搜索、缩放和设置；`/__verify__/native-ui.html`只准备有限原木并观察DOM/canvas，实际填料/领取均由浏览器原生点击进入正式GameInventory/SaveSession路径。它不是无授物的新档全流程，也不进入普通构建。

证据目录：[evidence/](evidence/)。主要原图（`final-*`为最终静态GUI；动画连续帧后仅修订搜索hint颜色、音量文字/控制和菜单缩放，动画/合并/滑动算法未再改动）：

- `final-chat-messages-1280x720.jpg`、`full-chat-1440x900.jpg`：聊天输入/多行/身份与清晰世界。
- `final-menu-1280x720.jpg`、`final-options-1280x720.jpg`、`final-language-1280x720.jpg`、`final-sound-1280x720.jpg`、`final-player-1280x720.jpg`、`final-home-settings-1280x720.jpg`：最终菜单组。
- `final-book-1280x720.jpg`、`full-book-unfocused-1440x900.jpg`、`full-book-focused-1440x900.jpg`、`book-narrow-500x800.jpg`：原版书框和窄屏覆盖，`book-geometry-1440.json`及`narrow-state.json`给真实尺寸/状态。
- `catalogue-backward-1280x720.jpg`、`catalogue-max-1280x720.jpg`及`input-state.json`：实际键盘选区和长度。
- `verified-animation-00..20.jpg`：全页真实连续帧。SHOW实际154/431.2ms，HOLD从682.1ms覆盖至5333.7ms，HIDE5613.4/6038.8ms，最后隐藏；不是单幅Toast截图。
- `verified-native-observation.json`：实际时钟、控件矩阵、分类倍率、Toastphase/index、音频记录及环境；`verified-toast-*.png`、`verified-pulse-*.png`和`verified-tab-*.png`是原始画布，无缩放/补画。6个脉冲采样与34个Toast采样组成40幅控件帧。
- `reference-chat.png`、`reference-book.png`在上一级，为用户原始对照图。原图保留；局部裁切索引见`evidence/crops.json`，不重采样。原参考未提供完整GUI倍率/DPR元数据，不宣称全窗口逐像素相等，也不把3×3与2×2条目差当缺陷。

### 调度与失败记录

验证窗口中第二次有效发现的`ui.toast.in`实际scheduled于154728.5ms，`ui.toast.out`于160341.3ms，实际事件样本均来自版本清单；master .2 × 原版事件.4 = gain约.08，pitch1；source实际解码时长约1.546/1.555秒。进出一次，不由每帧或book-seen重复触发。前一独立样本也完整记录于同一音频历史，不能把它算成第二个重复触发。

初次后台观测只有SHOW/HOLD、未取得有效退出帧；`native-animation-observation.json`和`animation-00.jpg`保留该不足，不用于完整动画通过。复测用连续真实截图驱动采样，获得SHOW/HOLD/HIDE及最终隐藏。退出边界另设有界定时核对，避免RAF被节流时漏调管理器的HIDE声音；隐藏/重置取消，不返回补播旧声音。

视口覆盖最初作用于另一个标签，所得图片实际1280×720，已统一标记`invalid-viewport-attempt-*`，**不算1440/窄屏通过**。后来在实际受控标签测得1440×900与500×800；普通视口截图曾只返回1331×900，原图以`partial-width-*`保留，不能算1440完整截图。最终使用受支持的fullPage截图取得`full-*1440x900.jpg`，逐一核对JPEG确为1440×900；窄屏图确为500×800，DOM尺寸另存。`image-index.json`记录实际图像尺寸。

## 回归、产物和发布

- 本地检查摘要及原始输出摘要/哈希见[local-checks.json](local-checks.json)。
- 416项正式测试：保留原389项，新增26项原版UI/渲染/音频检查及1项真实SaveSession脉冲生命周期检查。原领取24、炉队列、设置21、配方书生命周期、采集容量及生日闭环断言仍在。
- 原有SceneView碎片RAF测试夹具补足真实renderer.info.reset端口；未删除原有释放/RAF断言。配方书计时夹具覆盖旧退出/清理回调不能终结新Toast，再验证当前清理回调有效。
- P4仍113物品、112可达配方、2042分类；P2关键48项；类型检查、root/Pages构建、两路径HTTP与逐资源字节审计。
- 新增`interface-manifest.json`，含7个原版菜单分隔/列表及HUD资源；所有9份profile共675个正式资源文件（含清单）。版本、依赖和哈希检查保留；提取复现为`python app/tools/interface-assets.py --client <26.3-client.jar>`，普通运行/构建无需JAR。
- 发布目录依然仅`app/dist-pages`，不包含AGENTS/docs/原始JAR/class/javap/验证页/观测器/授物夹具/临时目录。审核脚本增加本轮夹具标识拒绝项。锁文件、main自动Pages工作流、最小权限和P9换行修复保留。
- 独立干净副本与最终提交上的CI/部署、线上build分别核验，最终结果及SHA见交付回复；不以本地编译替代线上验收，不改仓库权限或发布目标。

## 剩余体验验收与风险

工程参数/事务回归通过不等于全部最终体验通过。只保留以下真实外部缺口：

1. 用户桌面浏览器实际Pointer Lock成功、相对移动及原版反色准星在明暗背景的观感；IAB拒绝锁定，不能伪造成功画面。
2. 实体右/中键拖动、OS失焦/后台/最小化、跨屏真实DPR与原生IME候选/系统剪贴板；已有可用原生键盘/中键点击与规则测试不替代这些项目。
3. 人工试听和Java26.3动态并排：这里只声明样本解码/节点调度及实际参数，未宣称听觉等价；原版公式的确定性证据不等于完整GPU/字体栅格逐像素相等。
4. 其他引擎、低端/目标设备性能。104.2ms及旧545.6ms峰值的原因仍未确定，本次没有把它们写成已修复，也没有删掉任何既定模型/烟花/物流来造性能通过。

最小操作清单见[P9人工验收](../manual-checklist.md)及本报告上述边界。最终候选可以交独立审查；不宣布全部用户体验最终验收通过，不自动增加功能。


## 后续用户纠正：普通操作不刷聊天（2026-10-23）

用户指出逐次添加物品通知及方块挖掉通知多余。当前覆盖消息迁入表的普通成功分支：`items-acquired`继续保留数量事务收据，但普通入包不生成聊天；容量余量仍准确提示。设备挖除不发送成功文字，破坏粒子和声音保留。首次永久解锁与必要失败反馈不变。

新增两项正式回归：首次/重复取得的数量收据不产生逐次入包消息；正式WorldUse耗时挖掘接真实SaveSession后，设备删除及有限回收成功，保留破坏效果/声音，无拆除成功聊天，失败仍有反馈。采集容量测试继续核对实际入包/余量/并发/失败，不再要求多余的`+数量`文字。正式测试总数418；原416项保留。
