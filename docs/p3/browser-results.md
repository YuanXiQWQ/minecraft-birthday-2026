# P3 浏览器验证记录

日期：2026-10-21；Windows 本机 ChatGPT 内嵌 Chromium 浏览器；实际 UA、DPR 与视口见 [completion-final.json](evidence/completion-final.json) 的 environment。使用 CUA 真实页面/按钮/导航，不通过 evaluate 修改应用状态。Node 测试和 HTTP 检查另计。未运行 Java 客户端、没有人工试听声明。

| 实际操作                                                | 结果与证据                                                                                                                                                                                                                                                      |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 普通 dev 4183 直开主页                                  | 原版字体、按钮与真实三维空桌正常；无外部缓存或实验菜单                                                                                                                                                                                                          |
| 独立测试源 4184，通过命令夹具取得并在家放下蛋糕         | 另一正式主页自动出现真实模型；刷新后保留；[最终截图](evidence/home-cake-1440-final.jpg)、[命令记录](evidence/completion-final.json)                                                                                                                             |
| 点击邀请链接进入 `/game/`                               | 独立文档、第一人称近眼高 3D、无准星；[游戏画面](evidence/game-carrier-1440.jpg)，不是正式农场                                                                                                                                                                   |
| 设置修改音量到 1、静音；二次确认重置                    | 空桌/空解锁恢复，语言 en、volume1、mutedtrue 保留；[记录](evidence/reset-retains-settings.json)、[确认画面](evidence/settings-reset-confirmation.jpg)                                                                                                           |
| 两真实标签同源并行操作，一方持原生锁 1.5 秒时另一方提交 | 两次解锁均保留，revision2；[时间与最终值](evidence/native-cross-tab-transactions.json)；不是单页 Promise 并行冒充跨页                                                                                                                                           |
| 真实锁内排队：先 reset 后旧代次写                       | 旧写明确 `Error: stale-session`，空进度保持；[严格断言记录](evidence/native-stale-reset-capabilities.json)                                                                                                                                                      |
| 写入测试 future99，另一主页接 storage                   | 显示较新版本错误、禁写、原 `{format:99}` 原样保留；[记录](evidence/future-version.json)；随后通过 fixture 恢复检查点，正常 ready                                                                                                                                |
| 主页→游戏→浏览器 back/forward                           | 正常读到共享状态；本次未观察到 BFCache persisted=true，不作为真正 BFCache 命中证据                                                                                                                                                                              |
| 1440×900 和 1280×720 伪本地化                           | 长词逐字符折行、无横向溢出；设置面板内部纵向滚动。1440 文档 client/scroll1425；1280 为1265（有15px滚动条）；设置 client/scroll627。原生 select 保持选择可用，长选项折叠显示会截断；[长文](evidence/long-text-1440.jpg)、[设置](evidence/long-settings-1280.jpg) |
| 最终根构建 4185 与 Pages 子路径 4186                    | 两入口、原版资源、字体、按钮与3D canvas正常；[根主页](evidence/build-home-empty-1440.jpg)、[子路径主页](evidence/pages-home-empty-1280.jpg)、[子路径游戏](evidence/pages-game-1280.jpg)。最终检查页面 error/warn 空                                             |

设置是屏幕二维模态层，打开时显式关闭 SceneView 输入并清掉待处理 pointer；关闭恢复。已有交互观察没有背景误点击；完整背包拖动/Esc/失焦矩阵仍留在 P5/P6/P2 人工清单，不因设置对话框成功而宣称完成。

测试早期出现按钮前景空白、inline 标签无宽度和 ResizeObserver loop 警告；分别处理为前景层、块级文本和只在宽度变化后合并至 RAF 重画。最终长文/设置及构建页面检查没有新 error/warn。原始失败信息与真实早期图不用于宣称最终通过，也未改写 P2 证据。

Vite 配置重载时曾短暂断开4183/4184，既有内嵌标签停在 `ERR_CONNECTION_REFUSED` 内部错误页，工具拒绝读取该内部协议。随后服务器端口监听/HTTP均正常，用户报告 Edge可开；依照工具排障指引新建同一内嵌浏览器标签后成功。没有绕过安全警告或切换底层自动化机制。原因只确认到“旧错误页不能继续读取、新标签正常”，不归因于应用渲染或浏览器网络根因。

剩余未验证：真正 BFCache 命中、完整浏览器关闭重开、Edge/Firefox/WebKit 自动化、真实禁用存储/隐私模式、低端设备、非 ASCII 字体提供者、D24手势。P2 原人工清单继续保留，其声音/后台/实体拖动项不被 P3 测试替代。
