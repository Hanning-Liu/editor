import { editorFetch, publicUrl, guardWorkerRequest } from '../connection.mjs'
import { createServer } from 'node:http'
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { capabilities, DATA, ROOT } from './config.mjs'
import { save, get, list, dir, fileUrl } from './store.mjs'
import { generate, processRun } from './engine.mjs'
import { ensureOrientation, orientationResult, reviewOrientation, ORIENTATION_FILES } from './orientation.mjs'
import { publishCloudAssets } from './cloud-assets.mjs'
import { createMcpSession } from '../mcp-session.mjs'
import { currentScene, recordEdit } from '../scene-journal.mjs'
const queue = [],
  running = new Map()
let submitTail = Promise.resolve()
let draining = false,
  closing = false
const applyLocks = new Set()
for (const j of await list()) {
  if(j.orientationTask && ['running','queued'].includes(j.orientationTask.status)){j.orientationTask.status='interrupted';j.orientationTask.phase='朝向识别中断，可重新识别';await save(j)}
  if (['running', 'queued'].includes(j.status)) {
    j.status = 'interrupted'
    j.phase = '服务中断，可继续已有任务'
    await save(j)
  }
}
async function drain() {
  if (draining || closing) return
  draining = true
  try {
    while (queue.length && !closing) {
      const task = queue.shift(), id = typeof task === 'string' ? task : task.id, j = await get(id)
      if(typeof task === 'object' && task.kind === 'orientation'){
        if(j.orientationTask?.status!=='queued')continue
        const controller=new AbortController();running.set(id,controller);j.orientationTask.status='running';await save(j)
        try{
          const record=await ensureOrientation(j,processRun,controller.signal,async phase=>{j.orientationTask.phase=phase;await save(j)},{force:task.force})
          await orientationResult(j,record);await publishCloudAssets(j,controller.signal)
          j.orientationTask.status='succeeded';j.orientationTask.phase=record.status==='accepted'?'正面识别完成':record.status==='symmetric'?'没有唯一正面':'识别完成，待复核'
        }catch(e){j.orientationTask.status=controller.signal.aborted?(closing?'interrupted':'cancelled'):'failed';j.orientationTask.error=String(e.message||e).slice(-3000);j.orientationTask.phase='朝向任务未完成，可重试'}
        finally{j.orientationTask.finishedAt=new Date().toISOString();await save(j);running.delete(id)}
        continue
      }
      if (j.status !== 'queued') continue
      const controller = new AbortController()
      running.set(id, controller)
      j.status = 'running'
      j.startedAt = new Date().toISOString()
      j.phase = '准备生成'
      await save(j)
      try {
        j.result ||= await generate(j, controller.signal, async (phase) => {
          if (controller.signal.aborted) return
          j.phase = phase
          await save(j)
        })
        if(j.result.kind==='model'){
          await save(j)
          const record=await ensureOrientation(j,processRun,controller.signal,async phase=>{j.phase=phase;await save(j)})
          await orientationResult(j,record)
        }
        if (process.env.PASCAL_REMOTE_STORE === '1') {
          j.phase = '正在同步云端素材'
          await save(j)
          await publishCloudAssets(j, controller.signal)
        }
        controller.signal.throwIfAborted()
        j.status = 'succeeded'
        j.phase = '已完成'
      } catch (e) {
        j.status = controller.signal.aborted
          ? closing
            ? 'interrupted'
            : 'cancelled'
          : 'failed'
        j.phase =
          j.status === 'failed'
            ? '生成失败，可查看诊断并重试'
            : j.status === 'cancelled'
              ? '已取消，已应用的内容不受影响'
              : '服务中断，可继续'
        j.error = String(e.message || e).slice(-5000)
      } finally {
        j.finishedAt = new Date().toISOString()
        await save(j)
        running.delete(id)
      }
    }
  } finally {
    draining = false
  }
}
function settings(s = {}) {
  const number = (n, f, min, max) => {
    const x = n === undefined ? f : Number(n)
    if (!Number.isFinite(x) || x < min || x > max)
      throw Error('参数超出允许范围')
    return x
  }
  return {
    resolution: [512, 768, 1024].includes(Number(s.resolution))
      ? Number(s.resolution)
      : 768,
    steps: 4,
    imageStrength: number(s.imageStrength, 0.8, 0.5, 0.95),
    seed: Math.floor(number(s.seed, 41, 0, 2147483647)),
    width: number(s.width, 0.8, 0.05, 10),
    height: number(s.height, 0.8, 0.05, 10),
    depth: number(s.depth, 0.6, 0.05, 10),
    tileSizeMeters: number(s.tileSizeMeters, 1, 0.05, 20),
    roughness: number(s.roughness, 0.65, 0, 1),
    metalness: number(s.metalness, 0, 0, 1),
    normalStrength: number(s.normalStrength, 3, 0, 20),
    faceLimit: Math.floor(number(s.faceLimit, 50000, 1000, 200000)),
    textureResolution: [512, 1024, 2048].includes(Number(s.textureResolution))
      ? Number(s.textureResolution)
      : 1024,
    view: s.view === 'interior' ? 'interior' : 'exterior',
    ...(s.levelId ? { levelId: String(s.levelId) } : {}),
  }
}
async function submit(sceneId, b) {
  if (!capabilities().types.some((t) => t.id === b.type && t.available))
    throw Error('生成类型或本地环境不可用')
  if (
    typeof b.prompt !== 'string' ||
    !b.prompt.trim() ||
    b.prompt.length > 8000
  )
    throw Error('请提供生成描述（最多8000字）')
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(b.generationKey || ''))
    throw Error('缺少有效生成键')
  const existing = (await list()).find(
    (j) => j.sceneId === sceneId && j.generationKey === b.generationKey,
  )
  if (existing) return existing
  const cfg = settings(b.settings)
  let inputBytes, sourceJobId
  if (b.sourceJobId) {
    const source = await get(b.sourceJobId)
    if (source.status !== 'succeeded') throw Error('参考任务尚未完成')
    const name = source.result.maps?.baseColor || source.result.preview
    inputBytes = await readFile(path.join(dir(source.id), name))
    sourceJobId = source.id
  } else if (b.input) {
    inputBytes = Buffer.from(b.input.base64 || '', 'base64')
    if (inputBytes.length > 20 * 1024 * 1024 || inputBytes.length < 20)
      throw Error('参考图片大小不合法')
    if (
      !/^89504e47|^ffd8ff|^52494646/.test(
        inputBytes.subarray(0, 4).toString('hex'),
      )
    )
      throw Error('请上传PNG、JPEG或WebP图片')
  }
  if (['trellis', 'pbr'].includes(b.type) && !inputBytes)
    throw Error('此任务需要参考图片或已生成材质')
  const scene = await currentScene(sceneId),
    j = {
      id: randomUUID(),
      generationKey: b.generationKey,
      sceneId,
      sceneVersion: scene.version,
      type: b.type,
      name: String(b.name || b.prompt).slice(0, 64),
      prompt: b.prompt,
      settings: cfg,
      createdAt: new Date().toISOString(),
      status: 'queued',
      phase: '等待队列',
      applications: [],
      ...(sourceJobId ? { sourceJobId } : {}),
    }
  await save(j)
  try {
    if (inputBytes)
      await writeFile(path.join(dir(j.id), 'input.png'), inputBytes)
    queue.push(j.id)
    void drain()
    return j
  } catch (e) {
    j.status = 'failed'
    j.phase = '准备输入失败'
    j.error = e.message
    await save(j)
    throw e
  }
}
async function requestOrientation(b){
 const jobs=b.jobIds?b.jobIds.map(String):[String(b.jobId||'')]
 if(!jobs.length||jobs.length>100)throw Error('批量识别最多100个资产')
 const results=[]
 const selected=await Promise.all([...new Set(jobs)].map(get))
 for(const j of selected)if(j.status!=='succeeded'||j.result?.kind!=='model'||!['blender','trellis'].includes(j.type))throw Error('请选择已完成的家具模型')
 for(const j of selected){
  const id=j.id
  if(running.has(id)||queue.some(q=>(typeof q==='string'?q:q.id)===id)){results.push({id,status:'already_queued'});continue}
  j.orientationTask={id:randomUUID(),status:'queued',phase:'等待正面识别',createdAt:new Date().toISOString()};await save(j);queue.push({id,kind:'orientation',force:b.force===true});results.push({id,status:'queued'})
 }
 void drain();return {jobs:results}
}
async function apply(sceneId, b) {
  if (applyLocks.has(sceneId)) throw Error('该项目正在应用其他素材')
  applyLocks.add(sceneId)
  try {
    const j = await get(b.jobId)
    if (j.status !== 'succeeded') throw Error('任务尚未成功')
    const s = await currentScene(sceneId)
    if (s.version !== b.expectedVersion)
      throw Error('项目版本已变化，请刷新目标列表后再应用')
    const r = j.result
    if (r.kind === 'image') {
      const thumbnailUrl = publicUrl(fileUrl(j, 'result.png'))
      const res = await editorFetch('/api/scenes/' + sceneId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graph: s.graph,
          name: s.name,
          thumbnailUrl,
          expectedVersion: s.version,
        }),
      })
      if (!res.ok) throw Error(await res.text())
      j.applications.push({
        sceneId,
        at: new Date().toISOString(),
        kind: 'cover',
      })
      await save(j)
      return {
        ok: true,
        kind: 'cover',
        message: '已设为项目封面，三维几何保持不变',
      }
    }
    const { client: c, transport } = createMcpSession()
    try {
      await c.connect(transport)
      await c.callTool({ name: 'load_scene', arguments: { id: sceneId } })
      let result
      if (r.kind === 'material') {
        if (!s.graph.nodes[b.targetId]) throw Error('目标已不存在')
        const maps = Object.fromEntries(
            Object.entries(r.mapUrls).map(([k, v]) => [
              k,
              v.startsWith('/') ? publicUrl(v) : v,
            ]),
          ),
          texture = {
            url: maps.baseColor,
            repeat: [
              1 / j.settings.tileSizeMeters,
              1 / j.settings.tileSizeMeters,
            ],
            ...(maps.normal ? { normalMap: maps.normal, normalScale: 1 } : {}),
            ...(maps.roughness ? { roughnessMap: maps.roughness } : {}),
            ...(maps.ao ? { aoMap: maps.ao } : {}),
            ...(maps.metalness ? { metalnessMap: maps.metalness } : {}),
            ...(maps.height
              ? {
                  bumpMap: maps.height,
                  bumpScale: 0.003,
                  displacementMap: maps.height,
                  displacementScale: 0,
                }
              : {}),
          }
        const material = {
          preset: 'custom',
          properties: {
            color: '#ffffff',
            roughness: maps.roughness ? 1 : j.settings.roughness,
            metalness: maps.metalness ? 1 : j.settings.metalness,
          },
          texture,
        }
        result =
          s.graph.nodes[b.targetId].type === 'zone'
            ? await c.callTool({
                name: 'set_zone_intent',
                arguments: {
                  zoneId: b.targetId,
                  patch: { floor: { finish: material } },
                },
              })
            : await c.callTool({
                name: 'paint',
                arguments: {
                  targets: [b.targetId],
                  role: b.role || 'a',
                  material,
                },
              })
      } else {
        const levelId = b.levelId
        if (s.graph.nodes[levelId]?.type !== 'level')
          throw Error('请选择目标楼层')
        const beyond = Object.fromEntries(
          [
            'textiles',
            'light',
            'windows',
            'walls',
            'floor',
            'plants',
            'objects',
            'smallFurniture',
          ].map((k) => [
            k,
            { none: 'Only the requested generated item, nothing else.' },
          ]),
        )
        const axes = Object.fromEntries(
          [
            'action',
            'size',
            'form',
            'facade',
            'pieces',
            'openings',
            'style',
            'materials',
            'source',
            'dressing',
          ].map((k) => [
            k,
            {
              kind: 'bounded',
              quote:
                'Only place the requested generated catalog item, nothing else.',
              reading: 'Keep the scene unchanged except the requested item',
              ...(k === 'pieces' ? { extent: 'exact' } : {}),
            },
          ]),
        )
        const brief = await c.callTool({
          name: 'design_brief',
          arguments: {
            source: 'catalog',
            sourceQuote: 'use catalog furniture only',
            vision:
              'Place only the selected generated catalog item at the specified location.',
            axes,
            beyond,
          },
        })
        if (brief.isError) throw Error(JSON.stringify(brief.content))
        result = await c.callTool({
          name: 'place_items',
          arguments: {
            levelId,
            items: [
              {
                assetId: 'studio-' + j.id,
                x: Number(b.x) || 0,
                z: Number(b.z) || 0,
                rotation: Number(b.rotation) || 0,
              },
            ],
          },
        })
      }
      if (result.isError) throw Error(JSON.stringify(result.content))
      const snapshot = await c.callTool({ name: 'export_json', arguments: {} })
      await recordEdit(
        sceneId,
        s,
        'studio-apply',
        JSON.parse(snapshot.structuredContent.json),
      )
      j.applications.push({
        sceneId,
        targetId: b.targetId,
        kind: r.kind,
        at: new Date().toISOString(),
      })
      await save(j)
      return { ok: true, result: result.structuredContent || result.content }
    } finally {
      await c.close()
    }
  } finally {
    applyLocks.delete(sceneId)
  }
}
const mime = (name) =>
  name.endsWith('.png')
    ? 'image/png'
    : name.endsWith('.glb')
      ? 'model/gltf-binary'
      : name.endsWith('.zip')
        ? 'application/zip'
        : name.endsWith('.json')
          ? 'application/json'
          : name.endsWith('.py')
            ? 'text/plain'
            : 'application/octet-stream'
const server = createServer(async (req, res) => {
  if (guardWorkerRequest(req, res)) return
  try {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          queue: queue.length,
          running: [...running.keys()],
        }),
      )
      return
    }
    if (req.headers.origin) {
      res.writeHead(403)
      res.end('仅接受本地代理请求')
      return
    }
    const sceneId = u.searchParams.get('sceneId')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(sceneId || '')) throw Error('无效项目ID')
    const action = u.searchParams.get('action') || 'list'
    if (req.method === 'GET') {
      if (action === 'file') {
        const j = await get(u.searchParams.get('jobId'))
        const name = u.searchParams.get('name')
        const allowed = new Set([
          'result.png',
          'preview.png',
          'floorplan.png',
          'floorplan.json',
          ...ORIENTATION_FILES,
          'input.png',
          'raw.png',
          'basecolor.png',
          'normal.png',
          'ao.png',
          'orm.png',
          'roughness.png',
          'metalness.png',
          'height.png',
          'tiled.png',
          'material.zip',
          'model.glb',
          'source.blend',
          'source.py',
          'result.json',
          'manifest.json',
        ])
        if (!allowed.has(name)) throw Error('文件不存在')
        const bytes =
          name === 'manifest.json'
            ? Buffer.from(
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    id: j.id,
                    sceneId: j.sceneId,
                    sceneVersion: j.sceneVersion,
                    name: j.name,
                    type: j.type,
                    prompt: j.prompt,
                    settings: j.settings,
                    createdAt: j.createdAt,
                    startedAt: j.startedAt,
                    finishedAt: j.finishedAt,
                    sourceJobId: j.sourceJobId,
                    capture: j.capture,
                    result: j.result,
                  },
                  null,
                  2,
                ),
              )
            : await readFile(path.join(dir(j.id), name))
        res.setHeader('Content-Type', mime(name))
        res.setHeader('X-Content-Type-Options', 'nosniff')
        if (u.searchParams.get('download') === '1')
          res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
        res.end(bytes)
        return
      }
      res.setHeader('Content-Type', 'application/json')
      if (action === 'config') {
        res.end(JSON.stringify(capabilities()))
        return
      }
      if (action === 'get') {
        res.end(JSON.stringify(await get(u.searchParams.get('jobId'))))
        return
      }
      const jobs = (await list()).filter(
        (j) =>
          j.sceneId === sceneId ||
          (u.searchParams.get('library') === '1' && j.status === 'succeeded'),
      )
      res.end(JSON.stringify({ jobs }))
      return
    }
    let body = ''
    for await (const c of req) {
      body += c
      if (body.length > 30 * 1024 * 1024) throw Error('请求过大')
    }
    const b = body ? JSON.parse(body) : {}
    let result
    if (req.method === 'POST' && action === 'submit') {
      const next = submitTail.catch(() => {}).then(() => submit(sceneId, b))
      submitTail = next
      result = await next
    } else if (req.method === 'POST' && action === 'apply')
      result = await apply(sceneId, b)
    else if(req.method==='POST' && ['orientation','orientation-batch'].includes(action)) {
      const next=submitTail.catch(()=>{}).then(()=>requestOrientation(b));submitTail=next;result=await next
    } else if(req.method==='POST' && action==='orientation-review'){
      const next=submitTail.catch(()=>{}).then(async()=>{
      const j=await get(b.jobId);if(j.status!=='succeeded'||j.result?.kind!=='model'||running.has(j.id)||queue.some(q=>(typeof q==='string'?q:q.id)===j.id))throw Error('请等识别任务完成后复核')
      const record=await reviewOrientation(j,b);await orientationResult(j,record);await publishCloudAssets(j,new AbortController().signal)
      if(j.orientationTask){j.orientationTask.status='succeeded';j.orientationTask.phase='资产人工确认完成';delete j.orientationTask.error}
      await save(j);return j
      });submitTail=next;result=await next
    } else if(req.method==='POST' && action==='orientation-cancel'){
      const j=await get(b.jobId);if(j.orientationTask?.status==='running')running.get(j.id)?.abort();else if(j.orientationTask?.status==='queued'){j.orientationTask.status='cancelled';j.orientationTask.phase='朝向识别已取消';await save(j)}result=j
    }
    else if (req.method === 'POST' && action === 'cancel') {
      const j = await get(b.jobId)
      if (j.sceneId !== sceneId) throw Error('不能取消其他项目的任务')
      if (j.status === 'running') running.get(j.id)?.abort()
      else if (j.status === 'queued') {
        j.status = 'cancelled'
        j.phase = '已取消'
        await save(j)
      }
      result = await get(j.id)
    } else if (req.method === 'POST' && action === 'retry') {
      const j = await get(b.jobId)
      if (
        j.sceneId !== sceneId ||
        !['failed', 'interrupted', 'cancelled'].includes(j.status)
      )
        throw Error('该任务不需要重试')
      j.status = 'queued'
      j.phase = '等待继续'
      delete j.error
      await save(j)
      queue.push(j.id)
      void drain()
      result = j
    } else throw Error('不支持的操作')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 400, {
      'Content-Type': 'application/json',
    })
    res.end(JSON.stringify({ error: e.message || String(e) }))
  }
})
server.listen(Number(process.env.STUDIO_PORT || 18082), '127.0.0.1', () =>
  console.log('Local Studio listening http://127.0.0.1:' + (process.env.STUDIO_PORT || 18082)),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    closing = true
    for (const c of running.values()) c.abort()
    server.close()
    setTimeout(() => process.exit(0), 6000).unref()
  })
