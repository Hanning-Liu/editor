import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export function createMcpSession(
	options = {},
	signal,
	onUsage = async () => {},
) {
	const client = new Client(
		{ name: "pascal-web-qwen", version: "0.3.0" },
		{ capabilities: options.chosen ? { sampling: {} } : {} },
	);
	if (options.chosen)
		client.setRequestHandler("sampling/createMessage", async (request) => {
			signal?.throwIfAborted();
			const p = request.params;
			const messages = [
				...(p.systemPrompt
					? [{ role: "system", content: p.systemPrompt }]
					: []),
				...p.messages.map((m) => ({
					role: m.role,
					content: (Array.isArray(m.content) ? m.content : [m.content]).map(
						(b) =>
							b.type === "image"
								? {
										type: "image_url",
										image_url: { url: `data:${b.mimeType};base64,${b.data}` },
									}
								: { type: "text", text: b.text || "" },
					),
				})),
			];
			const response = await fetch(options.chosen.endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: options.chosen.model,
					messages,
					temperature: 0,
					stream: false,
					enable_thinking: false,
					max_tokens: Math.min(p.maxTokens || 3000, 6000),
				}),
				signal: AbortSignal.any([
					...(signal ? [signal] : []),
					AbortSignal.timeout(180000),
				]),
			});
			if (!response.ok) throw Error("图片分析模型请求失败：" + response.status);
			const data = await response.json();
			await onUsage(data.usage || null);
			if (data.choices?.[0]?.finish_reason === "length")
				throw Error("图片分析输出被截断，请重试");
			let text = data.choices?.[0]?.message?.content || "";
			text = text
				.replace(/^```(?:json)?\s*/, "")
				.replace(/\s*```$/, "")
				.trim();
			return {
				model: options.chosen.model,
				role: "assistant",
				content: { type: "text", text },
				stopReason: "endTurn",
			};
		});
	const transport = new StdioClientTransport({
		command: process.env.LOCAL_BUN || "bun",
		args: [path.join(root, "local-mcp.ts")],
		cwd: root,
		env: {
			...process.env,
			PASCAL_DATA_DIR: path.join(root, "pascal-home/data"),
			PASCAL_SERVER_SCRIPT_COMPILE: "1",
			PASCAL_BLENDER: "/Applications/Blender.app/Contents/MacOS/Blender",
		},
		stderr: "pipe",
	});
	transport.stderr?.resume();
	return { client, transport };
}
