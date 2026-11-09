import { createMcpSession } from "./mcp-session.mjs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { writeFile } from "node:fs/promises";
const { client: c, transport } = createMcpSession();
await c.connect(transport);
let cursor;
const a = [];
do {
	const p = await c.listTools(cursor ? { cursor } : {});
	a.push(...p.tools);
	cursor = p.nextCursor;
} while (cursor);
await writeFile("all-tools.json", JSON.stringify(a, null, 2));
console.log(a.map((t) => t.name).join(", "));
await c.close();
