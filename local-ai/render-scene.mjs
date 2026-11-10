import { editorUrl, EDITOR_ORIGIN, editorHeaders, editorAssetUrl } from "./connection.mjs";
import { chromium } from "playwright";
export async function renderScene(sceneId, request, signal) {
	if (request.lighting)
		throw Error(
			"lighting_unavailable: 当前本地截图使用场景自身光照，请省略 lighting",
		);
	const browser = await chromium.launch({
		executablePath:
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		headless: true,
		args: ["--enable-unsafe-webgpu"],
	});
	const abort = () => {
		void browser.close();
	};
	signal?.addEventListener("abort", abort, { once: true });
	const deadline = setTimeout(abort, 100000);
	try {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 900 },
		});
		if (process.env.PASCAL_SCENE_API_TOKEN) {
			await page.route('**/*', async (route) => {
				try {
				// A snapshot needs the initial scene, not a live EventSource.
				// route.fetch buffers SSE forever and can outlive browser cleanup.
				if (/^\/api\/scenes\/[^/]+\/events$/.test(new URL(route.request().url()).pathname))
					return await route.fulfill({ status: 204 });
				const headers = { ...route.request().headers() };
				delete headers['x-pascal-scene-token'];
				delete headers.authorization;
				const callback = editorAssetUrl(route.request().url());
				if (!callback) return await route.continue({ headers });
				// This is an authenticated server renderer, not a browser session.
				// Avoid forwarding its synthetic API-page Origin through another
				// hosting ingress when retrieving public-site asset links.
				delete headers.origin;
				const authenticated = Object.fromEntries(editorHeaders(headers));
				if (new URL(route.request().url()).origin === EDITOR_ORIGIN)
					return await route.continue({ headers: authenticated });
				const response = await route.fetch({ url: callback, headers: authenticated, maxRedirects: 0 });
				if (response.status() >= 300 && response.status() < 400)
					throw Error('Cross-origin asset redirect refused');
				await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': EDITOR_ORIGIN } });
				} catch {
					// Playwright errors can include authenticated request headers.
					// Abort failed asset requests without leaking them to MCP stderr.
					await route.abort('failed').catch(() => {});
				}
			});
		}
		await page.goto(
			editorUrl("/project/" +
				encodeURIComponent(sceneId) +
				"?local-render=1"),
			{ waitUntil: "domcontentloaded", timeout: 90000 },
		);
		try { await page.waitForFunction(
			() =>
				typeof window.pascalLocalCapture === "function" &&
				window.pascalLocalReady?.() &&
				document.querySelector("canvas"),
			null, { timeout: 45000 },
		); } catch {
			const state = await page.evaluate(() => ({
				title: document.title,
				canvas: Boolean(document.querySelector('canvas')),
				capture: typeof window.pascalLocalCapture,
				ready: Boolean(window.pascalLocalReady?.()),
				text: document.body.innerText.slice(0, 500),
			}));
			throw Error('capture_not_ready: ' + JSON.stringify(state));
		}
		await page.waitForTimeout(6000);
		if (request.exportGlb) {
			const file = await page.evaluate(async () => window.pascalLocalExport());
			return {
				bytes: Buffer.from(file.base64, "base64"),
				warnings: file.warnings,
			};
		}
		const { pose, size, interior, presentation } = request;
		const image = await page.evaluate(
			async (input) => window.pascalLocalCapture(input),
			{
				standardSize: size,
				captureMode: "standard",
				snapLevels: true,
				...(pose.projection === "orthographic"
					? { ortho: pose }
					: { perspective: pose }),
				...(interior ? { interior } : {}),
				...(presentation ? { presentation } : {}),
			},
		);
		return {
			image: new Uint8Array(Buffer.from(image.base64, "base64")),
			mimeType: "image/png",
			width: image.width,
			height: image.height,
			presentation: image.presentation,
			tab: "local-headless-renderer",
			capturedAt: new Date().toISOString(),
		};
	} finally {
		clearTimeout(deadline);
		signal?.removeEventListener("abort", abort);
		await browser.close();
	}
}
