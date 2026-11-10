# Studio 家具资产正面朝向

新生成的 Qwen＋Blender 与 TRELLIS 家具会在最终 `model.glb` 导出后自动识别正面。已有模型在 Studio 勾选“全部素材”后，点击顶部“补齐模型朝向”；单个模型可重新识别。

## 文件与执行流程

资产目录为运行该 Studio worker 的 `STUDIO_DATA_DIR/jobs/<jobId>/`。其中：

| 文件 | 内容 |
| --- | --- |
| `model.glb` | 最终模型，识别流程只读，不旋转或重新导出 |
| `orientation.json` | 版本、GLB SHA-256、朝向、状态、来源、记录哈希及可观察的判断依据 |
| `orientation-views.json`、`orientation-v0.png` 至 `v7.png` | 已知相机方位的八张证据图及坐标映射 |
| `orientation-sheet-a.png`、`orientation-sheet-b.png` | 同一组视图的两种排列 |
| `orientation-response-a.json`、`orientation-response-b.json` | 本地 VLM 的结构化观察结果 |

1. Blender 导入最终 GLB，按模型几何主轴构造八个已知相机方向。所有方向都记录在 GLB 本地坐标中，Y 向上。
2. 两次调用本地 Qwen VLM，观察同一组图片的不同排列，报告类别、靠背、语义正面、结构证据和自评分。
3. 只有两次观察对类别、功能和正面方向一致，且证据完整、自评分达到门槛，才自动接受。两次观察来自同一模型，相关性较高；自评分不是校准后的正确概率。
4. 椅子、沙发及带靠背长凳采用坐姿向外方向，床采用床尾，柜子采用门/抽屉操作面。无靠背、无明确操作侧的桌凳才允许自动标记无唯一正面。
5. Blender 的建模声明还要与视觉结果一致；通过后可采用声明的精确轴。TRELLIS 的方向由已知相机方位估计，精度取决于模型主轴和视图采样，不承诺任意模型的精确角度。
6. 记录绑定实际模型字节哈希；模型替换、记录失效、观察不一致或识别失败都会转为待复核。识别失败不会丢弃已生成的家具。

重型生成和朝向补齐共用 Studio 串行队列。取消、服务重启和重试保留已有模型及结果；缓存命中不会再次调用 VLM。强制重新识别会覆盖资产级人工结果，因此只在用户主动选择时使用。

## 资产与实例

`generatedAssets()` 将经过校验的记录转换为可选的 `asset.orientation`，绑定资产 ID 和模型 URL。现有 `placeItems` 路径通过核心 Item schema 保存它。资产继承并不改变实例的 `position`、`rotation`、`scale` 或 `parentId`。

解析优先级为：实例 `metadata.spatialReference` 的人工修正 → 当前生成资产的有效记录 → 随场景保存的资产快照 → 已核对的内置目录规则 → 未知。已有摆放实例可以通过资产 ID 查询 worker 记录，无需重写旧场景。

家具旋转时，只将资产本地前向通过实例、模型修正及祖先变换转换为世界方向，不再次调用 VLM。实例人工修正继续优先，承托子节点的局部坐标与父子关系不受影响。

待复核资产不能用于自动选择相对墙。Studio 显示状态、八张证据图和方向箭头；用户可以选择正面保存，或确认没有唯一正面。保存采用记录与模型哈希的乐观检查。资产证据更新后，旧的相对墙决策也会失效。

## 云端与 Agent

魔搭网页沿用现有私网网关调用 Mac Studio worker，视觉推理仍在本地。模型、朝向 JSON、多视图及下载清单同步到云端不可变文件存储，场景保存资产快照。预览和下载无需重复视觉推理。

Qwen 可调用 `request_local_studio_orientation` 提交异步识别，通过 `get_local_studio_job` 查看结果，再使用 `spatial_get_furniture_frame` 和 `spatial_resolve_relative_wall` 解析方向。提交成功不等于识别完成。资产级人工确认在 Studio 完成；实例手动轴修正继续使用 `spatial_set_furniture_front`，需要用户明确给出轴。

## 验证入口

- `cloud-tests/orientation.test.mjs`：共识、背靠结构、模型绑定、旋转、手动覆盖和旧决策失效。
- `packages/core/src/schema/nodes/item-orientation.test.ts`：旧数据兼容与资产快照校验。
- `studio-tests/orientation-live.mjs <evidence-dir> local|cloud <jobId>`：真实已摆放模型的旋转、四方向、手动覆盖、撤销、重新载入与承托保护检查。
- `studio-tests/orientation-fixture.mjs`：独立验收项目，保留预置承托物件及手动标定实例。

实际部署与浏览器验收结果记录在本次工作交付的验收报告中。
