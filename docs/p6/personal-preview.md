# 个人2×2只读配方预览增量

日期：2026-10-21。基线`e424b5d`。本项按转交的具体预览任务执行：复用P5四格和P4匹配器，不启动完整工作台/炉/配方书业务，不决定D05/D06/D08，不部署。P5历史报告及原始证据保持原样。

## 实现

- `ui/crafting-preview.ts`调用现有`findCrafting(grid,2,rules)`，只返回recipe/result显示事实；不携带remainders、领取或持久命令。空/不匹配清空；非法维度或匹配器拒绝的能力显示明确unavailable，不用占位产物冒充匹配。
- `GameInventory.refreshPreview()`按四格JSON签名缓存只读投影；取放、输入切换、失败回滚、关闭及重置后依当前四格更新。结果原版槽位置153,27，复用已有原版图标、数量字体和Tooltip。没有新资源、新依赖或配方副本。
- 结果槽为`preview`显示种类， **没有SlotRef**，pointer输入和语义activation均拒绝；数字/F/Q没有有限槽目标，中键和Shift不能复制/领取。无论输出当前是否已永久解锁，都只能预览；无限目录仍按原解锁门禁获取。
- 预览不进入InventoryState/PlayerLayout或localStorage。D07既有epoch保护四格及光标；关闭后预览随清空的四格消失，不改变稳定布局。D04、存档格式、配方规则、三维相机及主页未改。
- 英文状态、数量标签和提示均走外部本地化。匹配器不支持某输入时，清空结果并显示本地化错误提示，原始诊断码仅放在DOM数据中供验证。角色预览、非默认复杂组件/损伤条等视觉边界沿用P5，不扩展为完整Java物品渲染。

## 检查与证据

| 检查                           | 结果                                                                                                                                                                                                                                       |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 类型检查                       | 通过，[check.txt](evidence/personal-preview/check.txt)                                                                                                                                                                                     |
| 正式单元/规则/GUI方法/存档回归 | **91通过，0失败/跳过**，[unit.txt](evidence/personal-preview/unit.txt)；新增7项使用实际P4 runtime规则，覆盖四个偏移、剪刀镜像、四次重复材料、2×2不能容纳三格宽配方、结果切换/清空、非支持输入、激活门禁、实际close/sync清理及存档/事件不变 |
| P4数据                         | 113物品/112可达配方/2042分类/18步链及哈希通过，[data.txt](evidence/personal-preview/data.txt)；匹配器与P4数据未改                                                                                                                          |
| P2回归                         | **48通过**，[p2.txt](evidence/personal-preview/p2.txt)                                                                                                                                                                                     |
| 根/Pages普通构建及审计         | 通过，[根日志](evidence/personal-preview/build-root.txt)、[子路径日志](evidence/personal-preview/build-pages.txt)                                                                                                                          |
| 根/Pages实际HTTP               | **2通过**，[built-http.txt](evidence/personal-preview/built-http.txt)；原版478资源/清单正常包含，内部资料、测试入口及完整客户端不进入产物                                                                                                  |

真实浏览器为Windows Chromium155、1280×720、观察DPR1.25、GUI3×。不代表跨引擎、实体拖动或Java客户端验收。

- [readonly-and-save.json](evidence/personal-preview/readonly-and-save.json)：测试来源只解锁原木；放入一原木显示原版木板×4，木板目录仍锁定。对结果槽执行可信左/右/中键、Shift单击、数字1、F、Q、Ctrl+Q后，光标/九格仍空，存档信封逐字段一致，仅原木已解锁、recipeBook仍为空保留位。测试来源4184独立于普通4183，不增加正式授物按钮。
- [preview-input-cases.json](evidence/personal-preview/preview-input-cases.json)：剪刀两种对角镜像均显示剪刀×1；移位中不匹配清空；四木板显示工作台×1，少一材料清空；Esc关闭及另一标签重置后预览为空。镜像/重复材料均是可信实际点击，未注入DOM事件。
- [木板预览](evidence/personal-preview/wood-preview-1280.png)、[实际Tooltip](evidence/personal-preview/wood-tooltip-1280.png)、[Tooltip DOM](evidence/personal-preview/tooltip-dom.json)、[工作台预览](evidence/personal-preview/crafting-table-1280.png)。截图只佐证视觉，输入、数量和永久状态结论还依据前后DOM/存档。
- 普通开发、根/子路径静态产物的预览槽加载见[built-browser.json](evidence/personal-preview/built-browser.json)。

批量测试解锁目录期间曾出现一次浏览器定位器失效（界面按解锁更新重建），未获得成功点击；读取新DOM并通过正常Esc重开后完成上述用例，不将失败定位算成应用通过或模拟实体输入。

## 未验与边界

实体右/中拖、拖动中Esc、真实失焦/PointerCancel组合、跨浏览器、其他DPR/缩放和Java26.3客户端视觉/行为对照仍沿用[P5人工清单](../p5/manual-checklist.md)，本项没有宣称完成。未知组件的预览/图标不能当作全组件支持；原匹配器拒绝的情况明确unavailable。

本次没有领取结果、永久解锁产物、配方发现、材料消耗、剩余物出口、燃料续燃、加工/离线计时、3×3工作站或新设备内容。预览可以独立于这些未决规则完成；不应以D05/D06未批阻止只读显示，也不因只读预览可见而替用户决定未来取得时机。

## 本机复现

1. `npm --prefix app run dev`后访问4183/game/。普通存档的已解锁物品按原目录使用，E→Crafting填四格即可预览，结果槽不能取物。
2. 完整用例：`dev:verify`→4184/ __verify__/index.html，重置测试进度并只解锁log，再进同源/ __verify__/input.html。一原木→木板4；查Tooltip、尝试取结果并读回存档。批量解锁仅供剪刀镜像/四木板测试，等待夹具完成后再操作。
3. 关闭菜单/重置清预览；无匹配清空。`npm --prefix app test`、`run data:verify`、`run build`、`run build:pages`、`run test:built`复现检查。

完成本项后提交待审；后续业务须按具体新任务推进，不自动扩展范围。
