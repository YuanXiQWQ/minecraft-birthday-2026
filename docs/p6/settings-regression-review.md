# P6 设置与持续加工定向回归

基线：`42ce748837a36b791e135d8d8669ff69d32c4e67`。仅处理运行中重置确认、设置编辑被加工快照覆盖及直接相关生命周期。D04、D05/A、D07、D08、D09不变；未扩展漏斗、配方书、P7/P8，也未部署。原加工报告及历史证据保持原样。

## 复现与状态对照

| 同一用例                                                               | 修复前正式实现                                                                                                                                | 修复后正式实现                                                                                                                    |
|------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| 真实SaveSession建立炉子、填入原木/木棍、打开确认后推进100 tick，再确认 | `confirmation-stale`、`writable=false`、炉子仍存在；原始失败日志[before-reset.log](evidence/settings-regression/before-reset.log)             | 正常创建新generation，进度等于initialProgress，保留最新设置，会话可写                                                             |
| 真实浏览器左键按住音量滑块约2.2秒，1→0.4，期间加工提交9次              | input记录0.4，revision96→105后pointerup读取1；最终仍100%，没有有效change；[原始记录](evidence/settings-regression/before-volume-browser.json) | revision33→42时仍0.4，change提交0.4，显示40%，存档及刷新均0.4；[对应记录](evidence/settings-regression/after-volume-browser.json) |
| 他页先重置，再按本页旧确认                                             | 原实现会把确认冲突当作故障禁写                                                                                                                | 拒绝旧确认、展示重新确认的操作提示，保持ready/可写；可继续改音量并显式重新确认重置                                                |

复现使用正式方法，没有把方法体复制进测试。浏览器测试夹具只在verification模式创建输入引用和实例；实际输出由正式processingClock/processing-tick产生，设置由正式挂载页面操作。

## 确认与失败的边界

`codec.token()`现在表示 **代次与已确认的进度范围**，不再等于整份信封的revision/checksum：

- 保留format/contentVersion/vanillaVersion/generation、解锁事实、场景、稳定玩家布局、工作台内容、设备身份/位置/方向/输入/燃料引用、作物保留字段、配方书字段和蛋糕事实。
- 排除要保留的设置，以及同一炉实例的自主计时、待领取输出及其配方来源等加工字段。确认授权清除这些已列设备的完整当前内容；不要求玩家重新确认每次余火/输出变化。
- 新解锁、布局改变、实例增加/拆除/输入变化等仍拒绝旧确认。仅把已解锁输出取到临时光标且不改变上述范围时，不额外以revision拒绝；D07下重置仍清除该临时光标。这不是授物或无限加工规则的变化。
- 所有读取先走原decode及完整SHA-256/结构/内容版本校验；忽略revision作为确认条件不等于忽略存档校验。

正式UI还捕获签发时的session.serial。挂起恢复、导航、关闭设置均使旧确认不可继续使用；没有自动替换确认token。SaveSession.reset在共享锁内重新读取并校验，原子保留 **最新已提交**的语言/音量/静音，生成新代次和空进度。设置面板与确认仍可持续推进加工。

确认范围冲突用CommandRejected返回，并投影最新有效存档，健康会话继续可写；UI隐藏旧确认并提供“Reset progress again”的明确反馈。实际损坏/未知版本/校验错误/写入失败仍保护原始字节并禁写，可通过原Retry storage重读。缺失存档不会由重置路径悄悄初始化。

排队旧generation的加工/领取仍被拒绝；已失去generation/serial所有权的旧任务异常不能把新会话再次标为只读。processingClock原有锁内及封装后的执行者检查保留，没有通过暂停设置中的加工规避问题。

## 设置草稿与权威投影

正式`SettingsEdits`按字段持有editing/saving草稿和唯一回执ticket。app.ts实际使用该类，不把每份加工快照当作控件编辑值。

- 音量input立即更新草稿、滑块和百分比；change只提交当前有效草稿。连续加工快照只更新权威基底。
- 没有本地编辑时直接同步其他标签的最新设置；编辑时保留草稿显示。用户最终明确提交该字段，与锁内最新的其他设置合并。同字段按实际提交先后生效：远端先提交、本地随后确认时本地胜出；之后再来的远端提交可正常覆盖已结束的本地编辑。
- 等待保存回执时仍显示该草稿；回执只释放匹配ticket，不能清掉新手势。回执不把自己的旧值重新盖到更新的权威状态上。
- 成功同步权威状态并显示保存成功；失败放弃对应草稿，回到最后有效设置并给出明确错误，不假装已保存。语言与静音没有音量的input/change间隔，但也经过相同的异步草稿保护。
- 失焦/PointerCancel取消未提交编辑，已提交写入仍按事务完成；关闭、pagehide、重置代次变化清除本地草稿/旧回执归属。重开从最新权威值投影，不回滚已经保存的设置。
- 设置反馈独立于每250ms更新的全局保存状态。清空反馈保留PixelUI管理的画布节点，避免之后保存/冲突文字绘制到脱离DOM的旧节点。反馈预留高度，减少编辑期间布局跳动。

## 自动化结果

| 检查             | 结果与证据                                                                                                                                                                                                |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| TypeScript       | `npm --prefix app run check`通过；根路径构建也执行相同检查                                                                                                                                                |
| 正式测试         | **204/204**；新增21项设置回归；原24项合成领取时序及11项炉GUI队列测试保留且通过；[完整日志](evidence/settings-regression/formal-tests.log)                                                                 |
| P4               | 113可达物品、112可达配方、2042分类配方、18步蛋糕链、导出哈希通过；[日志](evidence/settings-regression/p4-data.log)；inventory-rules --check的113项派生规则校验通过                                        |
| P2关键回归       | **48/48**；[日志](evidence/settings-regression/p2-tests.log)                                                                                                                                              |
| 根路径/Pages构建 | 都通过，构建资源审计通过；[根日志](evidence/settings-regression/build-root.log)、[Pages日志](evidence/settings-regression/build-pages.log)。Three.js大chunk提示仍存在，不作为本次性能改善或跨设备性能结论 |
| 实际静态HTTP     | **2/2**；两入口、所有资源字节及规则数据、JS/CSS路径和内部/夹具404检查通过；[日志](evidence/settings-regression/http-built.log)                                                                            |

21项新测试覆盖：无加工重置、100 tick持续加工后重置、未取得输出仍未解锁、解锁/布局/输入/拆除确认冲突、他页新代次、旧页面serial、锁队列内重置先于旧tick/领取、真实SaveSession写入失败及重试、损坏/未来版本/未知内容/校验失败、连续加工投影、交错字段合并、旧回执对新草稿、语言/静音、关闭/取消/重置以及设置保存失败。现有确认安全测试增加健康会话和显式重试断言，没有删除安全断言。

## 实际浏览器证据

环境：当前可用IAB Chromium155 / Windows，DPR1.25；编辑页DOM视口359×956，对页1280×720。没有借视口或截图伪装实体手势。以下输入事件由工具的可信鼠标/键盘接口产生，记录中isTrusted=true；没有dispatchEvent。

1. 最终实现4秒真实左键长按滑块：41份100ms观测、revision779→796，草稿始终0.4/40%；另一个真实SaveSession在隔离夹具等待2秒后提交0.8，观测中的权威值0.45→0.8，草稿仍0.4。松开后的正式change提交0.4并成功保存；[完整记录](evidence/settings-regression/final-volume-interleaved-browser.json)、[实际画面](evidence/settings-regression/volume-saved.png)。延迟仅在测试夹具，不进入正式构建；跨标签交错中的远端提交是夹具命令，不冒称远端人工拖动。
2. 确认打开时revision822、输出20；约46.6秒后revision1009、输出24，确认仍保持打开。随后按Yes成功：新generation、revision0、全部场景无实例、解锁/布局/蛋糕为空，音量0.4/静音false保留；[打开](evidence/settings-regression/final-confirmation-open-browser.json)、[持续加工后](evidence/settings-regression/final-confirmation-after-ticks-browser.json)、[成功](evidence/settings-regression/final-reset-success-browser.json)。期间没有关闭设置或暂停加工。
3. 两个正式游戏页面同时运行，实际Web Locks观察一个页面提交tick，另一个为0；另一页真实键盘ArrowRight修改设置可同步到未编辑页。重复跨页重置后，两页同generation、revision0、无实例，旧计时不能复活内容；[A](evidence/settings-regression/two-tabs-final-a.json)、[B](evidence/settings-regression/two-tabs-final-b.json)。计数包括无状态变化的tick命令，不把计数当产量或持久写入次数。
4. 对页先按Yes重置，本页旧Yes被拒绝；提示重新确认且控件可操作，随后ArrowRight保存成功并重新确认重置成功；[冲突](evidence/settings-regression/generation-conflict-browser.json)、[显式重试](evidence/settings-regression/explicit-retry-browser.json)。[桌面同步画面](evidence/settings-regression/desktop-synchronized-settings.png)为真实1280×720页面。
5. 刷新恢复已提交音量；真实Esc与Done可关闭设置，重开无旧草稿/旧保存提示；[记录](evidence/settings-regression/refresh-close-browser.json)。原始2.2秒修复前后记录及中间观察文件均保留，不用最终记录覆盖失败证据。

截图仅辅助审阅；交互、时序和存档结论来自上述事件/状态记录和正式测试。没有把像素非空当作Steve、遮罩或其他历史功能的新视觉验收。

## 仍需人工验证与复现

普通运行仍为`npm --prefix app run dev`。隔离复现：`npm --prefix app run dev:verify`，打开4184的`/__verify__/index.html`和两个`/__verify__/input.html`；Fixture: running furnace仅准备已解锁原料/燃料引用，游戏页推进实际加工。打开Settings→Reset progress，等待数秒确认；音量长按/拖动跨多次加工提交再释放，检查百分比、刷新恢复。夹具可用delayed remote volume 80%在另一会话延后提交设置。测试路由仍排除于普通开发及两种构建。

- 本次可信长按/键盘通过不等于用户实体鼠标的连续移动拖动验收；需真实桌面浏览器拖动滑块持续数秒，途中失焦/PointerCancel，再重开核对是否取消未提交编辑、保留已提交结果。
- 真实操作系统窗口失焦、最小化、BFCache实际缓存命中、Firefox/Safari/Edge独立运行未在本轮完成；旧P2人工项仍保留。双标签均visible的IAB观察不冒充真实最小化/后台实验。
- 写入失败、损坏/未知版本通过正式SaveSession故障注入验证；未冒称在真实浏览器禁用存储/配额耗尽环境完成验收。
- 既有蒙版/Steve/工作台/炉输出测试无回归；本轮未重新宣称完成Java客户端逐项视觉对照或全部实体GUI拖动。

结论：两项缺陷已完成局部修复，有正式实现回归和真实浏览器时序证据；等待独立审查，不自动推进其他业务。
