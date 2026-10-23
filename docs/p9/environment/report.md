# 圆角面板、Java26.3天空与天气

## 范围与依据

本项落实用户连续提出的面板圆角、五秒滞留、原版天空天气和主动浏览器定位要求；不更改有限背包、配方/炉料消耗、采集、生命周期、聊天七类和生日闭环。

- 面板倒梯形的宽边贴顶，SVG alpha路径包含四角圆弧，小边独立圆角；不占整行页头，不遮掉世界区域。原版四按钮白字居中。
- 初次展示5秒；悬停保持，离开重新计5秒；边的pointerenter展开。键盘操作可展开，focus-visible时不在焦点下收起。离页释放监听与计时器。
- 原版依据是已核实client.jar（SHA1 `e877b6a07acd633fb3bb475002175cec036e7b87`）只读javap及原始JSON/PNG，不启动客户端。类/着色器哈希及参数见[native-evidence.json](native-evidence.json)。
- [environment-manifest.json](../../../resources/minecraft/26.3/environment-manifest.json)新增16个原始文件、27,942字节；全部依赖进入普通Git/build，仍逐文件SHA256校验，不要求外部缓存。

## 原版实现与工程映射

1. `domain/environment.ts`还原ServerLevel独立雨/雷倒计时：无雨/无雷间隔均12000–180000 tick；雨持续12000–24000、雷持续3600–15600；inclusive UniformInt，0计数下一tick选时长，标志翻转与0.01浮点渐变分别处理。Java48位随机流持久保存；初始种子60426及dayTicks=1000是自主工程参数，不伪称用户指定或Minecraft固定世界种子。
2. 复用共享20TPS活动时钟：GUI/设置、其他场景继续；后台/离线/仅主页不推进；多标签仍单执行者。环境推进是现有锁内事务的一部分，非渲染帧产出。重置清环境进度，保留最新设置/用户名；正常环境tick不使确认失效。
3. 原始day/moon JSON驱动24000/192000 tick轨道、cubic-bezier、重复tick角度跨界、天空/云/天光颜色与八相月图。太阳/星体的Y=-90°、天体高度100、太阳/月亮半径30/20，星点seed10842及1500次采样（780个有效）均从26.3读取。天空是原版几何/渐变而非伪造cubemap。
4. 云采用原PNG的alpha>=10占用、12×4×12格、原版面方向亮度、0.03/tick移动和3.96偏移。原版默认128chunk云距/2048线性alpha，天空使用默认12chunk/192的雾距上限。一个完整纹理周期后台Worker编译，3×3实例平铺只改风位移；当前固定低眼位仅绘制可见底面/侧面，未开放高于192.33云层的飞行。无重复动画环或每格WebGL上下文。
5. 原版rain/snow PNG、fancy半径10、坐标种子、速度/Gaussian UV和距离alpha用于三维降水；实际作者方块/设备高度图裁切屋顶。雨/雷颜色层按WeatherAttributes次序叠加。天空先绘制、世界随后保留颜色缓冲，使地形、屋顶和设备遮挡天空/降水；菜单仍合成应模糊的世界/HUD，GUI字体不吃世界天光。
6. 天空天光是原版时间线对既有作者材质的显示投影，未扩展成完整体素光传播引擎；矿洞保留既有作者光照。没有新增雷击伤害/火灾、积雪生成、随机世界或移动。雷雨计时/灰度/降水已实现，完整Java雷击实体及其逐chunk判定不在此固定场景实现中。不能据此宣称完整Minecraft天气世界模拟。
7. 现实时间使用浏览器当地06:00→tick0；月相仍是原版8日周期，现实模式按当地日历日映射，非天文学月相。游戏时钟仍保存自身活动进度，切回游戏模式继续该进度。
8. 现实天气以主动定位后取得的Open-Meteo current.weather_code映射晴/雨/雪/雷雨；原版降水/强度缓动继续使用。不是把API概率替代默认原版随机概率。位置只在本页内存，降至0.01°后查询，15分钟可见页刷新；新页面仍需主动点击，不自动获取位置。失败/拒绝回退游戏天气，重置/取消/离页使迟到定位和HTTP回执失效。

官方外部接口依据：[Open-Meteo Forecast API](https://open-meteo.com/en/docs)、[条款与署名](https://open-meteo.com/en/terms)。设置中明确显示近似坐标的目的地和署名；用户不选择现实天气时不请求此API。真实用户定位授权未由代理代点。

## 存档及测试入口

内容版本p9-environment-1无损迁移p8-experience-2等旧档，环境version1和settings.sky具有严格字段/数值校验，不保存坐标。嵌套sky-settings按字段锁内合并，避免两个标签分别选择时间和天气时丢更新。设置仍使用既有草稿/票据隔离。

- `npm run check --prefix app`
- `npm test --prefix app`：459/459（新增18项；保留原441项）。覆盖独立Java随机参考、时间线端点、真实SaveSession迁移/失败/重置/双会话、定位被动构造/拒绝/取消、面板每次离开计时、云alpha/几何、屋顶降水和几何复用。
- `npm run dev --prefix app`：普通/game/默认原版天空；Esc→Options→Weather Settings。浏览器用户自行点击现实天气/定位按钮才调用原生权限。
- `npm run dev:verify --prefix app -- --port 4262`，`/__verify__/environment.html`仅验证模式：TEST时间/天气按钮只改变显示样本，不修改进度或授物；TEST look toward sky只改变夹具相机。普通运行/构建没有这些按钮。样本不得当作等待随机天气自然出现或普通玩家流程的证明。

## 验证记录

当前源码的实际浏览器：隔离IAB Chromium、WebGL2。普通开发源4260、普通生产构建4264、Pages子路径4265均从正常资源路径加载，`cloudReady=true`，无浏览器错误。没有修改用户正在玩的来源或存档。

- [正式构建默认天空与圆角面板](evidence/built-rounded-panel-1280.jpg)：真实1280×720，新来源新档，无授物/控制台改时间。上宽下窄、宽边贴顶，世界延伸其后。
- [面板小边](evidence/panel-edge-1280.jpg)、[再次展开](evidence/panel-rounded-expanded-1280.jpg)与[操作状态](panel-browser.json)。原生坐标指针到达并点击小边，移至快捷栏离开，重新收起；合成pointerenter/leave的精确4999/5000ms边界另由生产控制器测试。当前工具无单独hover调用，不将点击到达证据写成纯hover独立测试。
- 实际发现并修正动画首帧的命中空隙：视觉背景/按钮移动，导航命中区域保持固定到达位置。边隐藏后不会在面板下移过程中把点击漏给世界。原先触发过一次PointerLock失败；修正后相同序列没有新增失败/世界操作。保留真实浏览器限制，不声称PointerLock授权成功。
- [正午](evidence/noon-1280.jpg)、[太阳](evidence/sun-1280.jpg)、[月出](evidence/moonrise-1280.jpg)、[夜空](evidence/night-sky-1280.jpg)、[晨光](evidence/dawn-1280.jpg)、[雷雨](evidence/thunder-1280.jpg)、[雪](evidence/snow-1280.jpg)、[雨+GUI](evidence/rain-gui-1280.jpg)：来自标识TEST的隔离显示夹具，几何/纹理/天气代码为生产类，不代表随机等待自然出现、客户端逐帧对照或普通玩家流程。
- [普通设置](evidence/weather-settings-1280.jpg)：原生Esc→Options→Weather Settings，点击Time切到Local clock，收到Setting saved；刷新后同入口仍为Local clock，Weather保持Random。随后恢复Game。未点击/批准真实定位，未采集用户坐标。
- [CSS1440×900最终设置](evidence/weather-css1440x900-final.jpg)、[CSS390×844最终设置](evidence/weather-css390x844-final.jpg)。实际栅格分别1331×900、390×843，见[尺寸表](image-dimensions.json)，不冒充精确尺寸完整截图。窄屏真实点击Weather成功，控件x16..376；说明y218..314、署名322..370、状态378..426互不重叠。
- 实际修正窄屏新增第4个选项与重置说明重叠、固定200逻辑宽越界、天气说明的换行高度未预留问题。按实际bitmap画布高度连续排布，按钮限制于逻辑宽度；不重做设置草稿/事务。`weather-css390x844-raster390x843.jpg`为修正前说明相互覆盖的失败证据，不计通过。两张`invalid-resize-other-tab-*`是尺寸覆盖作用于另一标签而错误取得1280×720的帧，保留为无效记录。
- 原版依赖提取可重现：`python app/tools/environment-assets.py <已取得的26.3 client.jar>`先核对客户端SHA1和清单哈希，再提取16项；普通开发/克隆不需要运行该工具。
- Open-Meteo真实HTTP公开坐标0,0探针返回200/code51；带Origin=https://yuanxiqwq.github.io返回Access-Control-Allow-Origin:*、JSON。该探针不是用户地点，也不是浏览器真实定位成功的证据。

### 有界性能

两组均1280×720、DPR1.25、可见页；单独连续60秒，无并行构建/测试/HMR或截图。稳定云完整几何34865 quad、9实例、原版128chunk云距。正午在加载约50秒后开始，雨+GUI在已加载天空和切换降水后开始，未单独测冷启动/首次几何解码。仅本机高性能环境，不是目标低端设备或全项目性能验收。当前测量使用既有CPU/GPU计时器，RAF是浏览器约240Hz节拍，**不是游戏渲染帧率**；场景仍按既有请求合并（正午1440次提交/60秒），没有为测量新增强制渲染循环。

| 60秒负载 | RAF间隔p95 / max | >16.7 / >33.3 / >50ms | CPU提交p95 / max | GPU p95 / max | draw calls / triangles | GPU计数 |
|---|---|---|---|---|---|---|
| 正午云 | 4.3 / 8.4ms | 0 / 0 / 0 | 0.7 / 1.1ms | 1.081 / 2.593ms | 53 / 660098 | geometry40 / texture8 |
| 雨+物品GUI | 4.3 / 29.2ms | 2 / 0 / 0 | 0.5 / 1.3ms | 1.518 / 3.360ms | 21 / 660738 | geometry41 / texture10 |

原始样本：[正午](performance-noon.json)、[雨+GUI](performance-rain-gui.json)。两组视角/GUI不同，不作为同条件优化前后对照；draw calls差异不是删减原版云。正午异步锁等待max76.4ms不计为CPU阻塞，实际tick max0.5ms、UI投影max1.4ms。原104.2/545.6ms未确定峰值结论不变，不据这两段宣布根因解决。CPU/GPU阶段单独记录；没有获取具体GPU型号及其他引擎/低端设备数据。

### 回归及产物

- 类型检查、正式459/459、P2关键48/48，P4 113物品/112可达配方/18步蛋糕链及导出哈希通过。
- 根路径和Pages构建审计通过；真实HTTP两条路径校验754项运行文件、原始字节与MIME，通过2/2；云Worker脚本随Vite构建、子路径实际浏览器ready。测试页/授物入口/docs/原始jar不进入产物。新增环境JSON受既有`resources/** -text`约束，不因平台换行改变哈希。
- 未删除/弱化领取、返还、炉、采集、设置、重置、配方生命周期断言；旧版本输出断言仅更新当前内容版本、资源数增加17（16文件+manifest）。生产管线不依赖本机缓存。
- 天空/降水资源释放：生产NativeSky在dispose终止worker、拒绝迟到geometry安装，释放InstancedMesh实例缓冲、几何/材质/纹理；降水变化复用未变布局，销毁释放各自GPU资源；对应单元回归通过。
- 最终普通新提交后复查其BUILD_ID的双路径构建/HTTP，并分别核实远端main、CI、部署和线上标识，结果在交付回复记录（避免文档自身提交SHA循环）。

### 最小剩余人工清单

1. 设置中主动切Local weather或点击Use browser location：由浏览器决定是否弹出原生权限；拒绝时保持游戏天气，允许时查看同步状态及真实雨/雪/晴。失败记录浏览器、错误状态和网络请求状态，不提供精确坐标。
2. 实体鼠标只悬停小边、离开、反复进入：面板不在悬停时收起，每次离开5秒收起，圆角和页面贴顶自然；键盘Tab也可展开。
3. 与Java26.3客户端动态对照天空颜色、星点/日月朝向、云边缘、雨雪运动；记录时刻、天气、GUI缩放和差异。当前只读代码/原始资源依据及浏览器实渲染不等于逐像素完全一致。
4. 真实OS最小化/恢复、跨屏DPR和其他引擎/目标设备性能，以及既有人工试听/实体输入继续按原清单，不在此冒充通过。

