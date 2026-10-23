# 语言列表、页脚与中文字体纠正

用户提供网页与原版游戏对照图，要求修改不一致的样式，并指出底部翻译括注偏高、中文字体异常。保留英语/简体中文支持、存档与翻译文案；没有启动Java客户端或操作实体桌面。

## 同版本依据

只读分析锁定Java26.3客户端SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`。原类哈希、方法与参数见[native-evidence.json](native-evidence.json)。Unihex位图源与仓库原始字体一致，异常来自绘制参数与中间画布分辨率。

- `LanguageSelectionList`：原版基础行宽220加50，得到270；行高18，首行起点为列表顶部加2。文字按内容区垂直居中，位于行顶部加5。
- `AbstractSelectionList.extractSelection`：只对选中行绘制，外框填白色（列表聚焦）或`#808080`（失焦），内缩1像素填纯黑。未选中行透明、没有独立按钮边框，悬停不新增选中框。移除通用设置按钮14像素上边距对语言行的污染。
- `HeaderAndFooterLayout`：53像素页脚内，9像素文字、8像素间距、20像素按钮整体居中，上下各8像素。因此括注是height−45，完成按钮是height−28；之前的height−49/height−26错误。
- `UnihexProvider.Glyph`与`GlyphBitmap`：原版oversample2、裁剪后的整数半宽advance加1、top0、shadowOffset0.5。`FontTexture`使用NEAREST。读取官方`include/unifont.json`的size_overrides，保留CJK等范围的固定宽度，其他字符按有效源列裁剪。
- 默认字体按原版顺序读取`nonlatin_european.png`、`accented.png`、`ascii.png`，再回退Unihex；省略号、引号等标点和重音字符保留原版位图、height与ascent，不用Unicode替代字形覆盖。

字体定义来自锁定官方asset index34，SHA-1 `402ded0eebd448033ef415e861a17513075f80e7`。原始JSON进入experience清单与启动依赖，Python导出脚本、SHA-256和字节数同步。模型和场景内容未调整。

## 实现

语言行保留真实DOM命中和可访问名称，以原版尺寸与焦点规则绘制；语言名称使用原版的ASCII括号组合。语言页隐藏主页故事卡、设置入口、场景导航及生日重播控件，仅保留真实模糊世界背景、页头/列表/页脚。

静态文字、滑条、物品Tooltip和生日Toast按实际GUI缩放与DPR建立帧缓冲，再以最近邻采样绘制原字形。取消中文整体上移1像素与统一1像素阴影，取消低分辨率线性平滑。保留原有ASCII、物品、聊天、配方与进度事实。用户自定义翻译括注不再被原版文本导出覆盖。

## 验证与边界

正式规则测试701项通过，增加原版行/页脚坐标、Unihex裁剪、基线、NEAREST、半像素阴影及位图provider优先级回归；保留P2技术测试48项通过。数据核验、两种正式构建及HTTP产物检查单独执行。

普通Chromium测试使用root与Pages子路径、1280×800、390×844，Pages增加DPR1.25。断言未选中透明、选中黑底白框、270×18行框、括注/完成坐标，以及文字画布与实际帧缓冲1:1；检查实际截图。刷新、跨标签、真实库存/已放蛋糕保留、重置保留语言、失败保存回退沿用正式回归。旧缓存同时注入真实的旧startup与experience清单（不包含新增字体定义），再核实重新校验与新字体依赖加载。结果与网络清单记录见[evidence/browser-results.json](evidence/browser-results.json)。未清除旧缓存或存档。

本次截图均为真实正式页面，未编辑：[语言列表](evidence/root-languages.png)、[物品中文](evidence/root-items.png)、[窄屏语言页](evidence/pages-language-narrow.png)。浏览器检查不等于用户目标电脑、实体鼠标或原生中文输入法验收。

沿用普通新提交、main快进推送与既有Pages发布；CI、部署和线上实际build在推送后分别核实。
