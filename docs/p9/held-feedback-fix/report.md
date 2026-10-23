# 连续挖掘及原版反馈边界

基于e3aed19，落实用户的连续长按、移除合成诊断说明及消息通道纠正。不是重新制作物品系统或庆典。

## 当前行为与同类核查

| 路径 | 缺陷 | 修正及验证 |
| --- | --- | --- |
| 左键长按 | 完成一次破坏或换命中后cancelMining终止计时，不再启动后续目标 | 按住手势与单块进度分开；持续新射线，换目标/工具只清该块进度。一次仅一个提交，成功后正常硬度方块等待5 tick；瞬间破坏物等待下一攻击tick。可在空命中开始按住后移入有效目标 |
| 生命周期 | 异步提交后不能越过松键、GUI或代次边界续挖 | 票据/手势epoch/存档scope/页面serial共同保护；松键、出画布、捕获丢失、GUI、失焦/隐藏、切场景、重置和销毁取消。保存失败不自动重试原节点 |
| 背包/工作台/炉/漏斗共用GUI | inventory-hint仍挂载独立绿色说明条，极窄布局下逐字换行 | 移除节点、默认临时规则文案及其CSS/点击区域。真实失败通过正式feedback端口交给红色系统聊天；返还成功不生成额外说明 |
| 缺料/不匹配/普通容量拒绝 | 点击缺料配方写book.missing/conflict；空结果槽Tooltip写No Matching Recipe | 普通不能制作保持静默；真实结果为空。原版幽灵及数量红色缺料层继续存在，不生成材料；空槽无Tooltip，有真实/幽灵结果时保留正常物品名称Tooltip |
| 游戏选项反馈 | 保存/重置/天气状态也有独立文字出口 | 游戏操作消息统一通过同一七类策略；Saving/Saved等普通确认不入聊天，真实失败红色、重置完成属于存档状态变化。设置标题/控件、确认内容、定位隐私说明保留。主页无游戏聊天，沿用其设置反馈 |
| 原版独立反馈 | 用户明确不能把所有东西当聊天 | RecipeToast/成就、配方图标缩放、正常物品Tooltip、GUI标题/按钮/数量/槽位、声音保持独立。没有添加NBT、组件数量或高级物品ID文本 |

来源见[native-evidence.json](native-evidence.json)：核实同一官方26.3 JAR SHA1，使用已有JDK只读javap核对Minecraft.continueAttack、MultiPlayerGameMode.continueDestroyBlock/startDestroyBlock、AbstractContainerScreen.extractTooltip和GhostSlots.extractTooltip。原版持续按住反复处理命中、异目标重开进度，正常完成destroyDelay=5；空槽hasItem失败直接返回，幽灵使用物品Tooltip。未启动Java客户端，未声称逐帧体验全部等价。

## 实际浏览器证据

隔离Chromium、1280×720、4266独立验证源；页面使用正式mount/SceneView/WorldUse/GameInventory/SaveSession。只有明确标为Fixture的准备按钮授予有限样本并准备真实实例，后续操作走可信浏览器输入，没有dispatchEvent或直接调用破坏/配方选择来冒充输入。该样本不是新档无授物主线。

- [单次7秒长按事件及状态](chain.json)：一次isTrusted pointerdown、一次isTrusted pointerup，前炉→提交→后炉→提交→空命中→松键；2→1→0实例，实际有限背包熔炉总数64→66，主手木镐保留。按住期间没有再次点击。[前](evidence/chain-before.jpg)/[后](evidence/chain-after.jpg)。原版五tick与目标换工具重置另有固定时钟测试，不从截图推断精确时长。
- [个人2×2](missing-materials.json)：一块木板选择工作台，缺料位false/true/true/true，真实输入/结果为空；独立说明条数量0。[画面](evidence/missing-materials.jpg)。
- [真实3D工作台右键Use及3×3缺料](workbench-missing.json)：一块圆石、一根木棍选择石铲，第二根木棍缺失，结果只作幽灵显示，无真实结果、无长条说明。[画面](evidence/workbench-missing.jpg)。
- [空结果槽实际点击](empty-result.json)：Tooltip隐藏，真实结果为空，没有No Matching Recipe。[画面](evidence/empty-result.jpg)。[幽灵结果点击](ghost-result.json)/[画面](evidence/ghost-result-click.jpg)也不授物；点击后Tooltip隐藏，不将此截图伪称持续鼠标悬停验收。正常物品名称Tooltip已在配方按钮画面可见；结果Tooltip分支另有正式方法测试。
- [设置操作](settings.json)：菜单→Options→Music & Sounds，可信点击音量，控件继续工作，独立反馈节点无文本、inventory-hint不存在。[画面](evidence/settings.jpg)。
- 准备样本时实际可观察到独立New Recipes Unlocked Toast；没有将通知迁入聊天。浏览器音频激活/指针锁受限仍保留真实错误记录，不宣称人工试听或Pointer Lock体验通过。

## 回归与复现

类型检查、正式477项（保留原463项；新增14项，包括原领取队列中的容量静默/写失败反馈断言）、P4 113物品/112配方/2042分类/18步蛋糕链和哈希、P2关键48项；根路径/Pages构建审计及HTTP逐字节测试。旧领取、关台返还、炉队列、设置草稿、幽灵生命周期、采集容量和迁移均保留。

`npm run dev:verify --prefix app -- --port 4266 --strictPort`，打开`/__verify__/held.html`；Fixture按钮只准备该验证源样本。two furnaces后在观察JSON的point长按左键7秒，查看transitions/events；one plank后E→箱子页→配方书→工作台；workbench后在point短右键→配方书→石铲。正式构建没有该页面/测试按钮，也没有新授物入口。

本轮没有修改存档版本、配方/数量/余留物、世界布局、天气机制或生日触发条件。实体右/中拖、真实锁定相对移动、跨引擎/OS后台、人工试听及Java动态对照仍按原清单待验；连续左键长按已经取得本次可信浏览器证据，不再列为未测。历史性能峰值原因结论不变。
