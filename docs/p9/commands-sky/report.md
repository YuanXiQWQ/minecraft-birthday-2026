# 原版指令、天空运动与菜单交付

## 当前范围和原版依据

基于干净且与origin/main一致的`d4626bc7e00bc8173f574a8a76bf471cb4c50779`继续，保留此前背包、领取票据、返还、设置草稿、聊天七类、连续挖掘和生日闭环。不控制实体桌面、不启动Java客户端。普通新提交及原有main→Pages流程保持。

只读核对官方26.3 client.jar（SHA1 `e877b6a07acd633fb3bb475002175cec036e7b87`），以及已随仓库分发的day/moon时间线。类名和SHA256见[native-evidence.json](native-evidence.json)；不提交完整客户端、反编译输出或本机路径。

| 依据 | 已核实的26.3行为 | 本项目接线 |
|---|---|---|
| TickCommand、TickRateManager、ServerTickRateManager | rate范围1–10000；step仅冻结时执行；sprint有限、结束恢复先前冻结；freeze停止步进和冲刺；步进计数也随冲刺递减 | 单一活动执行者、每笔最多5 tick、任务间让出浏览器；epoch在锁内拒绝旧调度 |
| TimeCommand、ServerClockManager、ClockTimeMarker | set/add有d/s/t单位；add可负并钳到0；marker移到下一次；pause/resume/rate；query time/gametime/时间线及repetition；of指定时钟 | 仅既有主世界clock和day/moon时间线；set/marker清部分tick，float速率累积遵循原版 |
| WeatherCommand、ServerLevel | clear/rain/thunder可选持续时间，默认取对应原版UniformInt；26.3单位缺省为tick；clearWeatherTime独立；停止天气递进不停止强度缓动 | 在原有Java48位流上采样，输入/存档上限支持原版32位时间 |
| GameRuleCommand、GameRules | advance_time/advance_weather为原版布尔规则，可查询；不是旧版doDaylightCycle语法 | 控制天体时钟与天气计数，未扩展其他无关规则 |
| LevelRenderer→CloudRenderer.prepare | gameTime加worldPartialTicks；模textureWidth×400，再乘0.030000001；12格云单元、Z偏移3.960000038 | 继续使用游戏tick，不错误改用dayTicks、系统日期或自定风速 |
| day.json、SkyRenderer | star_angle原版贝塞尔周期轨道，star_brightness与雨雷决定可见度 | 780个原版算法星四边形随轨道旋转，不移动一张星空截图 |
| PauseScreen | 204宽按钮、50顶内距、4行距，FrameLayout中心/四分之一锚点 | 项目支持的3个暂停动作纵排；支持的选项类别也纵排，不增加无功能菜单 |
| CommandSuggestions、原版en_us | 输入期候选/错误、未知指令及上下文；失败红色，命令反馈不是玩家发言 | 原版字体canvas在聊天屏幕绘制候选和错误；Tab/Shift-Tab循环，Enter执行 |

以上为静态一手证据与浏览器实现核对，不能代替Java客户端动态逐帧/听觉对照。

## 实现和边界

- `/`直接预填斜杠并聚焦；T仍打开普通聊天。输入期显示候选或原版红色错误；提交未知命令保留原版文本与`<--[HERE]`上下文。搜索框/GUI焦点不触发世界指令。普通聊天、Tooltip、成就/配方Toast未合并或删除。
- `domain/console.ts`同一注册树负责解析、补全与原版参数校验。支持tick query/rate/freeze/unfreeze/step/step stop/sprint/sprint stop；weather clear/rain/thunder；time set/add/pause/resume/rate/query及of overworld；两个gamerule的查询/布尔设置。不是完整Minecraft服务器命令执行器，其他命令/其他维度明确错误，不提供授物或任意代码执行。
- `console`命令在真实SaveSession共享锁内对最新状态执行。失败写入不部分改天气/时钟，旧代次及已离开场景的回执不进入新聊天。查询/语法失败不写存档。
- 内容版本`p9-commands-1`，environment v2保存clearWeatherTime及明确control结构。精确迁移旧v1，保留全部原有事实和数量，不清档。重置恢复时钟原版默认值，仍保留最新用户设置和用户名。
- 明确控制时间/天气的成功变更选择相应游戏来源，避免现实同步覆盖刚执行的命令；查询不改变来源。此为依据用户自主执行授权作出的工程决定，不声称用户逐项指定。重新选择现实同步仍走现有设置，指令不请求定位。
- 既有D08后台/离线/仅主页不推进仍有效；GUI/设置不自动暂停。用户显式tick freeze或time pause是新的原版命令控制，分别作用于全部游戏tick或天体时钟。高rate或sprint不靠巨笔事务阻塞主线程，也不许诺浏览器达到10000TPS。
- tick query只展示实际本页采集的同步领域tick工作平均值，不伪造JVM MSPT/百分位或目标设备性能。sprint的实测吞吐包含网页实际完成这些持久事务的时间；不宣称等同原版服务器性能。无样本时不编造平均值。

### 天空运动

此前存在原版旋转/漂移公式，但`sync()`每份快照都重置插值起点；没有动态画面证据不能把字段变化当运动验收。现在分别用游戏tick和天体时钟身份重锚，无关设置/GUI快照保留连续相位，并接入rate、fraction、pause、freeze。原版云速没有人为加快。

普通开发页面，固定相机、20TPS、clear、无并行构建/HMR，在2026-10-23 15:10:56.709Z至15:12:00.579Z约63.87秒：

| 实际渲染记录 | 起点 | 终点 | 差值 |
|---|---:|---:|---:|
| dayTicks（含插值） | 42009.884 | 43286.538 | 1276.654 |
| 云风位移 | 266.606514 | 304.906133 | 38.299619格 |
| star_angle | 180.176378° | 202.910131° | 22.733753° |
| 星四边形/云几何 | 780 / 34865×9实例 | 同前 | 未用重建几何冒充运动 |

真实连续画面：[起点](evidence/night-start.png)、[终点](evidence/night-end.png)。可见云边缘和星点随轨道移动，树与眼位不变。完整状态及可信键盘操作见[browser-records.json](evidence/browser-records.json)。冻结中5tick步进成功；40tick冲刺后恢复冻结，结束回执实测约753TPS/1.33ms每tick（单次短样本，不是性能验收）。

### 菜单

暂停动作及当前支持的选项类别共用水平中心线，竖排原版按钮；移除选项主页的额外reset说明（显式确认内仍保留）以及普通“正在保存/已保存”。真正失败继续红色聊天或主页实际错误区。声音开关提交后未产生新增保存聊天，原设置草稿/跨标签同步保持。

稳定生产构建实拍：[Esc菜单](evidence/built-pause.png)、[选项页](evidence/built-options.png)、[Tab候选](evidence/built-command-completion.png)、[提交未知指令](evidence/built-unknown-command.png)、[输入期即时错误](evidence/built-input-error.png)。1280×720实际画面，不以其他大小文件名冒充。`options-1280x720.png`捕获到了进入选项前的暂停帧，属于无效选项证据，保留但不计通过；以`built-options.png`及对应DOM按钮坐标为准。新增截图均为原页面直接捕获，未编辑补图。

## 自动化、复现和发布

- `npm run check --prefix app`。
- `npm test --prefix app`：526项，原478项保留，48项新增覆盖命令树、参数、补全、真实SaveSession、失败原子性、锁/重置/旧epoch、旧档、正式NativeSky运动与暂停、正式GameChat补全和菜单边界。旧迁移测试仅更新目标版本；菜单坐标断言对应原版布局；英文文本允许原版命令换行，聊天逐行渲染。
- `npm run data:verify --prefix app`：113物品、112可达配方、2042分类、18步蛋糕链及哈希通过。
- `npm test --prefix experiments/scene3d`：48项关键回归通过。
- `npm run build --prefix app`、`build:pages`、`test:built`：两条正式构建路径、实际HTTP入口、全部原版资源字节和内部资料隔离核对。测试源码/当前文档、截图不进入发布目录。

本机复现：`npm run dev --prefix app`进入`/game/`，按`/`，试`time set midnight`、`weather clear 1d`、`tick freeze`、`tick step 5t`、`tick sprint 40t`、`tick unfreeze`。`time pause`或`gamerule advance_time false`只停止天体时钟，云仍跟随游戏tick；`tick freeze`停止两者。输入`/we`按Tab完成weather；输入未知命令在输入期及提交后检查红字。Esc进入竖排菜单；Options中无额外说明，改变声音不显示“已保存”。

提交后分别核实origin/main、Actions build、deploy和线上bundle的build标识；不将工作区基线build当成最终提交。最终答复记录实际结果。发布失败不执行危险回退或清档。

人工试听、真实OS后台/跨屏DPR、实体Pointer Lock/拖动及Java客户端动态逐帧对照仍待用户亲验。此次没有重做无关功能的新档完整蛋糕流程，也不宣称历史104.2ms/545.6ms峰值已修复；这些既有风险记录保留。
