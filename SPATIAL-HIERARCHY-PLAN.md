# 独立功能分区与家具组团

基线：ea96d4aeaf52fde7b31fe280f24fc9dbba33eba9。分支：codex/spatial-hierarchy。

1. [x] 从基线建分支，保存 14 个既有项目只读快照。
2. [x] 新增独立 semantic node schema 与统一 core 操作，沿用原生场景存储、同步与撤销。
3. [x] 房间下分区、组团、家具逐级展开；提供创建、编辑、整体移动旋转及边界预览。
4. [x] 注册共享 MCP/Qwen 工具，更新本地工具目录和使用说明。
5. [x] 独立项目实际执行网页与 Qwen 验收，核对原项目不变，提交上传。

## 数据决策

FunctionalZone 和 FurnitureGroup 是两种独立场景节点，不使用 Collection。它们在物理场景中隶属楼层，以 roomId、functionalZoneId、memberIds 表达语义关系；房间树据此组织显示。既有 item.parentId 不因归属而改变。此方式沿用 Pascal 对 Unit 等引用对象的原生持久化与撤销机制，避免另造文档级保存通道。

组团变换只修改成员中的承托根节点；成员含宿主和其子物品时只变换宿主。外部宿主上的单独子物品拒绝变换并提示补选宿主。删除语义对象仅解除组织关系，保留物理家具。首版整体变换支持平移与绕 Y 轴旋转，不自动重排家具。

## 验收完成

网页、MCP 与本地 Qwen 的创建、编辑、整体变换、撤销和刷新全部实测通过；14 个原项目 graph 未变。详见 SPATIAL-HIERARCHY.md 和 local-ai/hierarchy-tests/acceptance.json。全仓国际化遗留项独立记录，未关闭检查。
