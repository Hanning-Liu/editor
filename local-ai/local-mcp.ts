import { editorUrl, assetFetch } from "./connection.mjs";
import { createRemoteSceneStore, remoteArtifacts } from "./remote-scene-store.mjs";
import "./editor-src/packages/mcp/dist/bridge/node-shims.js";
import { SceneBridge } from "./editor-src/packages/mcp/dist/bridge/scene-bridge.js";
import { createPascalMcpServer } from "./editor-src/packages/mcp/dist/server.js";
import {
	createSceneStore,
	resolveDefaultDatabasePath,
} from "./editor-src/packages/mcp/dist/storage/index.js";
import { localGeometryScripts } from "./editor-src/packages/mcp/dist/tools/local-geometry-scripts.js";
import { connectStdio } from "./editor-src/packages/mcp/dist/transports/stdio.js";
import {
	createAssetViewLoader,
	createFetchAssetViewIO,
} from "./editor-src/packages/core/dist/agent-operations/index.js";
import { deliverFile } from "./tool-files.mjs";
import { renderScene } from "./render-scene.mjs";

import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import {registerStudioTools} from './studio/mcp-tools.ts';
import {generatedAssets} from './studio/store.mjs';
import {MCP_CATALOG_ITEMS} from './editor-src/packages/mcp/dist/tools/asset-catalog.js';
import {assetCatalogSource} from './editor-src/packages/core/dist/agent-operations/index.js';
const catalog = {
  async search(query) {return assetCatalogSource([...MCP_CATALOG_ITEMS,...await generatedAssets()]).search(query)},
  async byId(ids) {return assetCatalogSource([...MCP_CATALOG_ITEMS,...await generatedAssets()]).byId(ids)}
};
const remoteStore = process.env.PASCAL_REMOTE_STORE === "1";
const store = remoteStore ? createRemoteSceneStore() : await createSceneStore();
const execution = new AsyncLocalStorage<AbortSignal>();
const geometry = localGeometryScripts(resolveDefaultDatabasePath());
if (remoteStore) Object.assign(geometry, remoteArtifacts());
geometry.assertActive = async () => {
	execution.getStore()?.throwIfAborted();
};
geometry.runAdapter = (input) =>
	new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				fileURLToPath(
					new URL("./geometry-adapter-worker.mjs", import.meta.url),
				),
			],
			{ env: {}, stdio: ["pipe", "pipe", "pipe"] },
		);
		const chunks: Buffer[] = [];
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(Error("适配器执行超时"));
		}, 20000);
		child.stdout.on("data", (c) => chunks.push(c));
		child.stderr.resume();
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("close", () => {
			clearTimeout(timer);
			try {
				const r = JSON.parse(Buffer.concat(chunks).toString());
				if (!r.ok) throw Error(r.error);
				resolve({ payload: r.payload });
			} catch (e) {
				reject(e);
			}
		});
		child.stdin.end(JSON.stringify(input));
	});
connectStdio(() => {
	const bridge = new SceneBridge();
	bridge.loadDefault();
	bridge.clearHistory();
	const server = createPascalMcpServer({
		bridge,
		store,
    catalog,
		geometryScripts: geometry,
		assetViews: createAssetViewLoader(
			createFetchAssetViewIO({
				fetchImpl: assetFetch,
				resolveUrl: async (url) =>
					url.startsWith("/") ? editorUrl(url) : url,
			}),
		),
		executeTool: async (input) => {
			if (input.name === "export_glb") {
				const id = bridge.getActiveScene()?.id;
				if (!id) throw Error("no_scene");
				const file = await renderScene(id, { exportGlb: true }, input.signal);
				const payload = {
					...(await deliverFile(
						id,
						"scene.glb",
						"model/gltf-binary",
						file.bytes,
					)),
					status: "exported",
					reason: "Exported by the local Three.js browser renderer",
				};
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								...payload,
								warnings: [
									...(file.warnings || []),
									"纹理使用外部引用，离线使用需同时保留引用的纹理文件。",
								],
							}),
						},
					],
					structuredContent: {
						...payload,
						warnings: [
							...(file.warnings || []),
							"纹理使用外部引用，离线使用需同时保留引用的纹理文件。",
						],
					},
				};
			}
			return execution.run(input.signal, () => input.execute());
		},
		sceneViews: {
			capture: async (request) => {
				const id = bridge.getActiveScene()?.id;
				if (!id) throw Error("no_scene");
				return renderScene(id, request, execution.getStore());
			},
		},
	});
  registerStudioTools(server,bridge);
  return server;
});
