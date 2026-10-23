# 设置细节、命令历史与天气音乐补充

在03f010a的指令提示及页面背景修正上继续处理用户实际指出的细节；保留全部物品、工作站、庆典与存档事务。03f010a的短居中单按钮画面不再作为当前对齐验收依据。

## 实现与原版依据

- **行对齐**：两列使用共享groupWidth/列宽/间隙；Reset和定位的单按钮横跨整行，与两列左右边缘一致。极窄逻辑宽度用单列。独立页脚Done保持原版HeaderAndFooterLayout布局。
- **语言**：LanguageSelectScreen.setInitialFocus指向search；EditBox.SEARCH_HINT_STYLE是灰色斜体，但仅空值且失焦时画。进入语言页立即聚焦，不依靠额外点击。补原版`options.languageAccuracyWarning`括注`(Language translations may not be 100% accurate)`，#BABABA、居中位于53逻辑像素页脚内；只列实际支持的English，不伪造整套翻译。
- **历史**：GameChat.key生产接线中普通上下箭头浏览已有history并恢复未发草稿；仅显式Tab建立的补全列表拥有候选切换，自动给出的建议不劫持历史。
- **雨雪**：基线SceneView有50ms动画定时器（定时触发20Hz，另外仍有快照/输入触发，不能把它写成严格FPS上限），雨shader又取250ms左右提交一次的整数world.tick（UV约4Hz）。可见游戏页改为单个合并RAF，NativeSky.ticksAt提供同一原版局部tick插值供云/雨雪使用；冻结、后台不插值，不改变保存/加工时间。没有减少雨柱或云几何。WeatherEffectRenderer.createRainColumnInstance的 `(tick&131071 + hash + partial)/-32*(3+nextFloat)` 与纹理重复保留。
- **雨声**：ClientLevel.tickWeatherEffects的21×21默认半径、`.225 * count * rain²`采样、`nextInt(3)<rainSoundTime++`，屋顶above为音量.1/音高.5，露天为.2/1。使用实际高度图与空间Panner，GUI/设置不暂停。雪不播放雨声。
- **雷电**：ServerLevel.tickThunder每活动区块每tick为`nextInt(100000)==0`、需下雨/雷强度达标；天气天空投影半径采用Options同版默认simulationDistance=12，对眼位周围25×25区块分别试验；实际场景内用作者高度图，远处天气投影用地平面高度0。依据用户自主执行授权作出的工程决定：为有限作者世界提供同版默认范围的天气表现，并非真实服务器加载区块或新增地形生成，不引入火/伤害/动物变种。LightningBolt的life2、额外1–3次flash及随机间隔、初始thunder(10000,.8+rand*.2)和impact(2,.5+rand*.2)；LightningBoltRenderer的4层/8段/3分支原版程序几何与颜色，真实深度遮挡，结束释放。天空闪光使用ClientLevel同版.22色彩插值及skyLightFactor1。独立瞬时表现不写档；重置/导航清理，不补放后台事件。
- **音乐**：MusicManager初始100客户端tick延迟；Musics.GAME原版12000–24000 tick曲间间隔，完整music.game的32首/原权重、原音量。只加载选中的一首，经SHA256/字节校验后Blob媒体流进入已有WebAudio上下文，不把32首全部解码。首个真实输入激活；Off/后台/重置/卸载停止并失效化待完成加载，回到可见状态无集中补放。
- **分类音量**：主音量与已实现Music、Weather、Blocks、Friendly Mobs、Players、UI六类。火箭属于NEUTRAL，Toast属于UI；每个实际音源乘主/分类音量，庆典和现有音效一起接入。零显示OFF，移除Sound: ON按钮。未加入唱片、敌对生物、语音等无实际作用控件。声音列表在窄屏可滚动，页脚保留。

同版只读方法与类哈希见[native-evidence.json](native-evidence.json)，没有启动Java客户端。只移植当前静态作者世界所需的表现，不声称有完整原版服务器世界、雷击游戏效果或所有生物群系音乐。

## 资源与存档

`ambience-manifest.json`及`ambience-sounds.json`，来自证据锁官方资产索引34。47个独立OGG、32首game音乐及雨/雷事件共约96.49MB，事件引用、weight/stream/volume完整保留。全部进入Git与普通根/Pages构建，提取器核对官方SHA1、运行与构建核对SHA256，不依赖提取输入目录。无完整客户端或私人路径入构建。

保留内容版本p9-commands-1；设置以可选audioVersion1和六个独立规范化分类值作增量扩展。旧档不改写/不清档，缺省分类为1、原主音量和legacy mute保留。首次分类设置命令在锁内写版本1；未知版本、非有限/越界值拒绝。SettingsEdits按字段隔离草稿，跨标签其他字段不会被旧快照覆盖；D09重置保留最新音频及其他设置。旧代码遇新字段会安全拒绝写入，刷新至新构建继续，不清档。

## 当前测试

新增24项weather-audio-history测试直接调用生产GameChat、NativeSky、NativeWeather、GameMusic、WorldAudio资源选择、SettingsEdits及真实SaveSession；含历史/草稿、行宽、八种事件分类、旧档/并发/重置、47资源哈希、插值/冻结、原版闪电几何、雨声屋顶、每区块概率、闪光声音/清理、100tick延迟、媒体流真实资源校验和迟到加载失效、语言聚焦/失焦绘制。

目前类型检查、正式**562/562**、P2 **48/48**、P4 **113物品/112配方/2042分类/18蛋糕链**通过。根路径和Pages构建/资源审计及两个HTTP检查通过；最终提交和线上核对见末节。

## 浏览器与有界渲染核查

隔离IAB Chromium，1280×720、DPR1.25、原GUI scale3.2；不操作用户桌面。通过普通页面真实`/`输入、上下箭头、设置分类按钮及滑条检查。样本故障/生命周期测试与实际浏览器播放分开。

- 原生Up从未发`/we`回到`/time set noon`，Down恢复`/we`；没有派发合成事件。
- 实际雨声已解码并进入空间播放节点；音乐媒体播放时间实际推进。声音调度/媒体进度不等于人工试听通过。
- 语言聚焦/失焦、原版括注、分类音量/Off/刷新、正常概率雷电及渲染计数的最终证据见下节补充。

本轮只针对明确的20Hz/整数UV离散路径作修正；104.2ms及旧545.6ms峰值根因未确定，不能因平均刷新推进改善就宣称这些峰值已修复。低端、跨引擎、实体/OS后台、人工试听和Java动态并排继续待人工验证。

## 可追溯画面与运行状态

正式Pages子路径构建的追加核对：[默认聚焦空框与括注](evidence/built-language-focused.png)、[失焦Search提示](evidence/built-language-blurred.png)、[分类音量OFF](evidence/built-sound-categories.png)。真实点击Language页面、English行及滑条Home，无直接DOM修改。浏览器观察画面使用03f010a构建标识加工作树候选源码；后续提交只封存同一源码/证据，最终HEAD重新构建与HTTP审计，线上另行核对。

- 最终语言页：[进入即聚焦](evidence/language-focused-framebuffer.png)、[手动失焦后的Search提示](evidence/language-blurred-framebuffer.png)。1280×720、DPR1.25、GUI scale3.2，200×15逻辑输入实际以800×60 framebuffer绘制，避免小画布斜体放大失真。默认为空、自动聚焦、底部括注居中；只移开焦点才显示灰色斜体Search。旧language-focused/blurred与*-final图片保留为过程中原始记录，不作当前清晰度/页脚验收。
- [两列及奇数按钮对齐](evidence/aligned-options.png)，[六分类与主音量](evidence/sound-channels-off.png)，[刷新后的独立Off状态](evidence/sound-categories-after-refresh.png)及[状态](evidence/sound-off-after-refresh.json)。真实点击和Home/End调整；Music OFF刷新保留，Weather可独立OFF，之后已还原Weather为1。无Sound: ON按钮。分类草稿同时驱动普通音源与庆典，正式BirthdayCelebration.sync回归验证其不写入草稿/不被无关快照覆盖。
- [普通页面雷雨记录](evidence/ordinary-thunder-final.json)：通过真实控制台/weather thunder 10d与/tick rate 1000加速随机试验，16次原生随机分支、最近4次雷/impact调度，随后恢复20TPS。加速记录证明接线/分支，不冒充20TPS自然频率实测。早期ordinary-thunder-events.json为仅少量作者区块未遇雷的原始记录，不记作成功。
- [原版闪电几何画面](evidence/fixture-native-lightning.png)来自明确标识的隔离验证入口固定一帧，真实Three几何与树叶深度遮挡、天空闪光；不是普通页面随机雷击的截图，也不修改图片补效果。测试固定帧及按钮未进入正式构建。
- 实际音乐流music/game/shores播放时间63.38秒、gain .08、共享context running，见rain-cadence.json尾部；这是媒体播放与调度证据，人工听感未验。

## 有界刷新对照

原始[rain-cadence.json](evidence/rain-cadence.json)：独立来源、1280×720、DPR1.25、平原、无设备、雨强度1、近中午并停止日时推进，20TPS，完成资源/场景预热后计数；每段无并行构建、测试、HMR，其他对照页关闭。

|来源|时长|实际渲染提交|每秒提交|
|---|---:|---:|---:|
|03f010a构建|107.396秒|2547|23.716|
|连续RAF候选|67.618秒|16210|239.7|

这是IAB下的提交计数，不是显示器FPS、完整帧间隔分布或GPU验收；两个隔离档的天气随机种子/云相位并不完全一致，不夸大为逐像素相同负载。之后仅增加雷投影/时钟重锚/输入字段等修正，雨UV/RAF路径未变，未重跑最终整站性能研究。104.2ms与旧545.6ms峰值及根因未知的结论继续保留。

## 仍需人工核验

人工试听音乐、雨/屋顶雨、雷鸣和各分类听感；Java26.3客户端动态图像/声音逐帧对照、其他引擎/目标设备性能、实体右/中拖、真实OS后台/跨屏DPR仍未验。不操作用户实体桌面、不启动Java客户端，不以WebAudio调度或像素非空代替这些项。
