# 指令提示与设置页面定向修正

基线6d4d924。用户连续指出发送前错误提示颜色/位置、设置误成单列、天气页冗余解释、Player Settings与Weather Settings缺少其他设置具有的**页面背景**。没有修改物品、存档、计时、庆典或聊天白名单合同。

## 实际原因与改动

| 问题 | 基线实际路径 | 当前路径与证据 |
|---|---|---|
| 命令发送前提示 | paint直接红色绘制raw message，没有position/context；根解析cursor=0 | 白色command.context.parse_error，`/unknown`位置1、上下文`/<--[HERE]`；输入斜杠灰色、错误段红色；预览不加入聊天 |
| 发送后 | 上下文含斜杠，未画样式 | 提交反馈去斜杠并换算cursor，错误片段红色下划线、HERE红色斜体；不加发送前的数字position文本 |
| 设置分类 | optionFlow四个全宽单列 | 普通桌面两列150逻辑像素、8间隙、24行距，暂停菜单仍竖排；极窄逻辑宽度不足310时单列以保持可读 |
| 玩家/天气页背景 | layout只为language/sound画list背景和separator，player/weather跳过此分支 | 四页共用已有原版inworld_menu_list_background、inworld_header_separator及inworld_footer_separator。**不是按钮背景问题** |
| 天气解释 | 按钮下挂载privacy/attribution/status段落 | 移除常驻解释段落，定位含义使用按钮title，状态变化更新title；失败保持原红色聊天，来源为底部Open-Meteo链接。未请求定位或发起天气查询 |
| 确认与绘制 | 重置确认浮在分类按钮上；按钮sprite依赖异步resize绘制 | 确认独占屏幕，后方分类不显示/不可点；保持原确认及重置事务。布局结束同步刷新已有按钮sprite与文字，缓存每控件绘制器，不新增重复canvas |

## 同版本依据

只读分析已取得26.3官方client.jar，SHA1与类SHA256见[native-evidence.json](native-evidence.json)，没有启动Java客户端。

- CommandSuggestions.getExceptionMessage构造command.context.parse_error(raw,cursor,context)，extractUsage默认颜色-1（白色）；UNPARSED_STYLE为RED，LITERAL_STYLE为GRAY。输入提示保持原版一行布局，超过视口时由视口裁切，不自创错误卡片。
- Brigadier1.3.10 CommandSyntaxException.getContext取错误前最多10字符、必要时`...`及字面HERE；客户端输入包含斜杠。
- Commands.performPrefixedCommand先移除斜杠；finishParsing发送raw failure和独立上下文，失败段RED+UNDERLINE、HERE为RED+ITALIC。BakedSheetGlyph的shear为`1-.25*y`；Font.PreparedTextBuilder的下划线为y+8到y+9。
- OptionsScreen.init使用GridLayout.createRowHelper(2)、水平padding4和底部padding4；AbstractSelectionList使用inworld_menu_list_background并分隔header/footer。本项目Player/Weather为有限自定义设置内容，沿用同一原版列表背景，未声称原版自带天气页面。

## 测试和当前画面

新增11项command-menu-display测试直接调用GameChat.paint/commandMessage/submitCommand、真实SaveSession、NativeScreens.layout及PixelUI.refreshButton。包含输入提示/发送反馈分离、cursor换算、10字上下文、字形样式、合法编辑、双列/窄屏、确认清理、四子页背景及同步sprite刷新。更新2条将错误单列固定为预期的断言，保留安全回归。

- 类型检查通过；正式测试**538/538**，包含原领取、设置草稿、配方书生命周期、采集容量和迁移测试。
- P2 **48/48**；P4 **113物品/112可达配方/2042分类/18蛋糕链步骤**且导出哈希一致。
- 普通根路径及Pages子路径build/audit通过，HTTP与资源字节检查**2/2**。
- 隔离IAB Chromium、1280×720、DPR1.25、实际GUI scale3.2。原生按键`/`、输入unknown、Enter；原生按钮进入设置/各子页/重置确认及取消。未合成事件、未操作实体桌面。

| 证据 | 内容 |
|---|---|
| [command-before-send.png](evidence/command-before-send.png) | 白色提示position1、输入灰色斜杠与红色错误段 |
| [command-after-send.png](evidence/command-after-send.png) | 红色聊天、不含斜杠、下划线和斜体 |
| [command-messages.json](evidence/command-messages.json) | 同一次原生发送后的DOM投影消息，预览没有成为聊天 |
| [options-two-columns.png](evidence/options-two-columns.png) | 两列设置分类 |
| [player-page-background.png](evidence/player-page-background.png) | 玩家页实际列表背景和上下分隔线 |
| [weather-page-background.png](evidence/weather-page-background.png) | 天气页同款背景，无解释段落；时间/天气两列 |

截图来自当前源码实际页面，未编辑。Pages子路径普通构建亦完成同样的原生设置导航、重置确认/取消及普通保存（没有“已保存”文本）。[构建天气页](evidence/built-weather-background.png)、[构建玩家页](evidence/built-player-background.png)、[独立重置确认](evidence/built-reset-confirmation.png)来自正式build，未使用验证入口。旧报告和无效旧画面保留，不将其改写为当时通过。跨引擎、实体输入、人工试听及Java客户端动态并排仍未验；本改动不宣称这些通过。

## 发布核对

提交后核对远端main、CI、Pages部署和线上bundle中的BUILD_ID，互不替代。最终结果见本记录的发布核对补充或交付回复；不为将本提交SHA写入自身而修改历史。
