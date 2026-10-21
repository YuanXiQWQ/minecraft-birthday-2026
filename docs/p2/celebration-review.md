# P2 第四轮：原版烟花、粒子和声音技术验证

日期：2026-10-20（America/Vancouver）。基于已审查的第三轮 `9e831fc51f9ca1c538f824a0963c009797dc06e0`。本次只交付 `experiments/scene3d/` 中可运行的庆典技术切片，等待审查。**不声明完整 P2、原版逐帧观感或人工试听通过，不进入 P3–P9。** 没有安装依赖、启动 Java 客户端、部署或推送。相机、第一人称/居中/无准星、自由鼠标和 B 不变；开发按钮不授予进度、不写蛋糕状态，正式结局仍只能由在家中桌上放蛋糕触发。

## 1. 代码和原版证据

| 模块 | 职责与边界 |
| --- | --- |
| `tools/extract-celebration-samples.ps1` | 校验既有 client.jar、资产索引和 sounds.json；复用 GUI/模型提取，扩展仓库外白名单；按官方对象 SHA-1 下载 12 个 Ogg，并记录 SHA-256 |
| `celebration-pack.ts` | 逐文件哈希核验、原版粒子帧列表、PNG 与声音定义加载；缺资源直接 BLOCKED |
| `firework-simulation.ts` | 五种三维速度分布、固定 20Hz、固定种子、颜色/淡出/寿命/Trail/Twinkle；自由空气夹具，不含世界碰撞/火箭实体 |
| `firework-batch.ts` | 原版精灵运行时 atlas、相机朝向四边形、真实世界坐标、深度测试、从远到近排序；每次播放一个有限批次 |
| `celebration-audio.ts` | 实际 Ogg 解码、用户激活、声音定义/变体、空间衰减、音高/音量、暂停/取消/节点释放、解码失败探针 |
| `celebration-controller.ts` / `celebration-labels.ts` | 收起的开发工具、单形状/组合/远声/单事件触发、共同时间线和 DOM 证据；不添加 RAF、不改变正式触发条件 |
| `celebration-checks.ts` | 实际 WebGL readPixels 遮挡比较，临时测试平面在 finally 中释放，相机不变 |
| `scene-adapter.ts` / `main.ts` | 已有唯一动画循环调用 effect；适配器重建/退出时释放 effect；领域状态、GUI 门禁和存档保持分离 |

版本唯一为 Java 26.3：client SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`；资产索引 34 SHA-1 `0c8f43b28f837869c1e54a6aeb22c396a1548946`；sounds.json SHA-1 `7975165ad4a3c0cb3c05078b914eac0f2c3b5f5f`。原始构件沿用 P1 已下载文件，没有重新安装或运行客户端。路径、逐资源哈希、静态检查文件哈希和截图索引见 [资源替换索引](resource-replacement-index.md) 及 [机器清单](evidence/celebration-round4/resource-index.json)。

只读依据为同一已校验 JAR 的 `javap -p -c -constants` 输出：

- `net.minecraft.client.particle.FireworkParticles$Starter`：createBall/createShape/createBurst/createParticle、五种类型分支、颜色、声音与 Starter 时间。
- 同包 `FireworkParticles$SparkParticle`、`FireworkParticles$OverlayParticle`、`SimpleAnimatedParticle`、`Particle`、`SingleQuadParticle`、`ParticleResources$MutableSpriteSet`：粒子尺寸、寿命、动力学、闪烁、子粒子、帧和 Flash。
- `net.minecraft.world.entity.projectile.FireworkRocketEntity`、`net.minecraft.client.multiplayer.ClientLevel`、`net.minecraft.client.sounds.SoundEngine`、`net.minecraft.client.resources.sounds.SimpleSoundInstance`、`com.mojang.blaze3d.audio.Channel`：声音调用、距离延迟、音量/音高夹取和 OpenAL 线性衰减。
- `net.minecraft.client.gui.components.toasts.AdvancementToast`、`ToastManager`、`Toast$Visibility`、`net.minecraft.client.multiplayer.ClientPacketListener`、`net.minecraft.world.entity.player.Player`：Toast、经验与升级声音。ExperienceOrb 的静态检查也保留，但拾取音证据落在客户端事件处理，不能仅凭实体类推断。

静态检查全文只在外部缓存；清单记录成功产生且非空的文件，不把失败的类查询计为证据。其他机器可使用已有兼容 JDK 对上述同版原名重复 javap；本轮不要求安装新工具。

## 2. 核实的粒子规则和实现差异

以下是**同版本字节码/资源证据**，不是对运行中的 Java 客户端观感测量：

| 形状 | 原版采样 | 无 Trail 的初始火花数（另有 1 个 Flash） | 本机浏览器 |
| --- | --- | ---: | --- |
| Small Ball | n=2 空心壳采样，速度参数 .25；三轴差分均匀扰动及 Gaussian 归一化扰动 | 98 | 独立运行结束；独立原版精灵截图 |
| Large Ball | n=4 同类壳采样，速度参数 .5 | 386 | 同上 |
| Star | 原版 6 点半路径、每段四次插值、正负镜像、三个旋转平面；角度间距 π×.34 | 121 | 同上 |
| Creeper | 原版 12 点半路径、同类插值镜像、三个窄角平面；间距 π×.034 | 265 | 同上，独立重跑确认为 265 |
| Burst | 70 次速度采样：继承火箭速度×.5，水平 Gaussian×.15 加共同偏移，垂直 U×.5 | 70 | 同上 |

不是形状图片或五个通用放射效果。Star/Creeper 的原版数值路径在纯算法模块中显式列出；所有火花都拥有三维位置和速度。

- 火花寿命 `48 + nextInt(12)` 刻；半尺寸约 .075–.15。每刻先扣除 .004 垂直速度，再移动，随后速度乘 .91。超过半寿命后 alpha 按原公式衰减，RGB 每刻向所选淡出色靠近 20%。选色从原版式 RGB 数组选择；演示中的颜色、位置和并发是工程夹具参数，不是原版默认色表。
- Trail 在前半寿命按 `(age+lifetime)%2==0` 生成静止子粒子；子粒子从自身半寿命开始，继承当前颜色和 Twinkle，不递归 Trail。静态代码中父类与 Spark 的 fade 字段各自独立，当前检查路径未设置 Spark 私有 fade 字段；因此子粒子不盲目复制父类 fade。该细节仍需 Java 实机视觉复核。
- Twinkle 的绘制门禁：前 1/3 寿命一直可见，此后按 `floor((age+lifetime)/3)%2==0` 闪烁，隐藏时仍继续模拟。
- `firework.json` 的 8 帧顺序是 **spark_7→spark_0**，不是按文件名升序；每张 8×8。帧选择 `floor(age×7/lifetime)`。Flash 使用原版 32×32 精灵、寿命 4 刻，半尺寸 `7.1×sin((age+partial−1)×π/4)`，alpha `.6−(age+partial−1)×.125`。
- Starter 的基础 lifetime 为 `N×2−1`，任意 Twinkle 再加 15。后增计数超过 lifetime 时播放闪烁声：单爆炸从 life0 开始，闪烁声在 **第16刻**，不是第15刻；测试 F08 防止少算基础 lifetime。

**工程适配**：xorshift/Marsaglia 固定种子，分布按证据实现，但不保证同一 Java RNG 种子的逐粒子序列；JS number 与 Java float 不逐位相等。模拟只从共享 AudioContext 时间推进到目标 20Hz 刻，30/60/144Hz 的同种子最终状态一致。正常 Alpha 混合、sRGB/nearest atlas、depthTest=true/depthWrite=false、相机深度排序、全亮风格不受场景灯光影响；并未复现 Java 完整粒子着色器、雾、AO 或碰撞弹跳。

演示每个独立火箭在第24刻爆炸，五形状组合间隔10刻；这些是作者测试编排，**不是原版火箭飞行时间或同一 Starter 多爆炸间隔**。原版同一 Starter 的多爆炸间隔2刻及 N≥3 选择大型爆炸声已核对，但本轮演示使用五个独立单爆炸，不宣称完整火箭实体/多爆炸组件已实现。

## 3. 原版声音与共同时间线

同版本 sounds.json 中下面每个事件在本次样本中都只有一个具体 Ogg；没有擅自补充变体。取样支持原定义权重，完整选择结果和官方对象哈希在清单中。

| 事件 ID（完整前缀） | 样本 | 原版调用/参数 |
| --- | --- | --- |
| `entity.firework_rocket.launch` | fireworks/launch1 | 发射起始，AMBIENT，原始音量3，音高1 |
| `entity.firework_rocket.blast` / `.blast_far` | fireworks/blast1 / blast_far1 | 普通爆炸，AMBIENT，原始音量20，音高 .95+U×.1 |
| `entity.firework_rocket.large_blast` / `.large_blast_far` | fireworks/largeblast1 / largeblast_far1 | Large Ball，或一个 Starter 至少3个爆炸；其他参数同上 |
| `entity.firework_rocket.twinkle` / `.twinkle_far` | fireworks/twinkle1 / twinkle_far1 | Starter 结束且含 Twinkle，原始音量20，音高 .9+U×.15 |
| `ui.toast.in` / `ui.toast.out` | ui/toast/in / out | Toast SHOW/HIDE，经 UI 音效路径，定义样本音量 .4、调用音高1 |
| `ui.toast.challenge_complete` | ui/toast/challenge_complete | AdvancementToast 的 CHALLENGE 类型；非所有 advancement 都播放；定义样本音量 .6 |
| `entity.experience_orb.pickup` | random/orb | 客户端拾取事件，PLAYERS，音量 .1，音高 `(U−U)×.35+.9` |
| `entity.player.levelup` | random/levelup | 原版每5级及100刻冷却条件；音量 `min(level/30,1)×.75`，音高1 |

爆炸/闪烁声音在距离**达到16格**时选 far；启用距离延迟且距离**大于10格**时，延迟为 `floor(distance/40×20)/20` 秒。不是随意采用 340m/s。远处 Large Ball 夹具实际选中 `large_blast_far` / `twinkle_far`，延迟 .8s，见 `far-large_ball.json`。近处演示也可能有 .3s 延迟，这是原版规则而非失同步。

WebAudio 保留原始音量用于衰减半径 `16×max(rawVolume,1)`，播放增益夹到0–1，音高夹到 .5–2；UI 声音不定位，空间声音用 equalpower/linear Panner，监听器跟随已有摄像机。主音量 .2 是实验默认值，不声称等于 Java 用户音量设置。单事件按钮只试听该样本；经验/Toast 不会创建正式成就或经验业务。

每次导出含：固定种子/计划、目标 simulation tick、绝对 audio `when`、距离延迟、实际 source schedule/lateMs、ended、首次观察到该刻粒子的音频时间、逐帧计数。音频精确调度与主线程观察粒子的延迟分列，保留原始长帧。实际播放/取消不是只创建节点：12 Ogg 已解码、调用 source.start、取得主增益后的非零波形；但 **硬件输出、主观响度和人工听觉同步仍 UNVERIFIED**。

## 4. 真实浏览器和自动化结果

环境：Windows10/Chrome155 内置浏览器、WebGL2/ANGLE/D3D11、RTX3080Ti Laptop、20逻辑线程。第一人称 eye=[.5,1.62,6.5]、FOV70。证据在 [celebration-round4](evidence/celebration-round4/)，不覆盖此前轮次文件。

| 检查 | 实际结果与证据 |
| --- | --- |
| 编译/纯测试 | `npm run check`通过；含本机资源 **46/46**；无配置 **43通过、3明确BLOCKED跳过、0失败**；见 tests-with/without-samples.txt |
| 五形状＋效果 | 各形状独立真实运行，结束时粒子0/声音0/批次释放；浏览器内20种 Trail/Twinkle 组合有限结束；固定种子/刷新率/动力学/帧规则/近远音/F08单元通过 |
| 真正 GPU 深度 | 原版 spark_7 的后方像素哈希等于遮挡基线，前方不等，depth.passed=true；透明背景未形成方形色块；Three 透明排序仍不等于 Java 着色器观感验收 |
| GUI联合输入 | 真实3D炉体打开原版屏幕GUI；点击、左拖、滚轮、数字键期间 actions/pointerEvents/worldWheels 不变，Esc关闭后恢复；见1440-joint-gui.json |
| 首次音频激活 | 上下文初始 suspended/userActive=false；明确用户触发后 running，12样本均取得非零信号；不创建无手势声音 |
| 自动播放拒绝 | 沙箱 iframe、autoplay 'none'、无手势的真实探针：policyAllowed=false/state=suspended；探针仅用静音 buffer，不用替代音冒充原版。不是所有浏览器默认策略的结论 |
| 静音/音量 | mute=true 或 volume=0 时实测 peak=0；volume=.05、解除静音时 peak>0；计划仍可取消，见mute-volume.json |
| 解码失败 | 对4字节损坏数据调用真实 decodeAudioData，EncodingError 被捕获；已解码原版仍可用，无占位声音回退 |
| 暂停/恢复 | 手动 suspend 后模拟时间保持不变，resume 后同一时钟继续；取消立即 sources/chains/particles=0、批次平衡 |
| 后台与恢复 | **未验证通过**：实际尝试打开另一内置标签页，但没有 visibilitychange；background-attempt.json 如实记录空数组。实现会在真实隐藏时暂停，恢复需明确按钮；仍需正常桌面浏览器手动切到其他页/最小化再核对 |
| 重复/重建 | 三次真实播放后取消，另一次活动播放中重建：旧 controller disposed、sources/chains=0、batch平衡、atlas disposed；工作站存档实例相同；仅一个组合触发器/原有一个循环；见repeat-cancel-rebuild.json |
| 既有检查 | B01–B17 **17/17**、V01–V11 **11/11**、GUI foundation **12/12**，0失败；见final-browser-regression.json；原生右拖/跨浏览器等第三轮缺口未由此次结果消除 |
| 普通构建 | 根/仓库子路径构建、2个真实HTTP测试通过；新增粒子/Ogg/sounds.json路径404；真实构建页面加载/触发后BLOCKED、0解码/0粒子。JS约628KB，>500KB提示保留 |

### 性能样本

均为真实浏览器 RAF 间隔而非 GPU 执行时间。原版模型26状态资源已加载、夹具7实例、原版GUI打开、实际五形状和声音播放；GUI图标有独立离屏渲染器，表内calls来自主场景renderer，不冒充全部上下文总GPU调用。

| 原始文件 | CSS / backing | 时长 / 帧数 | 峰值粒子 / 主场景calls | p50 / p95 / max（ms） |
| --- | --- | --- | --- | --- |
| 1440-joint-final.json | 1440×900 / 1440×900 | 6.201s / 1382 | 8649 / 178 | 4.2 / 8.3 / 91.8 |
| 1280-joint-final.json | 1280×720 / 1280×720 | 6.201s / 1442 | 8649 / 178 | 4.2 / 4.4 / 20.9 |

每次组合共生成12912火花（含11972 Trail子粒子，另有5个Flash）。非活动原版夹具约177calls，效果增加1个透明批次，不为每颗火花建Mesh。每次结束释放几何/材质，原版atlas作为有界缓存保留至controller销毁。没有重复RAF。

两份最终样本可见四边形峰值均为4549，主场景峰值9678三角形；8649是包括Twinkle暂时隐藏者的存活数，不能当成每帧都提交8649个四边形。预排声音的lateMs最大0，表示提前排入音频时间线，**不是硬件输出延迟0**。五次爆炸在主线程被观察到的时间相对目标分别约0.249–11.270ms（1440）及0.249–10.499ms（1280），另有原版距离传播延迟；原始timeline保留每次值。

逐帧数组按每帧一行存储，11份运行保留11959帧，没有筛选、舍入、降采样或删字段；格式化前后JSON值一致性与canonical SHA-256见[frame-format-audit.json](evidence/celebration-round4/frame-format-audit.json)。

此前独立 Creeper 短测 max370.8ms，GUI操作短测 max258.4ms，1280截图短测 max179.2ms，均保留原始记录。部分早期文件实际是1440×1502，文件名已明确标注尺寸；不能纳入1440×900性能表。早期1440个别运行 backing 为1800×1125，不能与最终1×像素密度混算。截图和开发工具操作、DOM证据更新有主线程开销；**短时高端GPU/单浏览器不是正式性能验收**。低端GPU、长时并发、温控、Firefox/WebKit、音频输出延迟仍未测。

粒子资源加载24请求约34.4ms（本机缓存、非冷网指标），包含full sounds.json约636KB；12解码样本约.74–6.79秒。完整请求字节/哈希与帧级计数都保留，不把资源包体当渲染负载。正式部署前可单独整理最小声音定义，但本轮未生成正式资产包。

截图：`1440-combined-paused.jpg`、`1440-joint-live-final.jpg`、`1280-joint-live.jpg`，五形状独立 `shape-*.jpg`。暂停截图不是实时性能证据。初次 Creeper 截图捕捉到上一 Star 状态，已作废并保留为 attempt 记录；`shape-creeper-confirmed.jpg` / `creeper-confirmed.json` 是独立重跑265颗的有效证据，未将错误截图算作通过。

## 5. 本机复现与人工检查

已有外部样本时，从 `experiments/scene3d/` 运行：

```powershell
$env:MC_LOCAL_SAMPLES='C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p2-fireworks-20261020'
npm run check
npm test
npm run dev -- --port 4178
```

访问 `http://127.0.0.1:4178/game/`。展开 Developer tools，依次 Load local vanilla samples、Load local vanilla GUI、Load local celebration samples。原版资源未加载时明确 BLOCKED。Enable audio 或五形状按钮是用户激活手势。各形状、Trail/Twinkle、Far sound fixture、组合和12事件都可分别触发；Cancel停止所有已排队声音及粒子。Pause/Resume冻结/恢复共同音频时钟。Hold visual snapshot仅供截图，会继续音频，不得用作同步测试。Export last celebration evidence 将完整原始运行写到 `#celebration-record`，`#celebration-evidence` 是精简实时诊断。

另一机器仅使用自己已有的同版构件，仓库外生成缓存（PowerShell7及已有兼容JDK用于静态核对；未授权安装）：

```powershell
./tools/extract-celebration-samples.ps1 -Jar '<已有26.3 client.jar>' -Output '<仓库外新目录>' -AssetIndex '<已核实34.json>' -Sounds '<已核实sounds.json>'
$env:MC_LOCAL_SAMPLES='<同一目录>'
npm run dev -- --port 4178
```

人工待办：连接实际扬声器/耳机逐个听12事件；核对 mute/音量/近远与音高，播放组合观察音画（保留原版传播延迟）；播放中切到普通浏览器其他标签/最小化，确认诊断出现可信 hidden/suspended，返回后明确Resume继续，取消后无尾音；检查真实 Java26.3五形状、Trail淡出/Twinkle节奏及Flash对照。没有这些实测就不能签署听觉/客户端一致性通过。

## 6. 当前门槛与资源决定

用户本轮明确允许原版资源/转换/截图/音频暂时进入Git及普通构建，并确认最终由其手绘替代素材解决发布路径。**这覆盖此前“任何原版截图不得提交”的项目规则，D14不再作为P2发布方案阻断。** 本轮将获准的浏览器截图放入开发证据；资源本体仍沿用既有仓库外本机传输，默认静态产物不主动打包。所有位置/来源/替换职责单列索引，未来加入产物也必须登记，避免漏替换。

尚未通过：真实 Java视听对照、硬件人工试听、真实后台/恢复、跨浏览器音频策略、低端与长时性能、完整Java粒子shader/碰撞。上述缺口不被静态代码证据或截图代替。不含完整烟花火箭实体、成就系统、经验系统、庆典编排、最终祝福、背景音乐、正式GUI/配方或四场景。D04–D07及视线手势仍未定案；下一步执行范围必须由用户另行授权。
