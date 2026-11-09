import { spawn } from 'node:child_process'
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  BLENDER,
  MLX_PY,
  TRELLIS_ROOT,
  QWEN_URL,
  QWEN_MODEL,
  ROOT,
  FLUX_PATH,
} from './config.mjs'
import { dir, get, save, fileUrl } from './store.mjs'
import { createMcpSession } from '../mcp-session.mjs'
import { currentScene } from '../scene-journal.mjs'
import { ensureFloorplan } from './floorplan.mjs'
const env = {
  ...process.env,
  HF_HUB_OFFLINE: '1',
  TRANSFORMERS_OFFLINE: '1',
  PYTHONUNBUFFERED: '1',
}
export async function processRun(
  command,
  args,
  job,
  signal,
  onPhase,
  options = {},
) {
  signal.throwIfAborted()
  const d = dir(job.id)
  const log = path.join(d, 'worker.log')
  const { appendFile } = await import('node:fs/promises')
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    let last = 0
    let tail = ''
    let killTimer
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {}
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
      }, 4000)
      killTimer.unref()
    }
    signal.addEventListener('abort', kill, { once: true })
    const timer = setTimeout(kill, options.timeout || 45 * 60 * 1000)
    const chunk = (b) => {
      const s = b.toString()
      tail = (tail + s).slice(-2400)
      void appendFile(log, s)
      if (Date.now() - last > 1500) {
        last = Date.now()
        const line =
          s
            .replace(/\x1b\[[0-9;]*m/g, '')
            .split(/[\r\n]/)
            .filter(Boolean)
            .at(-1) || ''
        const percentage = line.match(/(\d+)%/)
        const stage =
          job.type === 'trellis'
            ? line.includes('sparse structure')
              ? '采样空间结构'
              : line.includes('shape SLat')
                ? '采样模型形状'
                : line.includes('tex SLat')
                  ? '采样模型纹理'
                  : line.includes('Loading')
                    ? '加载三维模型'
                    : '重建三维模型'
            : '生成图片'
        const phase = percentage
          ? job.type === 'trellis' &&
            stage === '采样模型纹理' &&
            percentage[1] === '100'
            ? '采样完成，正在解码网格与贴图（CPU）'
            : stage + ' ' + percentage[1] + '%'
          : /[\u4e00-\u9fff]/.test(line)
            ? line.slice(0, 120)
            : null
        if (phase) void onPhase(phase)
      }
    }
    child.stdout.on('data', chunk)
    child.stderr.on('data', chunk)
    child.on('error', (e) => {
      clearTimeout(killTimer)
      clearTimeout(timer)
      signal.removeEventListener('abort', kill)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      clearTimeout(timer)
      signal.removeEventListener('abort', kill)
      if (signal.aborted) return reject(Error('cancelled'))
      if (code !== 0) return reject(Error('生成进程失败：' + tail))
      resolve()
    })
  })
}
async function capture(job, signal) {
  const before = await currentScene(job.sceneId)
  const { client, transport } = createMcpSession()
  try {
    await client.connect(transport)
    await client.callTool({
      name: 'load_scene',
      arguments: { id: job.sceneId },
    })
    let levelId = job.settings.levelId
    if (job.settings.view === 'interior' && !levelId) {
      const r = await client.callTool({ name: 'list_levels', arguments: {} })
      const p = r.structuredContent || JSON.parse(r.content[0].text)
      levelId = p.levels?.find(
        (l) => l.metadata?.role !== 'roof' && !/roof/i.test(l.name || ''),
      )?.id
    }
    const r = await client.callTool(
      {
        name: 'view_scene',
        arguments: {
          maxPx: job.settings.resolution,
          ...(job.settings.view === 'interior' && levelId
            ? { interior: { levelId } }
            : {}),
          from: 'south-west',
        },
      },
      { signal, timeout: 120000 },
    )
    if (r.isError) throw Error(JSON.stringify(r.content))
    const image = r.content.find((b) => b.type === 'image')
    if (!image) throw Error('场景没有返回截图')
    const after = await currentScene(job.sceneId)
    if (after.version !== before.version)
      throw Error('捕获参考图时场景发生变化，请重试')
    job.sceneVersion = before.version
    await writeFile(
      path.join(dir(job.id), 'input.png'),
      Buffer.from(image.data, 'base64'),
    )
    return r.content.filter((b) => b.type !== 'image')
  } finally {
    await client.close()
  }
}
async function makeCode(job, signal) {
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: QWEN_MODEL,
      enable_thinking: false,
      temperature: 0,
      max_tokens: 3500,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You write small Blender bpy furniture modules. Return ONLY JSON {"code":"..."}. The module imports bpy and defines build(params), creating the requested mesh objects with materials. params has width (X), depth (Y), height (Z), in meters; bottom at Z=0. Do not define params yourself. Use short, simple code, max 100 lines. No files, no network, no subprocess, no scene resets, no rendering or exporting. No bpy.ops.wm calls. Use context-free mesh operators or bpy data API. Create real solid furniture parts; do not replace requested furniture by an unrelated primitive. Use Principled materials with named finish slots. The host will render and export.',
        },
        {
          role: 'user',
          content:
            job.prompt +
            '\nRequested dimensions (meters): ' +
            JSON.stringify({
              width: job.settings.width,
              depth: job.settings.depth,
              height: job.settings.height,
            }),
        },
      ],
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(900000)]),
  })
  if (!response.ok) throw Error('Qwen请求失败 ' + response.status)
  const r = await response.json()
  if (r.choices?.[0]?.finish_reason === 'length')
    throw Error('Qwen代码达到长度上限，未执行不完整代码')
  let text = r.choices?.[0]?.message?.content || ''
  text = text
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
  let code
  try {
    code = JSON.parse(text).code
  } catch {
    throw Error('Qwen没有返回可解析的代码JSON')
  }
  if (typeof code !== 'string' || !code.includes('def build('))
    throw Error('Qwen代码缺少build(params)')
  await writeFile(path.join(dir(job.id), 'source.py'), code)
  await writeFile(
    path.join(dir(job.id), 'qwen-response.json'),
    JSON.stringify(r, null, 2),
  )
}
export async function generate(job, signal, onPhase) {
  const d = dir(job.id)
  const exists = async (f) => {
    try {
      return (await stat(path.join(d, f))).size > 0
    } catch {
      return false
    }
  }
  if (job.type === 'render' && !(await exists('input.png'))) {
    await onPhase('正在捕获当前场景参考图')
    job.capture = await capture(job, signal)
    await save(job)
  }
  if (['material', 'render', 'pbr'].includes(job.type)) {
    job.fluxPath = FLUX_PATH
    await save(job)
    await processRun(
      MLX_PY,
      [path.join(ROOT, 'studio/image_worker.py'), path.join(d, 'job.json')],
      job,
      signal,
      onPhase,
    )
  } else if (job.type === 'blender') {
    if (!(await exists('source.py'))) {
      await onPhase('Qwen 正在生成 Blender 模块')
      await makeCode(job, signal)
    }
    await onPhase('Blender 正在构建与渲染模型')
    await processRun(
      BLENDER,
      [
        '--background',
        '--factory-startup',
        '--python-exit-code',
        '1',
        '--python',
        path.join(ROOT, 'studio/blender_worker.py'),
        '--',
        path.join(d, 'job.json'),
      ],
      job,
      signal,
      onPhase,
      { timeout: 600000 },
    )
  } else if (job.type === 'trellis') {
    if (!(await exists('trellis.glb'))) {
      await onPhase(
        'TRELLIS.2 正在生成，CPU 解码可避开 Ultra 的长 Metal 任务问题',
      )
      await processRun(
        path.join(TRELLIS_ROOT, '.venv/bin/python'),
        [
          'generate.py',
          path.join(d, 'input.png'),
          '--pipeline-type',
          '512',
          '--texture-size',
          String(job.settings.textureResolution),
          '--decoder-device',
          'cpu',
          '--seed',
          String(job.settings.seed),
          '--output',
          path.join(d, 'trellis'),
        ],
        job,
        signal,
        onPhase,
        { cwd: TRELLIS_ROOT, timeout: 120 * 60 * 1000 },
      )
    }
    await onPhase('Blender 正在整理网格与生成预览')
    await processRun(
      BLENDER,
      [
        '--background',
        '--factory-startup',
        '--python-exit-code',
        '1',
        '--python',
        path.join(ROOT, 'studio/blender_worker.py'),
        '--',
        path.join(d, 'job.json'),
      ],
      job,
      signal,
      onPhase,
      { timeout: 900000 },
    )
  }
  signal.throwIfAborted()
  const result = JSON.parse(await readFile(path.join(d, 'result.json'), 'utf8'))
  if (result.kind === 'model') {
    const b = await readFile(path.join(d, 'model.glb'))
    if (b.readUInt32LE(0) !== 0x46546c67) throw Error('生成结果不是有效GLB')
    if (result.dimensions.some((v) => !Number.isFinite(v) || v <= 0))
      throw Error('模型尺寸无效')
    Object.assign(
      result,
      await ensureFloorplan({ ...job, result }, processRun, signal, onPhase),
    )
    result.files = [
      ...new Set([...result.files, 'floorplan.png', 'floorplan.json']),
    ]
    await writeFile(
      path.join(d, 'result.json'),
      JSON.stringify(result, null, 2),
    )
  }
  result.previewUrl = fileUrl(job, result.preview)
  result.downloads = [...result.files, 'manifest.json'].map((name) => ({
    name,
    url: fileUrl(job, name),
  }))
  if (result.maps)
    result.mapUrls = Object.fromEntries(
      Object.entries(result.maps).map(([k, v]) => [k, fileUrl(job, v)]),
    )
  return result
}
