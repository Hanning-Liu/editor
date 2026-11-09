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
		await page.goto(
			"http://127.0.0.1:3002/project/" +
				encodeURIComponent(sceneId) +
				"?local-render=1",
			{ waitUntil: "domcontentloaded", timeout: 90000 },
		);
		await page.waitForFunction(
			() =>
				typeof window.pascalLocalCapture === "function" &&
				window.pascalLocalReady?.() &&
				document.querySelector("canvas"),
			{ timeout: 45000 },
		);
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
