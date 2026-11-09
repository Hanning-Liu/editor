import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const state = JSON.parse(await readFile(new URL('./pascal-home/run/editor.json', import.meta.url), 'utf8'));
const sceneId = process.argv[2] || 'ebbf4a7f8bc8';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${state.url}/scene/${sceneId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('canvas')?.width > 0, { timeout: 45000 });
  await page.waitForTimeout(8000);
  const facts = await page.evaluate(async () => ({
    title: document.title,
    url: location.href,
    webgpu: !!navigator.gpu,
    gpuAdapterAvailable: navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false,
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })),
    text: document.body.innerText.slice(0, 3000),
  }));
  await page.screenshot({ path: new URL('./browser-check.png', import.meta.url).pathname, fullPage: true });
  await writeFile(new URL('./browser-check.json', import.meta.url), JSON.stringify({ ...facts, errors }, null, 2));
  console.log(JSON.stringify({ ...facts, errors }, null, 2));
} finally {
  await browser.close();
}
