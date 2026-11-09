import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const root = new URL("./tool-deliveries/", import.meta.url);
export async function deliverFile(sceneId, name, mime, bytes) {
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sceneId)) throw Error("invalid scene");
	const dir = new URL(sceneId + "/", root);
	await mkdir(dir, { recursive: true });
	const id = randomUUID();
	await writeFile(new URL(id, dir), bytes);
	const meta = {
		id,
		name,
		mime,
		size: bytes.byteLength,
		url: `/api/local-chat?sceneId=${sceneId}&action=file&ref=${id}`,
	};
	await writeFile(new URL(id + ".json", dir), JSON.stringify(meta));
	return meta;
}
export async function delivery(sceneId, id) {
	if (
		!/^[a-zA-Z0-9_-]{1,64}$/.test(sceneId) ||
		!/^[a-f0-9-]{36}$/.test(id || "")
	)
		throw Error("invalid file");
	const dir = new URL(sceneId + "/", root);
	return {
		meta: JSON.parse(await readFile(new URL(id + ".json", dir), "utf8")),
		bytes: await readFile(new URL(id, dir)),
	};
}
