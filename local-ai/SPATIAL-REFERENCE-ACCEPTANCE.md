# 家具朝向与相对方位解析验收

日期：2026-11-10。基线：`297b6ac`；分支：`codex/furniture-relative-reference`。

本地编辑器与魔搭网页均已接入同一套方位工具、编辑前校验与执行记录卡。既有家具不需要重新归属或重建。

## 实现

| 工具 | 功能 |
| --- | --- |
| `spatial_get_furniture_frame` | 显示正面来源、承托链变换和前后左右的楼层/世界方向 |
| `spatial_resolve_relative_wall` | 从家具锚点解析所在房间的首个边界墙，返回候选、命中点、房间墙段与选择依据 |
| `spatial_set_furniture_front` | 保存用户明确确认的模型本地正面轴，只修改语义 metadata |

默认沿家具使用方向判断，沙发采用坐姿。站在正面看与世界轴是另外两个明确的参照系。已有审核的内置 Sofa 正面为模型本地 +Z；其他资产没有可靠来源时，先请求标定。

Chat 编辑前强制核验当前家具、参照系、方向、场景指纹、目标墙及门窗所在墙段。未知正面、歧义、过期证据、错误墙体和通过补丁/代码绕过门窗工具的尝试均不能直接编辑。多个房间同时包含家具时，模型自行传 roomId 不等于用户确认。原始模型工具参数不会被后端偷偷替换成另一堵墙。

## 实际测试

| 路径 | 验证内容 | 结果 |
| --- | --- | --- |
| 本地真实 MCP | 沙发旋转 0°/90°/180°/270°，每次解析前后左右，共 16 次 | 通过 |
| 云端真实 MCP | 同样 16 次旋转与方向组合，经魔搭持久存储回调 | 通过 |
| 两端 MCP | 正面标定仅改变 metadata；撤销、重新加载；承托子节点保留 | 通过 |
| 本地网页 → 本地 Qwen | 旋转 90° 后，前 Wall 2、后 Wall 4、左 Wall 1、右 Wall 3；仅在右墙新增门 | 通过 |
| 魔搭网页 → 私网网关 → 本地 Qwen | 旋转 180° 后，前 Wall 1、后 Wall 3、左 Wall 4、右 Wall 2；仅在右墙新增门 | 通过 |
| 两端网页刷新 | 完成回复、执行记录、候选墙与实际参数恢复；保存后的场景与刷新前一致 | 通过 |
| 原始问题只读复核 | 未旋转原始 Sofa 的坐姿右侧应为 Wall 4 | 通过 |
| 故意错误的测试模型 | 未解析就开门、解析后选错墙均被阻止；只执行一次正确开门 | 通过 |

网页实际开门参数均为宽 0.9 m、高 2.1 m、t=0.5。云端还明确提交 hinged / inward / left。记录中的参数与保存后门的父墙一致。

自动化测试共 33 项：32 通过，1 项需要显式开启的 310 秒响应头实验本轮未重跑。覆盖非直角旋转、Three.js Euler 对照、资产变换与镜像、嵌套承托、建筑变换、共享墙段、墙角歧义、房间歧义绕过、失效证据、标定确认与限流重试。编辑器生产构建、两个界面组件的 Biome 检查，以及 pre-push 类型检查流程的 11 项任务通过。

## 数据保护

测试使用独立副本。本地原有 20 个场景及云端原有 2 个场景的整个 graph 与测试前完全一致。验收副本中的原有家具节点逐项比较：位置、旋转、缩放、children、parentId 均保留；墙体端点保留。新增门只出现在验收副本。

`verify_scene` 的 valid=true 表示几何/结构校验通过。副本中的默认墙面、承托测试物件重叠与既有家具间距仍有告警，已保留在 Qwen 回复和工具结果中；它们不替代方位语义校验。

## 云端运行发现

密集原生 MCP 测试触发魔搭入口 HTTP 429。远端存储现仅对明确拒绝执行的 429 做有界等待重试，并保留操作名和 HTTP 状态；不重放结果不确定的网络/5xx 写入。用故障注入验证了限流后写入只成功执行一次。

魔搭重新发布后曾出现短暂私网恢复期，配置请求返回 503。确认 Tailscale Running、本地模型与阿里云转发可用后，重新加载网页，真实生成编辑及刷新验收通过。

当前的边界限制：未知正面需标定；曲墙和墙角多解暂停自动选墙；没有相机证据时不猜测屏幕左右。复杂的多方向编辑需明确每次编辑方向，只读检查可一次列四向。

## 复核材料

完整本机证据位于 `pascal-cloud-gateway-evidence/spatial-reference-20261110`：

- `local/native-report.json`、`cloud/native-report.json`：两端 16 次方向判断及标定/撤销/重载。
- `local/report-door.json`、`local/report-directions.json`、`cloud/report-door.json`、`cloud/report-directions.json`：真实网页 Qwen 调用、工具与场景回读。
- `guard-report.json`：错误参数拦截及唯一正确编辑。
- `local-preservation.json`、`cloud-original-preservation.json`、`refresh-preservation.json`：原始数据与刷新比对。
- `cloud/dom-audit.json`：网页中的参照系、候选墙、实际参数及折叠原始记录。
- `local-decision-after-refresh.png`、`cloud-decision-after-refresh.png`：刷新后的界面截图。

相关实现与使用约定见 `SPATIAL-REFERENCE.md`；测试脚本位于 `cloud-tests/spatial-*.mjs`。
