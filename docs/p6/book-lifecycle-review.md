# P6 配方书生命周期定向修复

日期：2026-10-21（用户时区）。基于f3c5c20a722a19cdd3d068100763deb20a4b3f71，仅修复显示生命周期。D04、D05完整合同/A、D06、D07、工作站D08、D09不变；信封仍p6-book-1，无清档/迁移变更、原版资源变更或P7实现。

## 正式复现与根因

保留修复前的真实浏览器双标签记录和正式类失败测试，见[evidence/book-lifecycle/](evidence/book-lifecycle/)。新测试调用正式GameInventory.sync、RecipeBookView.choose/drawGhost及真实SaveSession，第二会话共享同一存储和排他锁；旧实现失败于book.ghost仍为torch而非null。没有复制生产方法到测试副本。

浏览器使用两个同源4184/ __verify__/input.html页面和独立控制页：通过正式命令取得石镐触发原版火把发现，未取得煤/木棍，个人四格为空，点击火把产生幽灵。第二页通过正式Settings→Reset progress…→Yes, reset progress重置；第一页全程不关闭、不刷新。

| 同一序列          | 修复前重置后                  | 修复后重置后                              |
|-------------------|-------------------------------|-------------------------------------------|
| generation        | 已切换                        | 已切换                                    |
| 真实四格/结果     | 四空格/null                   | 四空格/null                               |
| unlocked/known    | 空/仅工作台                   | 空/仅工作台                               |
| 个人GUI           | 保持打开                      | 保持打开                                  |
| 旧火把幽灵        | 仍绘制，data-book.ghost=torch | null，原版背景/槽位重绘，无旧幽灵         |
| 旧展开层/查询     | 缺少代次围栏                  | popup=null、查询/页/悬浮等清理            |
| 本地首次发现Toast | 不绑定代次                    | 立即隐藏、清像素/可访问状态、取消旧定时器 |

旧实现只比较菜单ID与真实输入签名。重置前后四空格相同；书收起后render提前返回，drawGhost仍能按旧Recipe对象绘制。永久发现和真实物品数据本身没有损坏。

## 局部实现

- GameInventory.sync在代次变化时调用book.resetTransient (true)，与原个人载体/领取票据围栏一起执行；clearPersonal在关闭、设备切换和退出时调用统一菜单显示清理。
- RecipeBookView.scope绑定generation、PersonalCursor.epoch、场景、个人/设备ID及能力/维度；故同ID或同输入无法跨代次复用。仅收起书不改变scope，加工计时和设置也不进入scope。
- resetTransient统一清ghost/输入签名、popup、query/search、page/category/hover、groups/控件签名及书画布，并立即发布可检查状态。真实主容器仍由GameInventory.draw先清背景再画有效内容，不通过修改真实槽位解决显示问题。
- render、paint、drawGhost先校验scope；幽灵必须仍已发现、适用于当前菜单且真实输入签名相同。关闭书时仍可绘制同生命周期的合法幽灵；不清永久发现，不把幽灵写入真实输入、结果或存档。
- 分离菜单显示epoch与Toast票据：旧控件点击/展开、旧书设置失败回调被围栏拒绝；旧Toast超时不能隐藏新Toast。重置/销毁清Toast，普通同代次菜单关闭不打断已有全局通知。选择与通知检查当前发现和代次。既有填充/领取队列及迟到回执围栏保留。
- dispose停止定时器、监听器并使后续渲染/选择/通知失效。修改仅在两个正式UI文件；领域、配方、加工、传输、存档编解码和既定合同不改。

## 自动化验证

最终类型检查通过；正式测试246/246（原237 + 9项生命周期序列）。book-queue共19项，新增实际接线覆盖：

1. 两个SaveSession跨代次重置，重置前后输入签名完全相同，旧配方不再已发现，幽灵/展开/搜索/Toast/画面调用清除。
2. 同代次真实processing-tick及设置提交不误清；真实输入取放提交才清幽灵，显示操作不取得火把或修改持久字节。
3. 窄屏选择缺料配方→正式book-settings收起→容器仍显示幽灵，再展开仍有效。
4. 实际关闭/重开、设备切换、拆除、场景切换及页面销毁；其他实例持久内容保留。
5. 分别与已提交但延迟回执的填充、结果领取交错，另一会话正式重置后不复活个人状态、幽灵或展开层，随后仍可正常操作。
6. 旧设置失败回调、旧通知超时、重新发现同一配方后的旧控件回调不能修改新生命周期。

节点测试的DOM/画布资产端口是有界替身，但调用正式类的方法体与SaveSession；不把这些视作真实像素或实体输入验收。原真实槽/匹配结果不被幽灵覆盖的绘制断言保留。原24项领取时序、11项炉队列和21项设置回归未删除、未改断言。

P4核验仍113物品/112可达配方；P2关键回归48/48；根路径和Pages普通构建、两项HTTP逐字节资源请求/内部资料404均通过。无新资源、无新依赖，545个运行资源仍正常随Git/构建。日志formal.log、p4.log、p2.log、build-root.log、build-pages.log、http.log保留；before-fix-formal.log保留初始失败。

## 真实浏览器证据

IAB Chromium155 / Windows；桌面1280×720、DPR1.25，窄屏375×812，具体值在JSON。点击、右键展开、搜索及正式设置确认通过可信浏览器输入完成，记录isTrusted；没有浏览器evaluate写状态、合成DOM事件或编辑截图。控制页只用正式命令设置隔离环境取得事实，不进普通构建；被测重置均由另一正式应用设置页完成。

- before-fix-before-reset / before-fix-after-reset：真实缺陷画面及新代次旧幽灵。
- fixed-before-reset / fixed-after-reset：同一序列；第一页不关闭/刷新，ghost/popup均null，画面无残留。
- recovered-torch-acquisition：重置后重新通过正式命令取得石镐、煤、木棍，正常发现火把；点击书填充后可信点击领取，光标4火把、永久取得火把，证明未损坏D06/填充/D05。
- toast-before-reset / toast-after-reset：本地真实领取木板首次发现11条配方的可见Toast；5秒到期前第二页重置，Toast和其可检查信息立即清除。
- narrow-375-collapsed / narrow-375-after-reset：实际375×812中选择缺料火把，书自动收起、幽灵仍在容器；另一标签重置后直接清除。
- browser-comparison.json：从原始页面状态汇总并断言代次、真实四格、发现、取得、GUI、Toast及恢复结果；记录PNG哈希。desktop-ghost-book-open记录一次未生效的缓存视口覆盖，实际1280×720，未当成窄屏通过证据；重绑工具能力后才取得375×812记录。

未声称用户物理右/中键拖动、OS真实失焦/最小化、其他浏览器或Java26.3客户端对照通过。这些仍保留原人工清单。本轮没有新增相关业务或研究轮次。

## 复现与阶段判断

npm --prefix app run dev:verify；打开两个同源/ __verify__/input.html及控制页/ __verify__/index.html。先在第二应用页正式重置隔离进度；控制页Fixture: discover torch只取得石镐；第一页个人Crafting打开配方书点击火把。再在第二应用页正式重置，不关闭/刷新第一页，观察幽灵与展开消失。控制页Fixture: torch materials只取得煤/木棍，重新发现后可实际填充/领取。测试按钮不在普通运行路径。

技术建议：本次已明确复现的P6显示缺陷已修复且通过定向与整体回归，P6代码具备提交放行审查条件；原人工缺口不被冒称完成。用户仍需独立审查并授权下一阶段；不自动进入P7，完整漏斗邻接/网络、四场景与结局仍未实施。见[更新后的完成矩阵](p6-final-matrix.md)。
