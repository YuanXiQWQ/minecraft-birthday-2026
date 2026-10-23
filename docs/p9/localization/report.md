# 简体中文本地化

后续用户纠正：列表样式、括注位置与中文字体参数以[语言样式与字形纠正](../language-style/report.md)为准，下文的低分辨率过滤方案仅保留为历史实现记录。

用户授权：实现简体中文本地化。入口为主页设置或游戏内 Esc → Options… → Language… → 简体中文（中国大陆）。英语与简体中文可即时切换并保存，刷新和其他标签页沿用；默认英语，未知语言与缺失键回退英语。语言选择本身不请求定位。

## 实现

- `app/web/src/i18n/locales/zh-CN.json` 与英语255条键、全部占位参数一一对应。主页故事保留赛博蛋糕未完成、材料备齐但未加工、邀请亲手制作的语义，姓名保留配置值。
- 113个可达物品使用已审计的原版中文名；物品栏、装备、副手、Tooltip、配方书及容量失败反馈跟随已提交语言。中英名称和原版ID均可搜索。
- 菜单、声音类别、配方Toast及命令使用仓库锁定26.3的 `assets/minecraft/lang/zh_cn.json`。`app/tools/localization-assets.ts` 校验原始语言SHA-1并转换Java的顺序/位置参数与字面百分号；`--check` 验证导出一致性。既有进度标题、说明和公告继续使用原版中文，不修改判定与公告时机。
- 全部翻译同步加载到快照投影，再刷新物品与设置，避免活动时钟快照反复触发异步语言读取。生日已完成事实只投影，不因切换、刷新或重入重播。
- Unicode沿用已入库官方Unihex位图。文字、滑条与Tooltip保留16像素源字形所需的画布分辨率；低分辨率目标使用过滤保留细笔画，英语ASCII绘制保持现有路径。加载画面按真实字宽换行，启动清单增加已有Unicode字体输入，导出脚本同步更新，保持版本化清单请求与字节/SHA-256校验。

上述默认语言、同步字典、原生语言名与双语搜索，是依据用户自主执行授权作出的工程决定；没有新增玩法、改库存数量或更换存档版本。

## 验证

- 正式测试697项通过，包含新增的翻译键/插值完整性、Java位置参数与百分号、中英文物品搜索、所有中文字符的原版字形覆盖、加载字体哈希与Unicode细笔画绘制。
- `npm run data:verify` 通过；保留P2技术测试48项通过。
- `npm run build`、`npm run build:pages` 均通过TypeScript/构建与正式产物审计；`npm run test:built` 两条HTTP路径及完整原版资源字节校验通过。
- `app/tests/localization-production.mjs` 在隔离的普通Chromium中使用真实页面输入，覆盖root与Pages子路径：语言搜索与选中、即时中文主页、刷新恢复、跨标签双向同步、真实有限库存与已放蛋糕保留、中文物品与配方搜索、命令聊天、声音设置及390×844窄屏语言/重置确认。重置后保留中文并关闭设置。
- 旧缓存回归使用提交前的真实启动清单样本 `app/tests/fixtures/startup-manifest-before-localization.json`。先缓存旧清单，再在同一来源、同一构建参数下加载新游戏，检查网络重新校验、Unicode字体与世界/HUD就绪；未清缓存或存档。网络与浏览器结果见[evidence/browser-results.json](evidence/browser-results.json)。
- 另设隔离写入失败：尝试切中文失败后，保留英语存档、英语显示与英语选中行，显示真实保存失败反馈。

截图均来自实际正式构建，未编辑。已检查[主页](evidence/root-home.png)、[语言](evidence/root-languages.png)、[物品](evidence/root-items.png)、[配方](evidence/root-recipes.png)、[声音](evidence/root-sound.png)与[窄屏确认](evidence/pages-reset-narrow.png)。浏览器自动化不代表用户实体电脑、中文输入法组合过程或人工试听已验；本次没有操作实体桌面或启动Java客户端。

## 发布

沿用main普通新提交与fast-forward推送、既有GitHub Pages工作流。CI、部署与线上实际build在推送后分别核对；最终结果在交付回复中报告。
