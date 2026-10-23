# 五项界面定向修复

基线8f80bd9d65c1eb7ed20149692c788011223e4e5f。开始时main、origin/main一致，工作区干净。保留聊天七类、固定世界目标指南针、物品搜索自动聚焦、狭小洞道/旧设备兼容及全部数量/存档合同。不扩展功能阶段。

## 完成矩阵与原版依据

只读同一26.3官方构件，未启动Minecraft客户端、未操作实体桌面。方法分支与原类哈希见[five-native-evidence.json](five-native-evidence.json)。完整客户端/class/javap转储没有入Git或构建。

|项|根因与正式修复|针对性验收|
|---|---|---|
|1 菜单合成|Gui先提取HUD再提取Screen；Screen的blurBeforeThisStratum处理此前整个画面。NativeMenuBlur现将真实快捷栏、副手和近期聊天画布按游戏视口坐标合成到编码后的世界目标，再执行原六pass；菜单控件和外部导航不进该目标。原HUD画布保留为源纹理，菜单时显示模糊合成结果，关闭后恢复DOM呈现。|普通页面聊天、容器、暂停、Options截图；菜单中真实快捷栏边框及近期玩家聊天均模糊，按钮/外部导航清晰。2D源重绘按需触发场景刷新，不暂停加工。纹理复用/源移除释放、GPU状态恢复测试通过。|
|2 Toast生命周期|分离ToastInstance动画起点/完全显示起点/当前visibility，与RecipeToast changed标记/lastChanged/图标时钟。按原版顺序计算可见部分、更新内容、切换可见性；转换发in/out，退出更新也发in。取消预测的完整寿命超时清理；RAF由动画身份保护，新代次取消的旧回调不能清掉新动画。|正式类同序列：0首次、600完全进入、5600退出、5900追加，声音in/out/in。真实18秒采样、原始canvas帧、10张真实视口连续截图及原版音频调度，人工试听未宣称通过。|
|3 静默恢复去重|feedbackTransition先记录边界状态，再决定是否发聊天。contextRestored仍静默，但结束前一次故障区间。|完整lost/lost/restored/restored/lost链只发两条红色系统消息。真实WEBGL_lose_context两次丢失、两次恢复，实际挂载app聊天恰有两条红色故障，没有恢复成功通知。|
|4 旧异步失败|WorldUse成功/失败均检查代次、场景、适配器abort/scene释放、SaveSession serial及挂起/销毁。导航失败同样保护。持久层未放宽。|真实SaveSession A排重置、B排刷新、B旧快照提交采集，锁释放后旧失败静默。当前代次非法操作/写入失败仍提示；切场景、销毁、挂起、同代次恢复后旧任务静默。|
|5 分类标签裁切|实际canvas从37×27扩为37×33，内部y+3、元素top−3相消，保持原版y=12垂直缩放中心、位置和35×27命中区域。|普通/选中分类连续35组、70幅原始像素帧；最大约1.099998，111×99物理画布中alpha行5..90，上下均留透明余量，86像素有效高度超过旧81像素容量。正式paint矩阵也断言最大1.1的整幅27高原图位于33高画布内，布局补偿抵消。|

## Toast的原版时钟细节

不是追加时立即重置一个“完整再显示5秒”的期限。add只标记内容改变；RecipeToast.update才记录当时fullyVisibleFor。退出反向使用**线性可见部分**重建animationStartTime，并保留lastChanged。继续SHOW时原版还会在动画窗口内更新becameFullyVisibleAt，图标按fullyVisibleFor而不是“距最后解锁”轮换。

独立字节码分支推导的固定更新序列：5900ms更新前退出可见0.75，切SHOW后start=5750、lastChanged=5300；5950ms下一次SHOW可见约0.111111119，完全显示时钟回到0而lastChanged仍5300。这个原版分支有不连续的可见度变化，没有用sqrt平滑或项目自定倒计时覆盖。完全离场判定是严格超过600ms，正好600ms仍未移除。

进入中、停留中、退出中及真正结束后的新增都分别测试；静音/音量、隐藏/重置/导航取消、旧解码失效仍由原WorldAudio和既有回归保护。

## 复现前后与动态证据

为确认回归确实能抓住基线缺陷，使用Node临时load hook只读git show 8f80bd9的**整个正式模块**，接入相同新测试、真实SaveSession及可控排他锁，没有复制方法到测试中：

- [基线WorldUse](five-evidence/baseline-world-failure.txt)：相同重置/刷新/旧采集序列实际多出game.actionFailed，新实现为空。
- [基线Toast](five-evidence/baseline-toast-failure.txt)：正式notify/paint相同序列只有in0/out5600，新实现还包含in5900。基线执行是刻意失败的反证，不计入通过数。load hook仅在临时目录，没有运行/改写旧Git历史。

真实浏览器为隔离来源127.0.0.1:4252，普通/game/与明确标识__verify__/native-ui.html分开。两页共用这个隔离来源的存档，容器截图可见的取得事实来自已标识夹具，不称为无授物新档主线：

- `chat-open.jpg`、`container-background.jpg`、`menu-background.jpg`、`options-background.jpg`：实际原生T/Enter/Esc/E/按钮操作，1280×720普通页面；聊天effect=none，容器effect=container，菜单effect=menu。容器沿用其透明渐变背景，没有启用菜单模糊。近期玩家消息通过实际聊天输入，不是画入截图。
- `graphics-chain.json`：真实驱动扩展产生的lost/restored/lost/restored事件及挂载app实际消息；不是直接调用onGraphics或合成context事件。
- `toast-reentry.json`：第一段实际墙钟运行，42幅原始Toast画布帧及完整采样；音频实际scheduled约在29527ms(IN)、35110.9ms(OUT)、35404.9ms(IN)、46154.6ms(OUT)，相对音频时间/样本/音量/音高均有原记录。调度成功不等于人工听觉通过。
- `toast-reentry-viewport.json`及`toast-reentry-viewport-00..09.jpg`：另一段同一生产代码的真实视口连续画面，覆盖HIDE与重新SHOW/完全进入，包含CSS位移。每幅记录截图前后状态，不能把异步合成截图硬称为某个精确毫秒帧。截图采样会占用主线程；不是性能测量或逐帧Java并排对照。
- `category-continuous.json`和`category-all/building-00..34.png`：实际正式paint输出，受控触发显示层的原版脉冲，选中/未选中两种；不是仅写scale字段。`category-full-gui.jpg`提供完整界面上下文。无图像补画/后期修边。
- `invalid-late-toast*`为首次视口截图错过退出窗口、只捕到停留的记录，保留且不作为HIDE→SHOW证据。最初被动观测仅挂notify时未取得已hydrate的book，返回BLOCKED，补挂正式render的被动实例观测后才执行上述实验。

复现：npm run dev:verify --prefix app -- --port 4252；普通页面使用游戏操作。隔离验证页先TEST prepare known recipes；真实输入开启/关闭聊天以激活音频，再触发Toast；分类实验先E→箱子页→原版配方书开关。夹具只准备已知配方、触发瞬时提示/显示脉冲及驱动上下文故障，不作为普通新档全流程证据，不进入正式构建。

## 回归与剩余项

类型检查、正式440/440（原428全部保留，新增12项）、P2关键48/48、P4 113物品/112可达配方及全部导出哈希通过。原24项领取、炉队列、关台返还、设置草稿、配方书生命周期、采集容量及迁移测试保留。原Toast到期/回调测试按实际经理更新/RAF失效语义调整，保留旧回调不能影响新代次的安全断言；原菜单GPU状态恢复和目标复用断言仍在。

最终双路径构建、737资源字节/HTTP检查及候选SHA、远端/CI/部署/线上构建ID分别在交付回复核实。浏览器实际合成与调度不等于用户人工试听、实体拖动、真实PointerLock、OS后台或Java动态客户端完全一致；这些既有边界保持，不触碰用户桌面。现有长帧未因本项被写成已解决。
