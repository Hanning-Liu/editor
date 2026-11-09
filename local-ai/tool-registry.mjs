import { readFileSync } from "node:fs";
const inventory = JSON.parse(
	readFileSync(new URL("./all-tools.json", import.meta.url)),
);
export const BLOCKED = new Map([
	["create_project", "聊天绑定当前项目"],
	["delete_scene", "不从建模聊天删除项目"],
	["load_scene", "由后台加载当前项目"],
	["clear_scene", "不从建模聊天清空整个场景"],
	["create_from_template", "此操作替换当前场景"],
	["create_house_from_brief", "此操作替换当前场景"],
	["photo_to_scene", "此操作替换当前场景；请用图片分析与建模工具"],
]);
const groups = [
 ["studio", "本地 Studio", "FLUX效果图、无缝材质、PBR、Qwen Blender与TRELLIS.2异步生成", "local_studio_capabilities submit_local_studio list_local_studio_jobs get_local_studio_job cancel_local_studio_job"],
	[
		"rooms",
		"房间与门窗",
		"墙体、门窗与区域编辑",
		"edit_functional_zone edit_furniture_group transform_furniture_group create_room add_door add_window add_wall set_wall_type add_corner_window merge_windows move_zone duplicate_zone rotate_zone set_zone_intent divide_zone merge_zones delete_zone set_zone",
	],
	[
		"roofs",
		"屋顶",
		"创建屋顶、整理屋顶楼层",
		"create_roof move_roofs_to_roof_level",
	],
	[
		"furniture",
		"家具布局",
		"目录家具与整屋布局",
		"search_assets place_items move_node furnish_room place_in_room view_assets",
	],
	[
		"materials",
		"颜色与材质",
		"搜索材质、涂装与表面构造",
		"search_materials paint",
	],
	[
		"structure",
		"楼层与结构",
		"楼梯、柱、围栏、楼板、基础、夹层",
		"add_level duplicate_level set_ground_level create_stair fit_stair add_column add_fence create_story_shell place_building cut_floor_opening remove_floor_opening set_floor_foundation set_room_floor_construction rebase_floor_reference create_mezzanine lock_outside_faces",
	],
	[
		"editing",
		"编辑与导出",
		"复制、删除、批量编辑、撤销与导出",
		"delete_node duplicate_node apply_patch run_batch edit_collection create_unit set_unit_members undo redo set_checkpoint export_json export_glb save_scene rename_scene generate_variants",
	],
	[
		"geometry",
		"自定义建模",
		"Three.js / Blender 模块与参数化设计；文字生物体服务未配置",
		"validate_design place_design add_object author_scene design_brief",
	],
	[
		"vision",
		"视觉与图片分析",
		"真实离屏渲染、户型图与房间照片分析",
		"view_scene analyze_floorplan_image analyze_room_photo",
	],
	[
		"inspect",
		"场景检查",
		"结构校验与碰撞检查",
		"verify_scene check_collisions get_project_status",
	],
];
export const PLUGINS = groups.map(([id, name, description, names]) => ({
	id,
	name,
	description,
	tools: names.split(" "),
	...(id === "inspect" ? { required: true } : {}),
}));
const grouped = new Set(PLUGINS.flatMap((p) => p.tools));
export const READ_TOOLS = inventory
	.filter(
		(t) =>
			!BLOCKED.has(t.name) &&
			!grouped.has(t.name) &&
			t.annotations?.readOnlyHint,
	)
	.map((t) => t.name);
export const INITIAL_TOOLS = [
	"get_spatial_hierarchy",
	"get_functional_zone_remainder",
	"list_levels",
	"get_walls",
	"get_zones",
	"find_by_type",
	"get_node",
	"search_assets",
	"verify_scene",
];
export function allowedNames(prefs) {
	return new Set([
		...READ_TOOLS,
		...PLUGINS.filter((p) => prefs.plugins.includes(p.id)).flatMap(
			(p) => p.tools,
		),
	]);
}
export function toolSchema(t) {
	const parameters = structuredClone(t.inputSchema);
	delete parameters.$schema;
	return {
		type: "function",
		function: { name: t.name, description: t.description, parameters },
	};
}
export const DISCOVER = {
	type: "function",
	function: {
		name: "discover_tools",
		description:
			"加载正常建模工具的完整定义。根据工具目录选择名字；可 query 搜索用途或 category 按插件分类发现。加载后直接调用该工具。",
		parameters: {
			type: "object",
			properties: {
				names: { type: "array", items: { type: "string" }, maxItems: 8 },
				query: { type: "string" },
				category: { type: "string" },
			},
			additionalProperties: false,
		},
	},
};
export function guardCall(name, args, names, sceneId, nodes = {}) {
	if (!names.has(name)) throw Error("工具未启用：" + name);
	if (name === "run_batch")
		for (const call of args.calls || []) {
			if (call.tool === "run_batch") throw Error("不支持嵌套批处理");
			guardCall(call.tool, call.input || {}, names, sceneId, nodes);
		}
	const rootNode = (id) => ["site", "building"].includes(nodes[id]?.type);
	if (name === "delete_node" && rootNode(args.id))
		throw Error("不能通过建模聊天删除项目根节点；可编辑其墙体、楼层和物件");
	if (name === "apply_patch")
		for (const patch of args.patches || []) {
			if (
				rootNode(patch.id) &&
				(patch.op === "delete" ||
					["children", "type", "parentId"].some((k) =>
						Object.hasOwn(patch.data || {}, k),
					))
			)
				throw Error("不能通过补丁清空或替换项目根节点");
		}
	if (name === "save_scene") {
		if (
			args.graph ||
			(args.projectId && args.projectId !== sceneId) ||
			args.includeCurrentScene === false ||
			args.publish ||
			args.replace ||
			(args.id && args.id !== sceneId)
		)
			throw Error("只能保存当前场景，不能替换图或发布");
		args.id = sceneId;
	}
	if (
		["rename_scene", "get_project_status"].includes(name) &&
		args.id !== sceneId
	)
		throw Error("项目操作仅限当前场景");
	if (name === "generate_variants") {
		if (args.baseSceneId && args.baseSceneId !== sceneId)
			throw Error("只从当前场景生成变体");
		if (args.save === true) throw Error("方案变体不能自动创建其他项目");
		args.save = false;
	}
	if (
		name === "author_scene" &&
		(args.replace || args.clear || (args.sceneId && args.sceneId !== sceneId))
	)
		throw Error("不允许替换整个项目");
}
export function isMutation(t) {
	return (
		t &&
		!t.annotations?.readOnlyHint &&
		![
			"submit_local_studio",
			"cancel_local_studio_job",
			"design_brief",
			"set_checkpoint",
			"validate_design",
			"generate_variants",
			"export_glb",
			"export_json",
		].includes(t.name)
	);
}

export function requiresSceneEdit(text) {
	if (
		/^\s*(?:只读|仅查看|仅检查|请只读|请仅(?:查看|检查)|如何|怎么(?:样)?|请(?:解释|说明)|是否支持)/.test(
			text,
		)
	)
		return false;
	const affirmative = text.replace(
		/(?:不要|不得|不必|别|勿)(?:再)?(?:修改|创建|新建|新增|添加|删除|移动|旋转|重建|生成|更改|调整|清空)[^。；，\n]*/g,
		"",
	);
	return /绘制|画(?:个|一|出|[0-9]|房|墙|平面)|创建|新建|新增|搭建|建造|建(?:坡|屋顶|房|墙|楼梯)|添加|放置|摆放|搬动|挪动|移到|移动|旋转|修改|改为|更换|设置|涂(?:色|成|装)|调整|删除|复制|合并|分割|开洞|撤销|重做|恢复|重命名/.test(
		affirmative,
	);
}
