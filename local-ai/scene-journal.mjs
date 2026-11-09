import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("./scene-journals/", import.meta.url);
const stable = (v) =>
	Array.isArray(v)
		? v.map(stable)
		: v && typeof v === "object"
			? Object.fromEntries(
					Object.keys(v)
						.sort()
						.map((k) => [k, stable(v[k])]),
				)
			: v;
const hash = (g) =>
	createHash("sha256")
		.update(JSON.stringify(stable(g)))
		.digest("hex");
export async function currentScene(id) {
	const r = await fetch("http://127.0.0.1:3002/api/scenes/" + id);
	if (!r.ok) throw Error("场景读取失败：" + r.status);
	return r.json();
}
async function journal(id) {
	try {
		return JSON.parse(await readFile(new URL(id + ".json", root), "utf8"));
	} catch (e) {
		if (e.code === "ENOENT") return { past: [], future: [] };
		throw e;
	}
}
async function save(id, j) {
	await mkdir(root, { recursive: true });
	const p = new URL(id + ".json", root),
		tmp = new URL(id + ".tmp", root);
	await writeFile(tmp, JSON.stringify(j));
	await rename(tmp, p);
}
export async function recordEdit(id, before, label, expectedAfter) {
	const after = await currentScene(id);
	if (expectedAfter && hash(after.graph) !== hash(expectedAfter))
		throw Object.assign(
			Error("场景已有并行编辑，已停止；不把其他人的修改加入本次自动撤销。"),
			{ code: "scene_conflict" },
		);
	if (hash(before.graph) === hash(after.graph)) return false;
	const j = await journal(id);
	j.past.push({
		before: before.graph,
		after: after.graph,
		label,
		at: new Date().toISOString(),
	});
	j.past = j.past.slice(-30);
	j.future = [];
	await save(id, j);
	return true;
}
export async function restoreEdit(id, direction, steps, client) {
	const j = await journal(id),
		s = await currentScene(id);
	const from = direction === "undo" ? j.past : j.future,
		to = direction === "undo" ? j.future : j.past;
	const count = steps ?? 1;
	if (
		!Number.isInteger(count) ||
		count < 1 ||
		count > 30 ||
		count > from.length
	)
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: "没有足够的聊天编辑记录可供撤销/重做；手动编辑历史不包含在内。",
				},
			],
		};
	let graph = s.graph;
	for (let i = 0; i < count; i++) {
		const entry = from.at(-1),
			expected = direction === "undo" ? entry.after : entry.before;
		if (hash(graph) !== hash(expected))
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: "场景已有其他编辑，不能覆盖；请先检查当前画布。",
					},
				],
			};
		from.pop();
		to.push(entry);
		graph = direction === "undo" ? entry.before : entry.after;
	}
	const r = await client.callTool({
		name: "save_scene",
		arguments: {
			id,
			name: s.name,
			expectedVersion: s.version,
			graph,
			includeCurrentScene: false,
			saveMode: "draft",
		},
	});
	if (r.isError) return r;
	const restored = await client.callTool({
		name: "load_scene",
		arguments: { id },
	});
	if (restored.isError) return restored;
	const actual = await currentScene(id);
	if (hash(actual.graph) !== hash(graph))
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: "保存后的场景发生规范化变化，未确认完整恢复，请检查画布。",
				},
			],
		};
	await save(id, j);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					ok: true,
					direction,
					steps: count,
					note: "已恢复聊天编辑历史，请重新读取节点。",
				}),
			},
		],
		structuredContent: { ok: true, direction, steps: count },
	};
}
