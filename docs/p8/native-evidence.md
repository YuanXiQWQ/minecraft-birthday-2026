# 原版证据与移植边界

Java26.3官方client.jar SHA1=e877b6a07acd633fb3bb475002175cec036e7b87，41,483,720 bytes。只读ZIP/已有javap检查，没有安装/启动Java客户端。原client/JDK输出留在临时输入目录，未放Git/build；类SHA256索引在interaction-manifest，不分发class文件。

- InventoryScreen实际26.3方法先计算传入人物矩形两轴中点，以中点减鼠标、除40后atan。旋转参数20度，Z翻转与X旋转组合，renderState.bodyRot=180+20×水平atan、yRot=20×水平atan、xRot=-20×垂直atan。这里使用的是26.3 renderState，不能照搬旧版玩家实体yBodyRot写回模式。Three坐标转换的父tilt/相对head必须一起换号，否则纵向相消。人物矩形26/8到75/78、scale30，静态证据来自同类。当前默认身体中心/四向/四角实际画面已记录，尚未Java客户端并排逐帧对照。
- Blocks注册的本项目硬度事实：log2、stone1.5、coal/iron ore3、crafting_table2.5、furnace/blast3.5、hopper3、grass/cane/wheat0。BlockBehaviour破坏进度按工具合适掉落分母30，否则100；Player及原版tool组件/标签给正确工具速度；静止地面、无附魔/药水的当前范围计算ceil (hardness×denominator/speed) ticks，掉落资格独立。P4的requiresCorrectTool/incorrect tags仍是掉落依据，不按名称后缀代替等级。
- UI页签、destroy_stage0—9、toast是原版精灵；zh_CN来自官方资产索引34对象SHA1=561ed7800004b882b8eeb032ffbe2bf03895bb44。16素材/1清单新增均有源SHA256，搜索过滤113名的投影另校验。没有自制像素纹理替代原版。
- 烟花模拟、精灵帧、五形状路径、阻尼/寿命、Trail/Twinkle与声音事件参数复用P2已核实内核，P2静态/实际原始报告不变；正式模块不包含实验入口/控制工具。固定项目种子只保证浏览器测试重现，不宣称与Java同种子得到逐粒子相同随机流。
- 部分工程适配明确：合成保留输入与A返还来自既定D05；炉消耗已按最新用户决定覆盖旧引用续燃。碎屑12片/750ms是控制范围内的真实纹理三维反馈，未移植完整TerrainParticle/世界物理。有限场景结构/边界、相机保护、短击/拖动阈值与具体20秒编排属自主工程决定。

静态字节/数值证据、浏览器可信输入及人工视听证据各自独立，不将来源哈希/测试数量当作原版视觉完全一致的证明。
