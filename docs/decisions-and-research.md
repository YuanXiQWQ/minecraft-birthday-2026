# 技术决策、待确认事项与核实记录

日期：2026-10-20（America/Vancouver）。状态：本轮规划审查材料。只有明确标为“用户确定”或“事实已核实”的条目可作既定前提；其余是建议、候选或实施前验证项。

相关文档：[需求核对](requirements-audit.md)、[架构](architecture.md)、[阶段路线](development-roadmap.md)。

## 1. 决策登记

| ID | 事项 | 当前状态 | 建议及理由 | 定案时点 |
| --- | --- | --- | --- | --- |
| D01 | Java 26.3 唯一规则/资源基准 | 用户确定，正式版存在已核实 | 固定实际版本构件和资产索引，不随 latest 自动升级 | P1 固定下载及导出清单 |
| D02 | 实现技术栈 | 建议，待审核 | TypeScript + React + Vite；纯规则与展示分离，静态双入口；暂不用大型游戏/状态/拖放引擎 | 授权 P2 工程前 |
| D03 | 工作站放置与漏斗 | 未定；历史助手结论无批准效力 | 当前倾向引导槽位、可拆换；先比较有限网格的完整增量，若成本低则按用户要求允许自由交互并实现一层辅助 | P1 评估，必要时 P2 隔离原型后再审查 |
| D04 | 无限目录与临时容器计数 | 技术适配建议，待审核 | 目录无 count；光标/容器/快捷栏的临时 count 支撑拆半/拖动；加工不减少解锁和输入；不给资源总量门槛 | P1 行为合同 |
| D05 | 取得产物与有界批量 | 建议，待审核 | 合成结果领取/熔炼结果领取才解锁；漏斗合法转移也算取得；Shift 以接收容量为界，不循环到原料耗尽 | P1 行为合同 |
| D06 | 配方书发现 | 未定 | 优先核对原版发现触发并将解锁映射为获取；不可触发规则逐条说明；发现不限制手工正确配方 | P1 核对后，P4 前定案 |
| D07 | 关闭 GUI、拆除与刷新 | 建议，待审核 | 光标/个人合成临时填充在关闭时清除，来源目录保留；工作站实例内容保存，拆除清除实例；刷新自然层视为新进入 | P1/P3 前 |
| D08 | 作物/工作站计时 | 部分确定：小麦短固定阶段 | 建议跨场景继续，离线/网页后台暂停，不累计大量输出；具体短阶段时长后续体验调优 | P3 前决定策略，P7 定时长 |
| D09 | 存档与重置细节 | 无账号/数据库和设置重置已确定 | 推荐 localStorage、版本化、小型备份；单写入防旧标签覆盖；重置确认、保留语言音量、回主页是建议 | P3 前 |
| D10 | 庆典重播与时长 | 未定 | 建议首次放置自动演出、刷新不自动重播、完成后可手动重播；中断不丢蛋糕，播放状态单独保存 | P3 定存档字段，P8 前定体验 |
| D11 | 背景音乐及祝福文案 | 未定 | 成就/经验/烟花声音保留；背景曲目和是否加入另议；所有正式英文文本外置，用户示例不作定稿 | P8 前；资产条件 P1 先查 |
| D12 | 场景生产方式和布局 | 四场景已确定，视觉未定 | 原版资源分层 2D；优先实际游戏/同版模型生产画面，动态资源不烘焙背景；建议一个树种、平原水边甘蔗 | P1 定来源，P2 工艺验证，P7 前定布局 |
| D13 | 目标设备与触控深度 | 未定 | 建议桌面键鼠作为原版一致性基准，浏览器自动测试三引擎；触控需另定操作映射，不能拿触控简化桌面输入 | P1/P2 |
| D14 | 原版资源引用/分发路径 | 未完成验证 | 按 GUI/字体/图标/粒子/音效/音乐分别记录来源与许可依据，不把非商用、私有仓库当成统一许可 | P1，阻止未经核实的资源引入 |
| D15 | Pages 资格与可见性 | 目标托管已确定，实际设置未查 | 发布前核查用户账户与站点访问范围；不默认将站点设为公开或私有，不改变仓库权限 | P1 确认部署假设，P9 发布前复核 |
| D16 | 开发资料进入 Git | 本轮用户后续已明确 | 暂时可随私有仓库管理，交 Vincent 前再处理隐藏；始终不进入网站构建产物 | 当前执行；本轮仍不提交、不推送 |

审核可分层进行：先批准整体模块/开发顺序和 P1 调研；D03/D04/D06 等具体行为可在 P1 提供真值表与原版证据后定案，不要求现在凭抽象描述一次决定全部。任何具体阶段开工仍需实际授权，本轮停在规划交付。

## 2. 本轮核实结果

### 2.1 游戏版本与命名

- Mojang 官方 26.3 发布说明标示 2026-09-15；本轮直接读取版本清单，26.3 条目为 release，latest.release 也为 26.3。
- 版本清单条目指向 [26.3 元数据](https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json)，该清单条目的 SHA-1 为 `61fff1316bd50312624a858bbb5eb18fa45208ed`。这是版本元数据校验值，不是客户端 JAR 校验值。
- 元数据列出的资产索引 ID 为 34，SHA-1 为 `0c8f43b28f837869c1e54a6aeb22c396a1548946`；[资产索引地址](https://piston-meta.mojang.com/v1/packages/0c8f43b28f837869c1e54a6aeb22c396a1548946/34.json)。本轮只读取版本元数据中的索引信息，未下载完整索引或资产对象。
- 对应元数据 downloads 只列 client/server，没有旧式映射下载项。Mojang 官方说明无混淆分发，并说明 EULA 不变；Fabric 的 26.3 技术说明使用无混淆原始名称。选择同版本原名为基准是工程判断，不是获得开源代码许可。

本轮没有读取完整客户端/服务端构件、安装 Java 或反编译工具。因此不能声称具体方法名、完整 GUI 操作或物品表已经核实。旧教程中 Yarn/官方映射名称不能混写到同一份行为证据中；若确有旧版本参考，应标明版本和命名，仅作为辅助。

依据：[官方版本清单](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json)、[官方 26.3 发布说明](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3)、[Mojang 取消混淆说明](https://www.minecraft.net/en-us/article/removing-obfuscation-in-java-edition)、[Fabric 26.3 技术说明](https://fabricmc.net/2026/09/15/263.html)。

### 2.2 会影响本项目的 26.3 数据变化

官方发布说明明确：燃料有 cooking_fuel 数据组件；加工速度会用到其数值提供器；高炉等配方的原始 cookingtime 与熔炉对应配方的字段关系有变化。因此不能只读取旧式 fuel table，也不能看相同 cookingtime 就认定高炉没有加速。

本项目的后续动作是导出并解释同版本实际组件/上下文，再与游戏计时对照。燃料无限续用是本项目适配，不能伪称原版不消耗燃料。

依据：[官方发布说明的 Data Components / Cooking Recipes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3)、[Fabric 的 Fuel and compostable components](https://fabricmc.net/2026/09/15/263.html)。

### 2.3 资产使用条件

查阅了 Mojang 使用指南与 EULA；两者包含资产/品牌及分发限制，指南还有站点和音频相关规定。它们不支持“私有仓库且非商用，因此任意提取整套素材公开分发”的推论。无混淆也没有改变 EULA。

本轮只作这一边界判断，未对具体资源清单作法律许可结论。P1 必须按具体使用方式记录依据，必要时向权利方确认；不得因此擅自放弃用户原版素材要求或增加与生日目标无关的账户验证系统。

依据：[Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines)、[Minecraft EULA](https://www.minecraft.net/en-us/eula)。

### 2.4 静态构建与 Pages

Vite 官方说明支持多 HTML 入口，以及部署基础路径。两个实际入口适合 GitHub Pages，避免要求服务器为任意路由回退 index。

GitHub 官方说明 Pages 可以部署工作流生成的静态产物；私有仓库可用资格依赖计划，站点私有访问控制有独立的组织/企业条件。故本项目不得由“仓库私有”推定“知道链接以外的人无法访问网页”。本轮没有检查具体账户计划/Pages 配置，也没有更改设置。

依据：[Vite Production Build](https://vite.dev/guide/build.html)、[Vite Static Deploy](https://vite.dev/guide/static-deploy.html)、[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[GitHub Pages 站点可见性](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)。

### 2.5 存储与音频

localStorage 按 origin 而非仓库路径隔离，并可跨浏览器会话保留。storage 事件通知其他共享存储的文档，不通知写入方自身；因此主页恢复、同页更新和跨页通知需要不同入口。浏览器可拒绝存储或阻止音频，需测试异常路径。

Web Locks 是可用于同源标签页协调的浏览器能力，受环境支持及安全上下文约束；本轮建议单写入是项目设计，不是说 localStorage 自动提供锁。音频授权也不能假定从主页导航到游戏后必然沿用。

依据：[MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)、[MDN storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)、[MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)、[MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。

测试工具建议可参考 [Vitest 入门](https://vitest.dev/guide/)与 [Playwright 测试文档](https://playwright.dev/docs/writing-tests)；本轮不固定依赖版本、不创建配置、不运行应用测试。

## 3. 高风险验证登记

| 风险 | 早期验证 | 失败时处理 | 不允许的捷径 |
| --- | --- | --- | --- |
| 原版资源不能按计划分发 | P1 逐类来源/使用/分发证据 | 明确具体类别与方案，提交用户审查 | 私有/非商用等于可任意分发；私自改自造素材 |
| 26.3 数据格式/速度变化 | P1 样本与 P4 全量覆盖 | 修改导出与解释层，固定实际证据 | 用旧版配方/燃料凑数 |
| 可达配方遗漏 | P4 闭包、来源证明、未知类型检查 | 回到类型/能力审查，补规则 | 只保留蛋糕主线白名单 |
| 原版 UI 与无限资源冲突 | P1 合同、P2 输入原型、P5 矩阵 | 集中记录适配，按原版基准验证 | 鼠标能拖就算原版一致 |
| 放置/漏斗引发扩张 | P1 完整增量评估、P2 局部验证 | 有依据地选槽位或有限网格并审核 | 借助手旧结论跳过用户条件 |
| 烟花观感/性能不足 | P2 五形状/踪迹/闪烁与音频先行 | 调整渲染器、并发和纹理加载；必要时评估 WebGL | 最后一周才发现不行；改通用彩纸 |
| 存档重置被旧页覆盖 | P3 多页测试、单写入、generation | 明确锁能力及退化策略 | 仅版本号比较就宣称并发原子 |
| 背景与可采集元素难分离 | P2 一个局部完整图层 | 调整素材工艺后再生产四场景 | 背景残影靠新 UI 遮盖 |
| 完成与主页不同步 | P3 投影、P8 全流程 | 同一完成事实，覆盖 BFCache/storage | 保存两个无一致性约束的蛋糕布尔值 |
| Pages 产物泄露内部资料 | P2 最小构建、P9 输出扫描 | 明确发布根和白名单产物 | 上传整个仓库或仅靠 .gitignore |

## 4. 本轮执行边界核对

- 阅读了根 AGENTS.md、提案、完整会话所有消息，检查 Git、文件结构及 README。
- 使用官方与一手技术资料核实版本、数据变动、静态构建/Pages、浏览器存储/音频约束；读取 Mojang 的版本清单和版本元数据。
- 本轮只新增/编辑 Markdown 规划资料和 AGENTS 索引；原始提案、完整会话和 README 不改写。
- 没有编写应用代码、脚手架、配置或测试实现；没有安装依赖、下载游戏构件、修改 .gitignore/排除规则、执行提交或推送、修改远端设置或开始下一阶段。
- 用户自行变更背景资料的 Git 策略已在需求核对中记录，不将该操作视为本轮代理提交。

本轮验收是文档内部一致性、需求追踪、引用与文件范围检查；应用测试留待真正进入实施阶段。
