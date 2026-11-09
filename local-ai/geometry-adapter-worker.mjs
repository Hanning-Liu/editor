import { Console } from "node:console";
import { runAdapter } from "./editor-src/packages/geometry-script/dist/adapter.js";
const stdout = process.stdout;
globalThis.console = new Console({
	stdout: process.stderr,
	stderr: process.stderr,
});
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
for (const name of [
	"fetch",
	"WebSocket",
	"EventSource",
	"XMLHttpRequest",
	"Request",
	"Response",
])
	Reflect.deleteProperty(globalThis, name);
try {
	stdout.write(
		JSON.stringify({
			ok: true,
			...(await runAdapter(JSON.parse(Buffer.concat(chunks)))),
		}),
	);
} catch (e) {
	stdout.write(JSON.stringify({ ok: false, error: e.message }));
}
