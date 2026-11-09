'use client'
import { type AnyNode, deriveSlotId, nodeSlotDeclarations } from '@pascal-app/core'
import { Check, ChevronLeft, Download, ImagePlus, Play, RefreshCw, Square, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

const Preview = dynamic(() => import('./local-studio-preview'), { ssr: false })
type SceneNode = {
  id: string
  name?: string
  type: string
  metadata?: { role?: string }
  boundary?: string
  autoFromWalls?: boolean
  asset?: { src?: string }
  slots?: Record<string, string>
}
type Scene = { version: number; graph: { nodes: Record<string, SceneNode> } }
type Job = {
  id: string
  sceneId: string
  type: string
  name: string
  status: string
  phase: string
  prompt: string
  error?: string
  settings: { roughness: number; metalness: number; tileSizeMeters: number }
  result?: {
    kind: string
    previewUrl: string
    mapUrls?: Record<string, string>
    estimated?: boolean
    floorPlanUrl?: string
    dimensions?: number[]
    faces?: number
    metrics?: { seconds?: number }
    downloads: { name: string; url: string }[]
  }
  applications?: unknown[]
}
type Config = {
  types: { id: string; label: string; engine: string; available: boolean }[]
  pbrNote: string
}
const button =
  'rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40'
const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
const status: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '待继续',
}
export function LocalStudio({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const base = '/api/local-studio?sceneId=' + sceneId
  const [config, setConfig] = useState<Config | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [type, setType] = useState('render'),
    [prompt, setPrompt] = useState(''),
    [name, setName] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [library, setLibrary] = useState(false),
    [sourceJobId, setSourceJobId] = useState(''),
    [input, setInput] = useState<{ name: string; base64: string } | null>(null),
    [scene, setScene] = useState<Scene | null>(null),
    [target, setTarget] = useState(''),
    [role, setRole] = useState('a'),
    [level, setLevel] = useState(''),
    [x, setX] = useState(0),
    [z, setZ] = useState(0),
    [rotation, setRotation] = useState(0)
  const [settings, setSettings] = useState({
    resolution: 768,
    imageStrength: 0.8,
    seed: 41,
    width: 0.8,
    height: 0.8,
    depth: 0.6,
    tileSizeMeters: 1,
    roughness: 0.65,
    metalness: 0,
    normalStrength: 3,
    faceLimit: 50000,
    textureResolution: 1024,
    view: 'exterior',
  })
  const [surfaceOptions, setSurfaceOptions] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null),
    focus = jobs.find((j) => j.id === selected)
  useEffect(() => {
    let live = true
    const node = scene?.graph.nodes[target]
    if (!node) {
      setSurfaceOptions([])
      return
    }
    const native =
      node.type === 'zone'
        ? ['floor']
        : nodeSlotDeclarations(node as AnyNode)?.map((s) => s.slotId) || []
    if (node.type !== 'item') {
      const roles = native.length
        ? native
        : ['roof', 'roof-segment'].includes(node.type)
          ? ['top', 'underside', 'fascia']
          : []
      setSurfaceOptions(roles)
      setRole((r) => (roles.includes(r) ? r : roles[0] || ''))
      return
    }
    setSurfaceOptions([])
    setRole('')
    if (!node.asset?.src) return
    void fetch(node.asset.src)
      .then(async (r) => {
        if (!r.ok) throw Error('模型材质槽读取失败')
        const bytes = await r.arrayBuffer(),
          view = new DataView(bytes)
        if (view.getUint32(0, true) !== 0x46546c67) throw Error('模型不是GLB')
        const gltf = JSON.parse(
          new TextDecoder().decode(bytes.slice(20, 20 + view.getUint32(12, true))),
        )
        const roles = [
          ...new Set<string>(
            (gltf.materials || [])
              .map((m: { name?: string }) => deriveSlotId(m.name || ''))
              .filter(Boolean),
          ),
        ]
        if (live) {
          setSurfaceOptions(roles)
          setRole(roles[0] || '')
        }
      })
      .catch(() => {
        if (live) setNotice('暂时无法读取家具表面，请刷新后重试。')
      })
    return () => {
      live = false
    }
  }, [target, scene])
  async function loadScene() {
    const r = await fetch('/api/scenes/' + sceneId)
    if (!r.ok) throw Error(await r.text())
    const s = await r.json()
    setScene(s)
    const nodes = Object.values(s.graph.nodes) as SceneNode[]
    setTarget((v) => (v && s.graph.nodes[v] ? v : nodes.find((n) => n.type === 'wall')?.id || ''))
    setLevel((v) =>
      v && s.graph.nodes[v]
        ? v
        : nodes.find(
            (n) => n.type === 'level' && n.metadata?.role !== 'roof' && !/roof/i.test(n.name || ''),
          )?.id || '',
    )
    return s as Scene
  }
  async function load() {
    const r = await fetch(base + '&library=' + (library ? '1' : '0'))
    if (!r.ok) throw Error((await r.json()).error)
    setJobs((await r.json()).jobs)
  }
  useEffect(() => {
    let live = true
    void fetch(base + '&action=config')
      .then((r) => r.json())
      .then((c) => {
        if (c.error) throw Error(c.error)
        if (live) setConfig(c)
      })
      .catch((e) => setNotice(String(e)))
    void loadScene().catch((e) => setNotice(e.message))
    return () => {
      live = false
    }
  }, [sceneId])
  useEffect(() => {
    void load().catch((e) => setNotice(e.message))
    const t = setInterval(() => void load().catch(() => {}), 2000)
    return () => clearInterval(t)
  }, [sceneId, library])
  async function post(action: string, body: unknown) {
    const r = await fetch(base + '&action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) throw Error(data.error || '请求失败')
    return data
  }
  async function submit() {
    setBusy(true)
    setNotice('')
    try {
      const j = await post('submit', {
        type,
        prompt,
        name,
        settings,
        generationKey: crypto.randomUUID(),
        ...(sourceJobId ? { sourceJobId } : {}),
        ...(input ? { input } : {}),
      })
      setSelected(j.id)
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function act(action: string) {
    if (!focus) return
    setBusy(true)
    try {
      await post(action, { jobId: focus.id })
      await load()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function apply() {
    if (!focus || !scene) return
    setBusy(true)
    setNotice('')
    try {
      const r = await post('apply', {
        jobId: focus.id,
        expectedVersion: scene.version,
        targetId: target,
        role,
        levelId: level,
        x,
        z,
        rotation,
      })
      setNotice(r.message || '已应用到场景，可关闭 Studio 查看；图编辑可在 Chat 中撤销。')
      await loadScene()
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      await loadScene()
    } finally {
      setBusy(false)
    }
  }
  const nodes = Object.values(scene?.graph.nodes || {}),
    targets = nodes.filter(
      (n) =>
        [
          'wall',
          'zone',
          'slab',
          'ceiling',
          'item',
          'roof',
          'roof-segment',
          'column',
          'stair',
        ].includes(n.type) && !(n.type === 'slab' && (n.boundary === 'auto' || n.autoFromWalls)),
    ),
    levels = nodes.filter((n) => n.type === 'level'),
    kind = focus?.result?.kind
  const numberInput = (
    label: string,
    key: keyof typeof settings,
    step: number,
    min: number,
    max: number,
  ) => (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        className={field}
        aria-label={label}
        type="number"
        step={step}
        min={min}
        max={max}
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
      />
    </label>
  )
  return (
    <section
      className="fixed inset-0 z-[80] flex flex-col bg-background text-foreground"
      data-testid="local-studio"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <button className={button} onClick={onClose} aria-label="返回编辑">
          <ChevronLeft className="inline size-4" /> 编辑
        </button>
        <strong>本地 Studio</strong>
        <span className="hidden text-xs text-muted-foreground sm:block">效果图 · 材质 · 模型</span>
        <div className="flex-1" />
        <button
          className={button}
          onClick={() => void loadScene().then(() => load())}
          aria-label="刷新 Studio"
        >
          <RefreshCw className="size-4" />
        </button>
        <button className={button} onClick={onClose} aria-label="关闭 Studio">
          <X className="size-4" />
        </button>
      </header>
      {notice && (
        <div role="status" className="border-b border-border bg-accent px-4 py-2 text-sm">
          {notice}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[320px_1fr_300px]">
        <aside className="space-y-4 border-r border-border p-4">
          <label className="block text-sm">
            生成类型
            <select
              className={field}
              aria-label="Studio 生成类型"
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setSourceJobId('')
                setInput(null)
              }}
            >
              {config?.types.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.available}>
                  {t.label}
                  {!t.available ? '（未就绪）' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {config?.types.find((t) => t.id === type)?.engine}
          </p>
          <input
            className={field}
            placeholder="素材名称（可选）"
            aria-label="Studio 素材名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={field + ' min-h-28'}
            aria-label="Studio 生成描述"
            placeholder={
              type === 'render'
                ? '描述空间氛围、灯光和风格'
                : type === 'material' || type === 'pbr'
                  ? '描述材质、纹理、颜色'
                  : '描述物体形状、结构和材质'
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {['render', 'trellis', 'pbr'].includes(type) && (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Studio 参考图片"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 20 * 1024 * 1024) {
                    setNotice('参考图最多20MB')
                    return
                  }
                  const r = new FileReader()
                  r.onload = () => {
                    setInput({
                      name: f.name,
                      base64: String(r.result).split(',')[1] || '',
                    })
                    setSourceJobId('')
                  }
                  r.readAsDataURL(f)
                }}
              />
              {input && <p className="text-xs">参考图：{input.name}</p>}
              {type === 'render' && !input && (
                <p className="text-xs text-muted-foreground">未上传参考时，捕获当前项目视图。</p>
              )}
              {['pbr', 'trellis'].includes(type) && (
                <select
                  className={field}
                  aria-label="Studio 参考素材"
                  value={sourceJobId}
                  onChange={(e) => {
                    setSourceJobId(e.target.value)
                    setInput(null)
                  }}
                >
                  <option value="">选择已生成素材，或上传图片</option>
                  {jobs
                    .filter(
                      (j) =>
                        j.status === 'succeeded' &&
                        ['image', 'material'].includes(j.result?.kind || ''),
                    )
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
          {type === 'render' && (
            <>
              <div>
                {numberInput('参考保留程度', 'imageStrength', 0.05, 0.5, 0.95)}
                <p className="text-xs text-muted-foreground">
                  较高数值更接近参考图，降低数值可增强风格变化。
                </p>
              </div>
              <label className="block text-xs">
                场景视角
                <select
                  className={field}
                  aria-label="Studio 场景视角"
                  value={settings.view}
                  onChange={(e) => setSettings((s) => ({ ...s, view: e.target.value }))}
                >
                  <option value="exterior">建筑外观</option>
                  <option value="interior">室内俯视</option>
                </select>
              </label>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              分辨率
              <select
                className={field}
                aria-label="Studio 分辨率"
                value={settings.resolution}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    resolution: Number(e.target.value),
                  }))
                }
              >
                {[512, 768, 1024].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {numberInput('随机种子', 'seed', 1, 0, 2147483647)}
          </div>
          {['blender', 'trellis'].includes(type) && (
            <div className="grid grid-cols-3 gap-2">
              {numberInput('宽度m', 'width', 0.1, 0.05, 10)}
              {numberInput('高度m', 'height', 0.1, 0.05, 10)}
              {numberInput('深度m', 'depth', 0.1, 0.05, 10)}
            </div>
          )}
          {type === 'trellis' && (
            <p className="text-xs text-muted-foreground">
              参考图应包含单个物体，背景尽量简洁。按宽度等比例缩放，保留原模型比例；CPU 解码较慢。
            </p>
          )}
          {['material', 'pbr'].includes(type) && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {numberInput('单块铺贴尺寸m', 'tileSizeMeters', 0.1, 0.05, 20)}
                {numberInput('粗糙度', 'roughness', 0.05, 0, 1)}
                {numberInput('金属度', 'metalness', 0.05, 0, 1)}
                {numberInput('法线强度', 'normalStrength', 0.5, 0, 20)}
              </div>
              {type === 'pbr' && <p className="text-xs text-muted-foreground">{config?.pbrNote}</p>}
            </>
          )}
          <button
            className={button + ' w-full bg-primary text-primary-foreground'}
            aria-label="开始 Studio 生成"
            disabled={
              busy || !prompt.trim() || !config?.types.find((t) => t.id === type)?.available
            }
            onClick={() => void submit()}
          >
            <Play className="mr-2 inline size-4" />
            生成
          </button>
          <p className="text-xs text-muted-foreground">
            重型生成任务排队执行。可返回编辑，任务会保留。
          </p>
        </aside>
        <main className="min-w-0 space-y-4 p-4">
          {focus ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{focus.name}</h2>
                <span className="rounded bg-accent px-2 py-1 text-xs">
                  {status[focus.status] || focus.status}
                </span>
              </div>
              <p
                role="status"
                className="text-sm text-muted-foreground"
                aria-label="Studio 任务状态"
              >
                {focus.phase}
              </p>
              {focus.result && (
                <>
                  <img
                    className="max-h-96 w-full rounded-xl object-contain"
                    src={focus.result.previewUrl}
                    alt="Studio 生成结果"
                  />
                  {kind === 'image' && (
                    <p className="text-xs text-muted-foreground">
                      AI 效果图用于视觉参考，可能偏离原始结构；实际尺寸和布局以三维场景为准。
                    </p>
                  )}
                  {kind === 'material' && (
                    <>
                      <Preview
                        key={focus.id}
                        kind="material"
                        url={focus.result.mapUrls?.baseColor || focus.result.previewUrl}
                        maps={focus.result.mapUrls}
                        roughness={focus.settings.roughness}
                        metalness={focus.settings.metalness}
                      />
                      <img
                        className="max-h-72 rounded-xl"
                        src={base + '&action=file&jobId=' + focus.id + '&name=tiled.png'}
                        alt="4×4 平铺预览"
                      />
                      {focus.result.estimated && (
                        <p className="text-xs text-muted-foreground">
                          PBR 由基础纹理估计，可调整；不代表实测材料。
                        </p>
                      )}
                    </>
                  )}
                  {kind === 'model' && (
                    <>
                      <Preview
                        key={focus.id}
                        kind="model"
                        url={base + '&action=file&jobId=' + focus.id + '&name=model.glb'}
                        roughness={0.6}
                        metalness={0}
                      />
                      {focus.result.floorPlanUrl && (
                        <figure className="space-y-2">
                          <figcaption className="text-xs text-muted-foreground">
                            2D 正交俯视图 · 与模型宽深对齐
                          </figcaption>
                          <img
                            src={focus.result.floorPlanUrl}
                            alt="家具2D俯视图"
                            className="max-h-56 max-w-full rounded-lg bg-neutral-200 object-contain"
                          />
                        </figure>
                      )}
                      <p className="text-xs">
                        尺寸：{focus.result.dimensions?.join(' × ')} m ·{' '}
                        {focus.result.faces?.toLocaleString()} 面
                      </p>
                    </>
                  )}
                  <div role="group" className="flex flex-wrap gap-2" aria-label="Studio 下载文件">
                    {focus.result.downloads.map((f) => (
                      <a className={button} key={f.name} href={f.url + '&download=1'} download>
                        <Download className="mr-1 inline size-3" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                </>
              )}
              {focus.error && (
                <details>
                  <summary className="text-sm text-red-400">生成诊断</summary>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {focus.error}
                  </pre>
                </details>
              )}
              {['running', 'queued'].includes(focus.status) && (
                <button
                  className={button}
                  aria-label="取消 Studio 任务"
                  disabled={busy}
                  onClick={() => void act('cancel')}
                >
                  <Square className="mr-1 inline size-3" />
                  取消任务
                </button>
              )}
              {['failed', 'interrupted', 'cancelled'].includes(focus.status) && (
                <button
                  className={button}
                  aria-label="继续 Studio 任务"
                  disabled={busy}
                  onClick={() => void act('retry')}
                >
                  继续 / 重试
                </button>
              )}
              {focus.status === 'succeeded' && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <strong className="text-sm">应用到当前项目</strong>
                  {kind === 'image' ? (
                    <p className="text-xs text-muted-foreground">
                      设为项目封面，三维模型不会随效果图改变。
                    </p>
                  ) : kind === 'material' ? (
                    <>
                      <select
                        className={field}
                        aria-label="材质应用目标"
                        value={target}
                        onChange={(e) => {
                          const id = e.target.value
                          setTarget(id)
                          const t = scene?.graph.nodes[id]?.type
                          setRole(
                            t === 'wall'
                              ? 'a'
                              : t === 'slab' || t === 'ceiling'
                                ? 'surface'
                                : t === 'column'
                                  ? 'shaft'
                                  : '',
                          )
                        }}
                      >
                        {targets.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.type === 'zone' ? (n.name || '房间') + ' · 地面' : n.name || n.type}{' '}
                            · {n.id.slice(-6)}
                          </option>
                        ))}
                      </select>
                      <label className="text-xs">
                        表面
                        <select
                          className={field}
                          aria-label="材质表面"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                        >
                          {surfaceOptions.length ? (
                            surfaceOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))
                          ) : (
                            <option value="">没有可涂装表面</option>
                          )}
                        </select>
                      </label>
                      <p className="text-xs text-muted-foreground">
                        选择具体表面后应用，可返回编辑检查效果。
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        className={field}
                        aria-label="模型目标楼层"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                      >
                        {levels.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name || n.id}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs">
                          X米
                          <input
                            className={field}
                            aria-label="模型放置X"
                            type="number"
                            value={x}
                            onChange={(e) => setX(Number(e.target.value))}
                          />
                        </label>
                        <label className="text-xs">
                          Z米
                          <input
                            className={field}
                            aria-label="模型放置Z"
                            type="number"
                            value={z}
                            onChange={(e) => setZ(Number(e.target.value))}
                          />
                        </label>
                        <label className="text-xs">
                          旋转°
                          <input
                            className={field}
                            aria-label="模型旋转"
                            type="number"
                            value={rotation}
                            onChange={(e) => setRotation(Number(e.target.value))}
                          />
                        </label>
                      </div>
                    </>
                  )}
                  <button
                    className={button}
                    aria-label="应用 Studio 结果"
                    disabled={busy || (kind === 'material' && !role)}
                    onClick={() => void apply()}
                  >
                    <Check className="mr-1 inline size-4" />
                    {kind === 'image'
                      ? '设为项目封面'
                      : kind === 'material'
                        ? '应用材质'
                        : '放置模型'}
                  </button>
                  {kind === 'material' && focus.type !== 'pbr' && (
                    <button
                      className={button + ' ml-2'}
                      aria-label="升级完整 PBR"
                      onClick={() => {
                        setType('pbr')
                        setSourceJobId(focus.id)
                        setPrompt(focus.prompt)
                        setName(focus.name + ' PBR')
                      }}
                    >
                      升级完整 PBR
                    </button>
                  )}
                  {kind === 'image' && (
                    <button
                      className={button + ' ml-2'}
                      onClick={() => {
                        setType('trellis')
                        setSourceJobId(focus.id)
                        setPrompt(focus.prompt)
                      }}
                    >
                      用作图片转3D参考
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              选择任务查看预览、应用或下载
            </div>
          )}
        </main>
        <aside className="space-y-3 border-l border-border p-4">
          <div className="flex items-center justify-between">
            <strong className="text-sm">任务与素材</strong>
            <label className="text-xs">
              <input
                type="checkbox"
                checked={library}
                onChange={(e) => setLibrary(e.target.checked)}
              />{' '}
              全部素材
            </label>
          </div>
          {jobs.map((j) => (
            <button
              key={j.id}
              data-job-id={j.id}
              aria-label={'查看任务 ' + j.name}
              onClick={() => {
                setSelected(j.id)
                void loadScene()
              }}
              className={
                'flex w-full items-center gap-2 rounded-xl border p-2 text-left ' +
                (selected === j.id ? 'border-primary' : 'border-border')
              }
            >
              {j.result ? (
                <img src={j.result.previewUrl} className="size-14 rounded object-cover" alt="" />
              ) : (
                <ImagePlus className="m-3 size-8 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm">{j.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {status[j.status] || j.status} ·{' '}
                  {config?.types.find((t) => t.id === j.type)?.label || j.type}
                </span>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </section>
  )
}
