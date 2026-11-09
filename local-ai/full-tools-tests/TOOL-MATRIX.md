# Qwen 建模工具接入与验收矩阵

更新时间：2026-11-09T03:40:33.917Z

Pascal MCP 89 项；Qwen 正常建模工具 82 项；目录/规范辅助工具 2 项；项目管理边界 7 项。

验收口径：执行成功代表所列测试输入和场景成立，不代表所有参数组合。屋顶迁移同时使用原生 MCP 内存夹具和持久化项目验证，其他建模使用持久化测试项目；图片分析调用本地 Qwen。照片尺寸估计不作为实测。

| 工具 | 分类 | 接入状态 | 执行验证 |
|---|---|---|---|
| `get_scene` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `validate_design` | 自定义建模 | Qwen 可自主调用 | 通过；extended-results.json |
| `place_design` | 自定义建模 | Qwen 可自主调用 | 通过；procedural-result.json |
| `measure_stair` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `fit_stair` | 楼层与结构 | Qwen 可自主调用 | 通过；retry-results.json |
| `find_by_type` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json、roof-visual.json、custom-and-stair.json、stair-and-export.json |
| `list_levels` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json、roof-visual.json |
| `get_node` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `get_level_summary` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `get_walls` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `get_zones` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `duplicate_level` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `set_ground_level` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `verify_scene` | 场景检查 | Qwen 可自主调用 | 通过；native-results.json、extended-results.json、retry-results.json、building.json、roof-visual.json、stair-and-export.json、custom-simple.json |
| `set_checkpoint` | 编辑与导出 | Qwen 可自主调用 | 通过；native-results.json |
| `design_brief` | 自定义建模 | Qwen 可自主调用 | 通过；retry-results.json、custom-simple.json |
| `add_wall` | 房间与门窗 | Qwen 可自主调用 | 通过；native-results.json |
| `set_wall_type` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `add_fence` | 楼层与结构 | Qwen 可自主调用 | 通过；native-results.json |
| `add_corner_window` | 房间与门窗 | Qwen 可自主调用 | 通过；retry-results.json |
| `merge_windows` | 房间与门窗 | Qwen 可自主调用 | 通过；retry-results.json |
| `add_level` | 楼层与结构 | Qwen 可自主调用 | 通过；native-results.json |
| `create_stair` | 楼层与结构 | Qwen 可自主调用 | 通过；native-results.json、retry-results.json、stair-and-export.json |
| `create_roof` | 屋顶 | Qwen 可自主调用 | 通过；native-results.json、roof-visual.json |
| `move_roofs_to_roof_level` | 屋顶 | Qwen 可自主调用 | 通过；migration-result.json、migration-persisted-result.json |
| `place_items` | 家具布局 | Qwen 可自主调用 | 通过；retry-results.json |
| `delete_node` | 编辑与导出 | Qwen 可自主调用 | 通过；retry-results.json |
| `move_node` | 家具布局 | Qwen 可自主调用 | 通过；remaining-results.json |
| `duplicate_node` | 编辑与导出 | Qwen 可自主调用 | 通过；retry-results.json |
| `create_room` | 房间与门窗 | Qwen 可自主调用 | 通过；native-results.json、extended-results.json、retry-results.json、building.json |
| `furnish_room` | 家具布局 | Qwen 可自主调用 | 通过；retry-results.json |
| `paint` | 颜色与材质 | Qwen 可自主调用 | 通过；extended-results.json、retry-results.json、building.json |
| `place_in_room` | 家具布局 | Qwen 可自主调用 | 通过；retry-results.json |
| `get_site` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `place_building` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `search_assets` | 家具布局 | Qwen 可自主调用 | 通过；extended-results.json |
| `view_assets` | 家具布局 | Qwen 可自主调用 | 通过；native-results.json |
| `search_materials` | 颜色与材质 | Qwen 可自主调用 | 通过；extended-results.json |
| `cut_floor_opening` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `remove_floor_opening` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `set_floor_foundation` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `set_room_floor_construction` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `rebase_floor_reference` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `create_mezzanine` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `move_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `duplicate_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json、retry-results.json |
| `rotate_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `lock_outside_faces` | 楼层与结构 | Qwen 可自主调用 | 通过；native-results.json |
| `set_zone_intent` | 房间与门窗 | Qwen 可自主调用 | 通过；native-results.json |
| `divide_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `merge_zones` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `delete_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；retry-results.json |
| `create_unit` | 编辑与导出 | Qwen 可自主调用 | 通过；native-results.json |
| `set_unit_members` | 编辑与导出 | Qwen 可自主调用 | 通过；native-results.json |
| `list_units` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `run_batch` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json |
| `list_collections` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `edit_collection` | 编辑与导出 | Qwen 可自主调用 | 通过；native-results.json |
| `add_column` | 楼层与结构 | Qwen 可自主调用 | 通过；native-results.json |
| `add_object` | 自定义建模 | Qwen 可自主调用 | 通过；retry-results.json、custom-simple.json |
| `author_scene` | 自定义建模 | Qwen 可自主调用 | 通过；extended-results.json |
| `get_source` | 读取与测量 | Qwen 可自主调用 | 通过；retry-results.json |
| `measure` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `view_scene` | 视觉与图片分析 | Qwen 可自主调用 | 通过；native-results.json、roof-visual.json |
| `create_story_shell` | 楼层与结构 | Qwen 可自主调用 | 通过；extended-results.json |
| `add_door` | 房间与门窗 | Qwen 可自主调用 | 通过；native-results.json |
| `add_window` | 房间与门窗 | Qwen 可自主调用 | 通过；native-results.json、retry-results.json |
| `apply_patch` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json |
| `clear_scene` | 读取与测量 | 不从建模聊天清空整个场景 | 不开放给模型 |
| `set_zone` | 房间与门窗 | Qwen 可自主调用 | 通过；extended-results.json |
| `undo` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json |
| `redo` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json |
| `export_json` | 编辑与导出 | Qwen 可自主调用 | 通过；native-results.json、stair-and-export.json |
| `export_glb` | 编辑与导出 | Qwen 可自主调用 | 通过；glb-validation.json |
| `check_collisions` | 场景检查 | Qwen 可自主调用 | 通过；native-results.json |
| `list_templates` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `create_from_template` | 读取与测量 | 此操作替换当前场景 | 不开放给模型 |
| `create_house_from_brief` | 读取与测量 | 此操作替换当前场景 | 不开放给模型 |
| `create_project` | 读取与测量 | 聊天绑定当前项目 | 通过；native-results.json、extended-results.json、retry-results.json |
| `get_project_status` | 场景检查 | Qwen 可自主调用 | 通过；native-results.json |
| `save_scene` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json、retry-results.json |
| `load_scene` | 读取与测量 | 由后台加载当前项目 | 不开放给模型 |
| `list_scenes` | 读取与测量 | Qwen 可自主调用 | 通过；native-results.json |
| `delete_scene` | 读取与测量 | 不从建模聊天删除项目 | 不开放给模型 |
| `rename_scene` | 编辑与导出 | Qwen 可自主调用 | 通过；retry-results.json |
| `generate_variants` | 编辑与导出 | Qwen 可自主调用 | 通过；extended-results.json |
| `photo_to_scene` | 读取与测量 | 此操作替换当前场景；请用图片分析与建模工具 | 不开放给模型 |
| `analyze_floorplan_image` | 视觉与图片分析 | Qwen 可自主调用 | 通过；vision-results.json |
| `analyze_room_photo` | 视觉与图片分析 | Qwen 可自主调用 | 通过；vision-results.json |

完整参数见 ../all-tools.json；原始执行输入与返回见同目录 JSON。初始错误与修正后的成功记录分别保留，不能把无效传参的拒绝视为接口不可用。
