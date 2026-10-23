# 自由移动、第一人称持物与方块放置

## 用户要求与边界

本次按用户后续明确要求覆盖固定眼位与仅四种设备可放置的历史限制。保留已有矿洞自然矿脉与可挖内部石层、其他三个场景的并行视觉改造、有限背包、共享存档锁、活动时钟、生日触发和原版界面。

四场景 WASD 移动、Space 跳跃、Shift 潜行、Ctrl 前进疾跑；隐藏 Pointer Lock 与可见指针/右拖两模式保留。水平转向不设限，俯仰限制 ±90°。新增玩家位置按场景保存；进入时若保存身体与当前实体岩层重叠，回到该场景安全出生位。位置保存不增加手动进度修订计数，不使重置确认因移动过期。

## 26.3 来源

- [官方 Java 26.3 发布记录](https://feedback.minecraft.net/hc/en-us/articles/48913133328013-Minecraft-Java-Edition-26-3)。
- [锁定官方客户端](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar)，SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`。仅只读分析，没有启动 Java 游戏或操控实体桌面。客户端和反编译源码不进入仓库/网站。
- `Attributes`：block_interaction_range 4.5、entity_interaction_range 3、attack_speed 4、step_height .6。`Player`/`LivingEntity`/`Entity`：身体 .6×1.8，眼高 1.62；潜行高 1.5、眼高 1.27；20 Hz，移动属性 .1、输入 .98、普通地面摩擦 .6×.91、重力 .08、跳跃 .42、空中竖直阻尼 .98。
- `ClientLevel.getMarkerParticleTarget`：标记粒子要求创造模式并手持对应标记方块物品。生存模式没有靠近自动显形机制。有限场景外壳采用不可见碰撞边界，具体场景范围为依据用户自主执行授权作出的工程决定，非声称原版有限地图尺寸。
- `Items`/`Item.Properties`：剑 1.6、镐 1.2、铲 1；木/石斧 .8、铁斧 .9；木/石/铁锄 1/2/3；木/石/铁矛攻击动画 13/15/19 tick。`Player` 以 20/attack_speed 计算冷却；`SwingAnimation` 默认挥动 6 tick。挖掘进度与攻击冷却分离。
- `FirstPersonHandsAndItems`、`FirstPersonHandsAndItemsRenderer`、`SpearAnimations`：原版右手皮肤、第一人称显示变换、挥动、刺击、换物高度每 tick 最大变化 .4。GUI 使用原版攻击指示器资源及反色混合。
- `Window.getAppropriateLineWidth` 与 `LevelRenderer`：黑色、alpha .4，线宽 `max(2.5, framebufferWidth/1920×2.5)`；线段取形状并集外边缘，不绘制放置虚影。
- `BlockItem` 放置声音音量 `(soundType.volume+1)/2`、音高 `soundType.pitch×.8`。方块硬度、工具标签、掉落表、原始模型与声音均来自同版本。

## 放置与持久化

当前有限图鉴对应 66 个 BlockItem，新增独立场景 `blocks` 可选字段；旧档无字段直接兼容。现有四类设备继续走原实例/容器事务。新建方块消费当前真实快捷栏的一件，原子检查库存快照、范围、占用、身体碰撞及支撑；不从无限图鉴自动补充。

包括半砖合并、楼梯朝向/内外角、原木轴向、门的上下双格、床的双格、墙面火把/梯子/告示牌、灯笼吊挂、栅栏/墙/铁栏连接、木门/活板门/栅栏门开关。破坏按实际工具和原版掉落表结算；移除支撑会处理附着方块。普通刷新保留方块状态和有限数量，重置仍只清进度保留设置。

这里扩大的是放置、拆除与已有交互入口。没有把新放下的箱子、烟熏炉等声明为已经实现新的容器/加工玩法；没有增加红石网络、战斗伤害或完整随机世界模拟。当前有限场景也不声称完整复刻 Minecraft 的全部流体、活塞、重力方块实体、告示牌编辑及铁路网络行为。

## 资源与验证

`app/tools/controls-assets.ts` 导出可达 blockstates 的全部 variant/multipart 模型、父模型、贴图/动画元数据、原掉落表、工具标签、攻击 HUD 和相关声音；来源类、导出脚本、手工转录属性、声音索引及每个资源的哈希保留于 `controls-manifest.json`。第一人称物品依赖由普通 `player-assets.ts` 导出。运行清单全部使用 `fetchManifest` 的构建版本参数与 no-cache，资源仍检查 SHA-256 和长度。

验证结果与原始截图在 `evidence/`；`app/tests/native-controls-browser.mjs` 可重跑普通 root/Pages 构建下的历史 HTTP 缓存、有限圆石放置/挖回、位置/方块恢复及真实键鼠输入。测试使用独立浏览器上下文与明确的存档样本，不改用户浏览器数据。

- TypeScript 检查与 684 项规则回归通过。
- 浏览器逐一编译 563 个原版状态，缺失模型/贴图为 0。
- 人工试听、用户实体浏览器操作、Java 客户端并排人工对照未进行；浏览器音频调度和 headless 原生输入不冒充这些项目。

- 保留 P2 的 48 项回归、原版数据来源校验通过。
- root 与 Pages 普通构建、审计和逐资源 HTTP 字节核验均通过（2/2）。HTTP 测试先完成同步资源校验再建立请求，避免大量文件校验阻塞事件循环后复用已过期连接；没有减少字节校验或吞掉网络错误。
- 原生 Chromium 操作完成圆石 16→15→16 闭环；放置后普通刷新恢复方块，移动后普通刷新恢复位置。root 与 Pages 的旧清单实际命中浏览器磁盘缓存后升级通过，保留三条已有采集记录。
- 真实 Pointer Lock、木斧 .8 与铁剑 1.6 的不同冷却、四场景首帧/HUD、矿洞 1280/1920/390 三种视口记录于 [浏览器结果](evidence/browser-results.json)。[空手矿洞](evidence/cave-empty-hand.png)、[圆石放置](evidence/root-cobblestone-placed.png)、[攻击冷却](evidence/axe-attack-cooldown.png)均为未编辑的真实浏览器截图。
- 本地截图来自提交前普通构建，构建基线标记为184fc8efb91b；不把该标记声称为新提交已上线。发布结果另行核对。
