# 自由移动后的天气、采集与反馈

## 用户要求

自由移动后，降水不能留在初始视角的一片区域；补原版行走视角晃动、脚步声与跑跳；可达区域内的草丛不能只有原来的初始采集点可破坏；放置火把应照亮环境。保留其它场景、并行界面工作、已有采集事实、有限库存与存档事务。

两处以原版机制为准：Java 26.3 普通原地跳跃没有单独的起跳音效；脚步依实际移动路程触发，满足摔落条件时才有落地声音。原版手持火把不提供动态光，已放置的普通火把提供 14 级方块光。

## 同版本依据

只读分析[锁定官方客户端](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar)，未启动 Java 游戏或操控实体桌面。类、原版着色器和掉落表的 SHA-256 见 [来源清单](evidence/native-sources.json)，客户端及反编译内容不进入网站或仓库。

- `WeatherEffectRenderer`、`Options`：默认天气半径 10，以当前玩家方格为中心；高度图裁掉遮蔽部分；原版雨雪纹理、随机列速度、UV 端点与距离透明度。光照在每列 `max(eyeY, heightmapY)` 采样。
- `LocalPlayer`、`ClientAvatarState`、`AbstractClientPlayer`、`GameRenderer`：实际水平移动距离 ×0.6 累计步行相位；bob 朝目标值按 0.4 收敛；保留原版平移、Z/X 旋转次序与部分 tick 插值。投影晃动不改变准星射线的实际朝向、碰撞体和保存角度，世界、天空和右手同步。
- `LocalPlayer`、`LivingEntity`：疾跑保持状态、7 tick 双击前进窗口、起跳速度 0.42、疾跑前向冲量 0.2。释放 Ctrl 后继续前进仍可疾跑；松开前进、潜行和水平碰撞停止疾跑。
- `Entity`、`SoundType`：移动距离 ×0.6，超过下一整步阈值播放脚下材质的 step；音量 ×0.15、原版音高。玩家脚步归 Players 类别，潜行静音。有效性检查阻止失焦、GUI、切场景后迟到播放。
- `LightmapRenderStateExtractor`、`EnvironmentAttributes`、`lightmap.fsh`：默认方块光颜色、环境光 `#0a0a0a`、亮度变换、默认 gamma 0.5 和 20 Hz 方块光轻微闪烁。火把 14、灯笼/点燃营火 15，沿六个邻格逐级衰减，完整不透明方块阻挡。
- `tall_grass.json`：高草两半共用一份采集事实；剪刀掉落 2 个 short_grass，否则采用原版 1/8 种子概率。不把两半分别计算掉落。

## 实现范围

降雨列随着当前 X/Y/Z 方格更新；未改变地形时复用高度图，避免走动重复遍历整个草原。放置建筑进入高度图，雨雪与世界共享环境光及方块光。保留已验证的原版向下纹理运动。

可达草原里原有散布短草和高草成为固定坐标、稳定 ID 的自然来源，沿用原有限掉落与采集存档。保留原 33 个来源 ID、顺序和坐标；新来源只追加。矿洞原来的逐层石壁与矿脉采集、农场来源保持。景观边界外的装饰、结构地基和此前未开放收集的装饰种类仍不是采集来源。

方块光使用覆盖有限活动区及建筑高度的体素场，放置、破坏、火把支撑移除、切场景和刷新均重新计算。光照通过世界专用着色器应用，不写共享贴图或 GUI 材质，不用全屏提亮冒充火把。有限体素范围与当前场景结构适配属于依据用户自主执行授权作出的工程决定；不声称已经移植完整 Minecraft 区块光引擎、所有半透明材料的遮蔽或原版 AO。

新增砂砾/泥土脚步所需官方音频进入普通 controls 清单；导出脚本、原资源索引、SHA-256 与长度同步更新。清单继续带构建版本且 no-cache，派生声音 JSON 重新校验，不要求清缓存或清存档。

## 验证

可复现脚本：`app/tests/free-movement-followup.test.ts`、`app/tests/free-movement-browser.mjs`。浏览器脚本使用普通 root/Pages 构建、隔离存档和真实 Chromium 鼠标/键盘事件，HTTP 缓存先实际命中历史 controls 清单与声音 JSON，再正常加载更新。

验证结果和未经编辑的运行截图见 [浏览器记录](evidence/browser-results.json)。浏览器音频调度不等于人工试听；用户实体鼠标、键盘组合、不同浏览器/OS 的检查没有冒充已完成。

- 当前共享工作区全量规则回归 730/730；最终天气/移动/采集定向回归通过。并行文字清晰度工作仍单独保留，发布的独立提交另由 CI 从干净检出验证。
- TypeScript、原版数据与导出哈希校验通过；普通 root/Pages 构建和审计、逐资源 HTTP 字节检查 2/2 通过。
- root/Pages 均实际命中旧 controls 清单和旧声音 JSON 的磁盘缓存后升级成功；已有采集事实保留，世界和 HUD 首帧就绪，无资源或着色器错误。
- 原生键盘 Ctrl+W、释放 Ctrl 后 W+Space：起跳超过 0.5 格并继续前进，雨幕中心同步玩家 X/Y/Z；草地和农田砂砾脚步均实际解码并调度于 Players 类别。
- 火把 4→3→4：右键放置后周围照亮，普通刷新恢复方块与 14 级光，左键拆除后发光源清空。手持时光源为 0。
- 距离原始采集点较远的短草与高草使用实际中心射线采集，剪刀分别取得 1/2 个 short_grass；刷新后稳定来源仍标记为已采集。
- 截图：[移动后的雨幕](evidence/root-rain-after-moving.png)、[跑跳中的雨幕](evidence/root-sprint-jump-rain.png)、[夜间放置火把](evidence/root-placed-torch-night.png)、[拆除后的同一位置](evidence/root-torch-removed.png)、[高草采集前](evidence/tall-before-harvest.png)、[高草采集后](evidence/tall-after-harvest.png)、[矿洞照明](evidence/cave-torch-light.png)。本地构建基线标记为 `8f7db83341e4`，包含本次待提交实现，不冒充已发布版本。
