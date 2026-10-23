# 持续挖掘声音

基线为`6f9ce8143e99f708e42273c511c9b463d272abc6`，保留洞穴与快捷栏优先入包。此项只补持续挖掘声音及其直接依赖，不改变挖掘数量、工具资格、时长、活动模拟或存档版本。

## 正式路径缺口与原版依据

`WorldUse.selectMining/advanceMining`只更新裂纹；声音仅由破坏成功后的`run()`触发。因此原木未破坏时一直无声。工作台和漏斗的完成声还统一使用了石质事件。

只读核对锁定官方26.3客户端（SHA1 `e877b6a07acd633fb3bb475002175cec036e7b87`），未启动客户端。具体类字节哈希及分支见[native-evidence.json](native-evidence.json)。

- `MultiPlayerGameMode.lambda$startDestroyBlock$0`为渐进挖掘调用`addBreakingBlockEffects(...,true)`，即起始命中声。
- `ServerPlayerGameMode.tick`按`(gameTicks-destroyProgressStart)%4`选择2020事件，否则2019；`LevelEventHandler`只为2020传入声音标记。
- `ClientLevel.playBreakingSound`使用当前`SoundType.getHitSound()`，音源`BLOCKS`，音量`(volume+1)/8`、音高`pitch*.5`；方块坐标构造器将声源放在中心。
- 橡木/工作台为WOOD；石头、煤矿、铁矿、炉/高炉为默认STONE；漏斗为METAL（基础pitch1.5）；草和甘蔗为GRASS。小麦的CROP命中事件复用GRASS_HIT。瞬间破坏的草/作物不创建持续敲击循环，蛋和牛不伪装成方块。

原版官方资产索引和`sounds.json`提供命中事件及每类6个原始样本；金属命中复用石质样本、采用其材质音高，不自行制造金属录音。新增18个OGG进入Git、world清单和普通构建，大小/SHA256及导出脚本哈希同步核验；完整资源集合841→859。导出复现：`node --experimental-transform-types app/tools/world-assets.ts --client <verified26.3.jar>`。

## 正式接线

`domain/block-sounds.ts`集中保存已核对的有限方块材质映射；`WorldUse`在命中起始及每200ms（20Hz的4tick）触发，使用逻辑方格中心。`app.ts`把原版参数传入现有`WorldAudio`，沿用方块分类/主音量与静音。破坏完成声保持独立、提交成功后播放；工作台/漏斗完成声分别使用WOOD/METAL。

每份未完成音频解码持有当前挖掘对象、手势epoch、会话serial及代次/场景有效性谓词。松键、换目标、打开GUI、隐藏、重置、切场景、卸载后不能迟到开始。已播放的一次命中声可自然结束。没有新增计时器/音频上下文/后台模拟，也没有聊天成功通知。

依据用户自主执行授权作出的工程决定：主线程迟滞后只调度当前一次听觉反馈，恢复到原4tick节拍，不把已经错过的敲击声挤在同一帧播放；游戏结算时间和数量不丢弃。声音不写档。

可变JSON通过生产`fetchAsset()`重新校验，防止新清单与HTTP强缓存中的旧`world-sounds.json`混用；原版像素/OGG继续正常缓存，哈希检查不放宽。不要求用户清缓存/存档。

## 浏览器实际证据

本地普通静态构建，隔离IAB来源，1280×720。使用原生坐标点击与定时长按；没有授物、unlock命令或直接调用领域方法。首次Pointer Lock申请在工具环境失败，随后使用正式可见指针回退；不计为真实Pointer Lock通过。

- [原木状态与音频调度](evidence/ordinary-wood.json)：1200ms按住期间，实际`node:oak_log:2`未被移除，已播放多个`block.wood.hit`，原版`step/wood*.ogg`、pitch0.5、源volume0.25。重新长按3400ms后移除该节点，原木进入快捷栏，单独播放`dig/wood2.ogg`的`block.wood.break`、pitch1。
- [石块状态与音频调度](evidence/ordinary-stone.json)：在正式洞穴按住实际`node:stone:0`约1200ms，记录7次石质命中声；仍未破坏、未取得，break次数0。当前手持原木，不授予正确工具；敲击反馈与掉落资格分开。
- 实际画面：[原木完成后](evidence/ordinary-wood.jpg)、[洞穴石块](evidence/ordinary-stone.jpg)。画面证明操作上下文，声音结论来自真实WebAudio调度记录；未进行人工试听或宣称Java客户端动态体验等价。

上述构建标识是基线`6f9ce8143e99`加当前工作源码；最终提交由CI重新构建并用实际SHA标识，不混称为最终SHA页面重测。

隔离强缓存夹具`app/tests/mining-audio-cache-server.mjs`仅服务正式dist/dist-pages：先把基线旧声音JSON缓存一年（命中事件不存在），点击链接进入当前普通游戏，不清站点数据。真实HTTP请求见[cache-requests.jsonl](evidence/cache-requests.jsonl)，更新请求重新校验并返回新3648字节文档；root/Pages结果见对应`old-cache-*.json`。root额外用原生长按成功调度新增木质命中声。

## 自动化与边界

- 正式测试626/626：新增18项，覆盖原版材质/节拍/位置，持续命中与完成声分离，换目标，松键/GUI/后台/重置/切场景/卸载，迟到解码，真实SaveSession内四种设备拆除，以及新资源和旧缓存更新。
- 保留全部既有领取、数量、关台返还、炉队列、设置草稿、幽灵生命周期和迁移断言。仅更新原有设备测试中错误的石质完成声预期，以及两处资源总数（增加18个样本）。
- 类型检查通过；P2 48/48；P4 113物品/112可达配方/2042已分类/18步蛋糕链保持。
- root/Pages构建和产物审核通过，HTTP两项通过，逐资源字节/MIME/内部资料隔离保持。[测试日志](evidence/tests.log)、[P4](evidence/p4.log)、[P2](evidence/p2.log)、[HTTP](evidence/http.log)。

实体电脑、OS后台、跨引擎及人工试听仍待用户后续验收；本次没有操作实体桌面、启动Java游戏或声称性能历史峰值已解决。普通新提交与既有main→Pages流程，交付时分别核对远端SHA、CI、部署及线上构建标识。
