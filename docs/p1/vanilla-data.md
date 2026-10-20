# P1：26.3 构件、来源和关键数据核实

日期：2026-10-20。范围：官方文件下载、校验、ZIP/JSON 读取与现有 JDK 静态检查；没有启动游戏或服务端，没有开发配方闭包引擎。

## 1. 证据等级

所有 P1 文档采用相同标记：**D**＝已校验官方文件中的直接数据；**S**＝同版本 class 的静态控制流证据/据此推导；**A**＝工程建议或估算，未获产品批准；**U**＝未验证。真实客户端操作证据为 **C**，本轮 C 项数量为零。D/S 不等于已经通过浏览器或客户端实测。

机器可读记录见 [evidence-lock.json](evidence-lock.json)：固定官方 URL、下载文件 SHA-1/SHA-256、58 个包内条目 SHA-256、类型数量与四项数据断言。原始构件、声音、字体与 javap 输出在仓库外缓存，未加入 Git。

## 2. 版本构件锁定

官方入口：[版本清单](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json)。按 id=26.3 精确选择，不能在后续构建中用 latest 替代。此次清单该条目为 release，releaseTime 为 2026-09-15T04:23:02-07:00；元数据中的 release 时间不代表下载时间。

| 文件 | 官方大小（字节） | 实际大小 | 官方 SHA-1＝实际 SHA-1 | 结论 |
| --- | ---: | ---: | --- | --- |
| 26.3.json | 清单未单列 | 读取并计算 | 61fff1316bd50312624a858bbb5eb18fa45208ed | D：一致 |
| client.jar | 41,483,720 | 41,483,720 | e877b6a07acd633fb3bb475002175cec036e7b87 | D：一致 |
| server.jar（外层） | 62,294,556 | 62,294,556 | 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c | D：一致 |
| 34.json（资产索引） | 597,035 | 597,035 | 0c8f43b28f837869c1e54a6aeb22c396a1548946 | D：一致 |

对应 [版本元数据](https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json)和[资产索引](https://piston-meta.mojang.com/v1/packages/0c8f43b28f837869c1e54a6aeb22c396a1548946/34.json)。client/server 的对象 URL、实际 SHA-256 均记录在证据锁文件。

服务端外层是 bundler，不能把外层文件中没有 recipe 目录误判为服务端没有配方。读取 META-INF/versions.list 后解出 META-INF/versions/26.3/server-26.3.jar，其 SHA-256 与清单一致：`a362163eec5d1612d520772bc16e5b39c09e3b234fdc045f56bf544284ee8ae6`。

client/version.json 指定 Java 25、stable=true、world_version=5023、protocol_version=777、resource pack 97.1、data pack 121.0（D）。这些不是本网站存档 schema。元数据 downloads 仅 client/server；class 名称可读，以本版本原始名称作静态证据，不混用旧 Yarn 名称。可读不表示开源许可。

**工具与方法**：工作机已有 JDK 25.0.3；使用其 javap 读取 class，不加载运行 Minecraft 类。PowerShell/.NET 负责 ZIP、JSON、哈希。没有安装反编译器或依赖。缓存为 `C:/Users/YuanXi/AppData/Local/Temp/minecraft-birthday-2026-p1-20261020`，不作为后续会话必然存在的长期来源。

## 3. 数据盘点与解析注意事项

基础包 data/minecraft/recipe/*.json 共 **1,763** 份，**21** 种 type（D）。客户端与内层服务端这 1,763 份逐文件 SHA-256 全部一致。没有启用内置可选 datapack；其条目不并入下表，也不声称这些数目是 Minecraft 配方注册器/序列化器的全部可能类型。

| type（统一省略 minecraft:） | 文件数 | 本项目来源分析 |
| --- | ---: | --- |
| crafting_shaped | 827 | 必需，工具/桶/蛋糕/工作站及副产物 |
| crafting_shapeless | 375 | 必需，木板/糖等 |
| smelting | 73 | 必需，所有可达熔炉输入，不限粗铁 |
| blasting | 25 | 必需，所有可达高炉输入 |
| stonecutting | 351 | 类型存在；切石机功能已排除，工作台中可达石制品仍需支持 |
| smoking | 9 | 类型存在；烟熏炉功能不因可合成而自动纳入 |
| campfire_cooking | 9 | 当前无独立主线食物加工来源；不自动加营火功能 |
| smithing_transform | 12 | 没有锻造功能/对应原料来源，不自动增加 |
| smithing_trim | 18 | 没有模板来源/锻造功能，不自动增加 |
| crafting_special_repairitem | 1 | 可能可达且重要：工具可复制到两个格中，不能因无耐久消耗就直接删掉 |
| crafting_special_bannerduplicate | 16 | 需旗帜，当前未指定羊毛来源；P4 复核前置，不以数量直接判不可达 |
| crafting_special_bookcloning | 1 | 未提供书写书来源；不新增书写系统 |
| crafting_special_firework_rocket | 1 | 无火药来源，庆典不授予火药 |
| crafting_special_firework_star | 1 | 同上 |
| crafting_special_firework_star_fade | 1 | 同上，不能因演出有颜色而授予染料 |
| crafting_special_mapextending | 1 | 缺红石等来源和地图系统 |
| crafting_special_shielddecoration | 1 | 盾牌可能可达，但旗帜来源尚无；仍需分别追踪 |
| crafting_decorated_pot | 1 | 当前没有砖/陶片来源 |
| crafting_dye | 6 | 存在 target/dye 数据结构；需染料与皮革等目标来源，不能套旧版“全部 special”假设 |
| crafting_imbue | 1 | tipped_arrow，需 arrow 与 lingering_potion，当前无来源 |
| crafting_transmute | 33 | 包含染色收纳袋等，需逐文件检查 input/material/组件；不能仅凭 type 整体过滤 |

上述“未提供来源”是基于当前四场景边界的分析，不是已运行完整闭包所得不可达证明。P4 才负责完整递归推导、变体和能力闭包。

**解析陷阱（已观察）**：PowerShell 默认 JSON 对象不支持同时含 I/i 的配方键，第一次盘点产生解析错误，结果已弃用；最终对全部文件使用区分大小写的 Hashtable 解析，零解析错误。最终 shaped=827、stonecutting=351，以最终结果为准。P4 必须保留原版 pattern/key 的大小写；不要把标签/配方字符一律转小写。材料可表现为字符串、#tag 或数组，不能硬套旧式对象 schema。

## 4. 四场景直接来源与限制

| 场景/对象 | 原版数据或静态行为 | 项目确定内容 | 尚未定案/验证 |
| --- | --- | --- | --- |
| 平原树干 | oak_planks 配方接受 #oak_logs；原木不要求镐（D/S） | 徒手取得原木 | 具体树种、斧剥皮支持、动画与热区 C/U |
| 平原草 | short_grass 掉落：剪刀分支给 short_grass；普通种子概率 0.125（D） | 草提供种子来源，切场景补货 | 不可擅自改为必掉；是否批准概率适配、剪刀掉落分支需审查 |
| 甘蔗 | sugar_from_sugar_cane 为 shapeless，单甘蔗产糖（D） | 提供甘蔗来源 | 平原水边或农场布局未定，不开放背景水/泥土 |
| 矿洞石头 | mineable/pickaxe 包含 stone；掉落与正确工具需结合（D/S） | 木镐起可取得圆石 | 击破视觉 C/U；不新增精准采集附魔 |
| 铁矿 | iron_ore 默认掉 raw_iron，精准采集分支给 ore（D） | 石镐起的合适镐才能取得铁资源 | 玩家不能因矿石画面存在就取得 iron_ore 物品；错误工具破坏后可补货 |
| 煤矿 | 矿洞来源；纳入镐类工具采集 | 木镐起的合适工具取得煤 | 具体掉落/效果仍需客户端对照，不仅检查煤可作燃料 |
| 农场预耕地 | wheat 的 loot_table 存在成熟条件（D）；阶段短时长是项目规则 | 不需要锄地，播种后短固定阶段生长 | 阶段时间、后台/离线策略与未成熟收获细节未定 |
| 牛 | AbstractCow.mobInteract 检查桶，调用 createFilledResult 得 MILK_BUCKET（S） | 桶挤奶，物品无限 | 项目保留空桶引用与手持结果如何展示待合同批准；C/U |
| 鸡旁蛋 | egg/blue_egg/brown_egg 在 #eggs（D） | 固定蛋，切场景补货，无喂鸡门槛 | 固定鸡变体与蛋 ID 待场景定稿；不用实现动物繁殖 |
| 家中桌面 | 项目叙事目标，不是原版配方类型 | 亲自放蛋糕触发庆典并同步主页 | 演出时长/重播待定 |

不杀牛鸡、不给战斗掉落；树叶、背景草方块、泥土、水只因出现不成为来源。注意剪刀针对**已经可交互的草**是原版分支风险，与把装饰叶子变成可采集来源是不同问题。

## 5. 工具与堆叠关键样本

工具依据：data/minecraft/tags/block/mineable/pickaxe.json、needs_stone_tool.json、incorrect_for_*_tool.json，及 ToolMaterial 的 incorrectBlocksForDrops 与工具组件构造（D/S）。铁矿属于 needs_stone_tool；wood/gold 的错误掉落标签包含该组，stone 的不包含。不能比较一个笼统“材质等级”数字；金镐的高速度不使其能采铁。没有来源的铜/金等工具不主动加入玩法。

| 样本 | 核实结果 | 证据 |
| --- | --- | --- |
| 默认普通项（木板、木棍等） | max_stack_size 默认 64，具体项仍可覆盖 | S：DataComponents 默认组件初始化 |
| 空桶 | 16 | S：Items.BUCKET 注册时 stacksTo(16) |
| 奶桶 | 1；crafting remainder 与使用 remainder 均指向桶 | S：Items.MILK_BUCKET 注册 |
| 木/石镐 | 工具应用 durability 设置 max_stack_size=1 | S：Item.Properties 工具/耐久路径、ToolMaterial |
| 铁胸甲 | armor 组件构造，单件装备/耐久路径；装备适用性不能只靠名字后缀 | S：Items 与 Item.Properties；完整组件导出 U |

不消耗耐久不代表应删去 MAX_DAMAGE/DAMAGE 身份组件，或把工具变为可堆叠 64。RepairItemRecipe.canCombine 静态检查同 item、各 count=1、MAX_DAMAGE/DAMAGE 组件，不以“当前一定已损坏”为简单前置（S）；无耐久规则下也要在 P4 复核该特殊配方，不能默认不可达。

本轮不是完整物品组件导出；未取得报告的物品不宣称已逐个核实上限/装备/工具能力。

## 6. 配方、燃料、加工与剩余物样本

| 路线 | 包内直接证据 D | 结论与限制 |
| --- | --- | --- |
| oak logs→4 oak planks | oak_planks.json，#oak_logs | 树种标签替代项需要保留 |
| 上下两木板→4 sticks | stick.json，pattern 两行 | 允许适用的 2×2，不能强制工作台 |
| 木/石镐 | wooden_pickaxe/stone_pickaxe，XXX / 空#空 / 空#空 | 材料是 #wooden_tool_materials / #stone_tool_materials，非单一物品白名单 |
| 桶 | bucket：#空# / 空#空，iron_ingot | 需 3 个格子，不是 3 个永久库存单位 |
| 蛋糕 | AAA / BEB / CCC；A milk_bucket，B sugar，E #eggs，C wheat | 三奶格，奶桶 count=1 各占一格；普通/蓝/棕蛋标签不应写死单个 ID |
| 原木→木炭 | charcoal：#logs_that_burn，smelting，200 | 不把高炉当成普通熔炉 |
| 粗铁→铁锭 | smelting 与 blasting 的两个 raw_iron 配方均 cookingtime=200 | 实际速度依赖燃料组件上下文，不对原始字段再减半 |
| 铁工具/铁甲→铁粒 | iron_nugget_from_smelting / blasting 的 ingredient 数组 | 只纳入实际可达装备；数组中还有 spear、horse/nautilus armor 等，无来源者不自动纳入 |
| 9 铁粒→铁锭 | iron_ingot_from_nuggets：3×3 | 循环转换并非初始铁来源 |
| 圆石→石头→平滑石 | stone / smooth_stone，分别 200 | 高炉合成需平滑石，不能循环凭空获得设备 |
| 高炉 | 五铁锭 + 熔炉 + 三平滑石，shaped | 可制造铁锭，按用户规则必须支持功能 |
| 漏斗 | 五铁锭 + 箱子，shaped | 可制作；是否放置/功能仍待 A/B 决策，箱子可作材料不等于可放置 |
| 铁矛 | iron_spear：斜三格，铁工具材料+木棍 | 是当前版本可能可达的副产物例子；无战斗不等于禁用合成 |

### 6.1 燃料与速度（D/S）

Items 注册的 cookingFuel 引用 ContextIntProviders；Item.Properties.cookingFuel 同时使用 cooking/speed_default。包内条件 minecraft:block/fast_cooking 选择 normal/fast：速度分别 1/2，燃烧时长除数分别 1/2。AbstractFurnaceBlockEntity.getTotalCookTime 为正速度时取 ceil(recipe cookingTime / speedMultiplier)。这是静态推导，客户端实测 tick 时序仍为 U。

| 样本 | 普通燃烧时长 tick | fast cooking 燃烧时长 tick | 静态路径 |
| --- | ---: | ---: | --- |
| 木棍 | 100 | 50 | COOKING_TIME_DRY_PLANTS |
| 木镐等样本木工具 | 200 | 100 | COOKING_TIME_WOOD_ITEMS_LARGE |
| 煤/木炭 | 1600 | 800 | COOKING_TIME_COAL |
| 木块类数值提供器 | 300 | 150 | time_wood_blocks；每种方块是否实际引用需逐注册验证 |

raw_iron 的 200 基础时间以默认正常/快速参数推导为 200/100 tick。高炉速度两倍时燃烧周期也按数据缩短，不能把相同燃料当成多烧两倍产物。改变燃料/输入、余热、冷却、阻塞与整 tick 边界仍需客户端验证。

原版加工会消费燃料和输入；本项目“不消费”需要明确适配。单根木棍不足一次普通 200 tick 加工，原版有限燃料不足时会发生等待/进度变化；本项目若无限续燃则是候选适配，不是本轮观察到的原版事实。

### 6.2 剩余物与合法槽位（S）

CraftingRecipe.defaultCraftingReminder 读取物品的 crafting remainder，ResultSlot.onTake 按占用格消费再处理剩余物。因此蛋糕 JSON 本身没有写三空桶，仍能按物品定义留下三空桶；不能仅解析 result 就声称余留物完成。

**重要修正**：AbstractFurnaceMenu 的输入是普通 Slot，Slot.mayPlace 默认 true；AbstractFurnaceBlockEntity.canPlaceItem(0, ...) 也返回 true。手动输入槽可容纳不能加工的物品；quickMoveStack 则先 canSmelt 再 isFuel。高炉放入原木可以停在那里，但不会以 smelting 配方烧炭。需要区分槽位接受、Shift 路由、配方匹配、实际加工四个层次。

原版自动化端口：上方槽 [0]，侧面 [1]，下方 [2,1]；下方抽燃料槽受 #furnace_fuel_bottom_takeable（water_bucket、bucket）约束。漏斗不能凭“这个物品能烧”就把任意面都当输入/燃料面；顶部槽允许塞入不可加工物也可能堵塞。这些事实在 [放置成本](placement-cost.md)计入 B，而不按直觉简化。

## 7. 配方书发现样本

data/minecraft/advancement/recipes/food/cake.json 的奖励是 cake 配方，requirements 中 has_the_recipe 与 has_egg 为 OR。has_egg 匹配 #eggs 的 inventory_changed（D）。所以“等全部蛋糕材料齐了才在书里出现”不是该原版规则。

项目没有普通有限背包；把永久解锁映射为 inventory_changed，还是按全部材料解锁发现，需要用户决策。一个样本不能代替全部配方发现触发清单，原版图鉴显示/客户端刷新仍为 U。

## 8. 本轮自动核查与未验证项

已通过：四项数据断言 DATA-CAKE、DATA-COOKTIME、DATA-RECIPES-PARSED、DATA-CLIENT-SERVER，见证据锁文件。仅是结构/哈希检查，不是配方引擎、GUI 或游戏测试。

未做：完整物品/配方闭包、全部默认组件运行报告、实际合成/熔炼操作、原版与浏览器对照、音画性能、世界/客户端启动。需要运行数据生成器、配置客户端或安装反编译器时，后续应先记录工具、输入和原因并取得所需授权；本轮未为这些步骤额外安装工具。
