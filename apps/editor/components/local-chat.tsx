'use client'

import {
  BookOpen,
  Brain,
  ChevronDown,
  Paperclip,
  Puzzle,
  RefreshCw,
  Send,
  Square,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Attachment = { id: string; name: string; mime: string; size: number; note?: string }
type Message = {
  origin?: string
  actor?: string
  status?: string
  at?: string
  notice?: string
  details?: string
  role: string
  content: string
  error?: boolean
  attachments?: Attachment[]
  modelId?: string
  effort?: string
}
type Step = {
  type: string
  callId?: string
  actor?: string
  status?: string
  at?: string
  runId?: string
  text?: string
  name?: string
  state?: string
  args?: unknown
  result?: unknown
  context?: Context
  latest?: Usage
  totals?: Totals
}
type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}
type Totals = {
  input: number
  output: number
  cached: number
  reasoning: number
  calls: number
  cachedReported: boolean
  reasoningReported: boolean
}
type Preferences = { modelId: string; effort: string; plugins: string[]; toolsetVersion?: number }
type Config = {
  models: {
    id: string
    label: string
    model: string
    available: boolean
    loaded: boolean
    vision: boolean
    thinking: boolean
    contextLimit?: number
    contextLimitSource?: string
  }[]
  plugins: { id: string; name: string; description: string; required?: boolean; tools: string[] }[]
  efforts: {
    id: string
    name: string
    description: string
    maxTokens: number
    enableThinking: boolean
  }[]
  reasoningNote: string
}
type Context = {
  scene?: { id: string; version: number; nodeCount: number; counts: Record<string, number> }
  tools?: string[]
  loadedTools?: string[]
  plugins?: string[]
  attachments?: Attachment[]
  historyMessages?: number
  at?: string
  totals?: Totals
  latest?: { usage?: Usage }
}
const num = (v?: number) => (typeof v === 'number' ? v.toLocaleString() : '未报告')
const chip =
  'inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs hover:bg-accent disabled:opacity-40'

function mergeSteps(events: Step[]) {
  const out: Step[] = []
  for (const event of events) {
    if (event.callId) {
      const index = out.findIndex((e) => e.callId === event.callId)
      if (index >= 0) out[index] = event
      else out.push(event)
    } else if (event.state !== 'running') out.push(event)
  }
  return out
}

export function LocalChat({ sceneId }: { sceneId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [showTests, setShowTests] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestAccepted, setRequestAccepted] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [status, setStatus] = useState('正在加载对话…')
  const [ready, setReady] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const [prefs, setPrefs] = useState<Preferences>({
    modelId: 'qwen38',
    effort: 'fast',
    plugins: ['rooms', 'roofs', 'furniture', 'inspect'],
  })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [panel, setPanel] = useState<'plugins' | 'model' | 'context' | null>(null)
  const [context, setContext] = useState<Context>({})
  const [totals, setTotals] = useState<Totals | null>(null)
  const [latest, setLatest] = useState<Usage | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const controller = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const prefsSaving = useRef(false)
  const url = `/api/local-chat?sceneId=${encodeURIComponent(sceneId)}`
  const current = config?.models.find((m) => m.id === prefs.modelId)
  const effort = config?.efforts.find((e) => e.id === prefs.effort)

  useEffect(() => {
    let disposed = false
    setReady(false)
    setAttachments([])
    setInput('')
    setPanel(null)
    void fetch(`${url}&action=config`)
      .then(async (r) => {
        if (!r.ok) throw Error(await r.text())
        const c = await r.json()
        if (!disposed) setConfig(c)
      })
      .catch((e) => {
        if (!disposed) setStatus(`配置加载失败：${e}`)
      })
    async function load() {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const h = await res.json()
        if (disposed || controller.current || prefsSaving.current) return
        setMessages(h.messages)
        setSteps(
          mergeSteps((h.currentEvents || h.events).filter((e: Step) => e.type === 'tool')).slice(
            -20,
          ),
        )
        setBusy(h.running)
        setPrefs(h.preferences)
        setTotals(h.totals)
        setLatest(h.calls?.at(-1)?.usage || null)
        setContext(h.context || {})
        setStatus(h.running ? '任务在后台运行，刷新或切换页面不会停止。' : '就绪 · 当前场景')
        setReady(true)
      } catch (e) {
        if (!disposed) setStatus(`连接失败：${e}`)
      }
    }
    void load()
    const timer = setInterval(() => {
      if (!controller.current && !prefsSaving.current) void load()
    }, 4000)
    return () => {
      disposed = true
      clearInterval(timer)
      controller.current?.abort()
      controller.current = null
    }
  }, [url])

  // New transcript entries and execution events reveal the latest message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when visible transcript data changes
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, steps, status])

  async function updatePrefs(next: Preferences) {
    if (prefsSaving.current) return
    const previous = prefs
    setPrefs(next)
    prefsSaving.current = true
    setSavingPrefs(true)
    try {
      const res = await fetch(`${url}&action=preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw Error(await res.text())
      setPrefs(await res.json())
    } catch (e) {
      setPrefs(previous)
      setStatus(`设置保存失败：${e}`)
    } finally {
      prefsSaving.current = false
      setSavingPrefs(false)
    }
  }
  async function inspectContext() {
    setPanel(panel === 'context' ? null : 'context')
    try {
      const res = await fetch(`${url}&action=context`)
      if (!res.ok) throw Error(await res.text())
      const c = await res.json()
      setContext(c)
      setTotals(c.totals)
      setLatest(c.latest?.usage || null)
    } catch (e) {
      setStatus(`上下文读取失败：${e}`)
    }
  }
  async function uploadFiles(files: FileList | File[]) {
    if (busy || uploading) return
    if (attachments.length + files.length > 4) {
      setStatus('每条消息最多4个附件')
      return
    }
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) throw Error('单个附件不得超过8 MB')
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const res = await fetch(`${url}&action=upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, base64: data }),
        })
        if (!res.ok) throw Error(await res.text())
        const meta = await res.json()
        setAttachments((a) => [...a, meta])
      }
      setStatus('附件已添加，发送后交给所选模型读取。')
    } catch (e) {
      setStatus(`附件添加失败：${e}`)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  async function send() {
    if (
      (!input.trim() && !attachments.length) ||
      busy ||
      uploading ||
      !ready ||
      prefsSaving.current
    )
      return
    const text = input.trim() || '请分析附件。',
      sent = attachments
    setInput('')
    setAttachments([])
    setBusy(true)
    setRequestAccepted(false)
    setSteps([])
    setPanel(null)
    setMessages((m) => [...m, { role: 'user', content: text, attachments: sent }])
    const abort = new AbortController()
    controller.current = abort
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attachments: sent.map((a) => a.id),
          preferences: prefs,
        }),
        signal: abort.signal,
      })
      if (!res.ok) throw Error(await res.text())
      setRequestAccepted(true)
      const reader = res.body!.getReader(),
        decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const line of lines) {
          if (!line) continue
          const e = JSON.parse(line) as Step
          if (e.type === 'status') setStatus(e.text!)
          if (e.type === 'tool') {
            setSteps((s) => mergeSteps([...s, e]))
            setStatus(`${e.name} · ${e.state}`)
          }
          if (e.type === 'context') setContext(e.context!)
          if (e.type === 'usage') {
            setLatest(e.latest || null)
            setTotals(e.totals || null)
          }
          if (['reply', 'error', 'stopped'].includes(e.type))
            setMessages((m) => [
              ...m,
              {
                role: 'assistant',
                content: e.text!,
                error: e.type === 'error',
                actor: e.actor,
                status: e.status,
                at: e.at,
                modelId: prefs.modelId,
                effort: prefs.effort,
              },
            ])
          if (e.type === 'complete') setStatus('就绪 · 当前场景')
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setStatus('连接已断开，任务可能仍在后台运行；正在恢复状态。')
        setAttachments(sent)
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy(false)
      }
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      data-testid="local-chat"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">本地 AI</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {current?.label || 'Qwen3.8'} · {effort?.name || '快速'} · 目录家具与自定义建模
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
        {!messages.length && (
          <p className="text-sm text-muted-foreground">
            描述房间或家具布局，也可以附上户型图、PDF 或设计说明。
          </p>
        )}
        {!!messages.filter((m) => m.origin === 'development-test').length && (
          <div className="mb-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <p>早期开发验收记录已折叠，包含测试中断和旧版报错，不属于你的操作。</p>
            <button
              type="button"
              className="mt-2 underline"
              aria-expanded={showTests}
              onClick={() => setShowTests((v) => !v)}
            >
              {showTests ? '收起' : '查看'}开发验收记录（
              {messages.filter((m) => m.origin === 'development-test').length}条）
            </button>
          </div>
        )}
        {messages
          .filter((m) => showTests || m.origin !== 'development-test')
          .map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`mb-3 whitespace-pre-wrap break-words rounded-xl p-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-accent' : m.error ? 'border border-red-500/40' : 'border border-border'}`}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {m.role === 'user'
                  ? '你'
                  : `${m.actor === 'system' ? '系统' : config?.models.find((x) => x.id === m.modelId)?.label || 'Qwen'}${m.effort ? ` · ${config?.efforts.find((x) => x.id === m.effort)?.name || m.effort}` : ''}`}
              </div>
              {m.at && (
                <div className="mb-2 text-[10px] text-muted-foreground">
                  {new Date(m.at).toLocaleString('zh-CN')}
                </div>
              )}
              {m.notice && (
                <p className="mb-2 rounded bg-accent p-2 text-xs text-muted-foreground">
                  {m.notice}
                </p>
              )}
              {m.content}
              {m.details && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary>技术诊断</summary>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all">
                    {m.details}
                  </pre>
                </details>
              )}
              {!!m.attachments?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`${url}&action=asset&ref=${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <Paperclip className="mr-1 inline size-3" />
                      {a.name}
                      {a.mime.startsWith('image/') && (
                        <img
                          src={`${url}&action=asset&ref=${a.id}`}
                          alt={a.name}
                          className="mt-1 max-h-24 max-w-full rounded"
                        />
                      )}
                      {a.note && <span className="block text-muted-foreground">{a.note}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        <div role="group" aria-label="生成的文件" className="my-2 flex flex-wrap gap-2">
          {steps.flatMap((step) => {
            if (step.state !== 'done' || !['export_json', 'export_glb'].includes(step.name || ''))
              return []
            const result = step.result as {
              file?: { url: string; name: string }
              url?: string
              name?: string
            }
            const file =
              result.file ||
              (result.url ? { url: result.url, name: result.name || 'scene.glb' } : null)
            return file
              ? [
                  <a key={file.url} href={file.url} download className={chip}>
                    下载 {file.name}
                  </a>,
                ]
              : []
          })}
        </div>
        {!!steps.length && (
          <details className="my-3 rounded-lg border border-border p-2 text-xs" open={busy}>
            <summary>执行记录 · {steps.filter((s) => s.state === 'done').length} 步完成</summary>
            {steps.map((s, i) => (
              <details key={`${i}-${s.name}`} className="mt-2">
                <summary>
                  {s.state === 'done' ? '✓' : s.state === 'error' ? '×' : '…'} {s.name}
                </summary>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                  {JSON.stringify({ args: s.args, result: s.result }, null, 2)}
                </pre>
                {(() => {
                  const r = s.result as
                    | {
                        images?: { id: string; name: string }[]
                        file?: { url: string; name: string }
                        url?: string
                        name?: string
                      }
                    | undefined
                  const file =
                    r?.file ||
                    (s.name === 'export_glb' && r?.url
                      ? { url: r.url, name: r.name || 'scene.glb' }
                      : null)
                  return (
                    <>
                      {r?.images?.map((im) => (
                        <a
                          key={im.id}
                          href={`${url}&action=asset&ref=${im.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={`${url}&action=asset&ref=${im.id}`}
                            alt={im.name}
                            className="my-2 max-h-48 rounded"
                          />
                        </a>
                      ))}
                      {file && (
                        <a href={file.url} className="my-2 block underline">
                          下载 {file.name}
                        </a>
                      )}
                    </>
                  )
                })()}
              </details>
            ))}
          </details>
        )}
        <div ref={bottom} />
      </div>
      <div className="relative border-t border-border p-3 pb-12">
        {panel && (
          <div
            className="absolute bottom-full left-2 right-2 z-30 mb-2 max-h-[65vh] overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-2xl"
            data-testid={`chat-${panel}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-sm">
                {panel === 'plugins' ? '工具插件' : panel === 'model' ? '模型与推理' : '上下文详情'}
              </strong>
              <button type="button" aria-label="关闭设置" onClick={() => setPanel(null)}>
                <X className="size-4" />
              </button>
            </div>
            {panel === 'plugins' && (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  正常建模工具默认开放，Qwen
                  按任务自主加载。取消勾选可限制对应能力。场景读取始终可用。
                </p>
                {config?.plugins.map((p) => (
                  <label
                    key={p.id}
                    className="mb-2 flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3"
                  >
                    <input
                      type="checkbox"
                      aria-label={p.name}
                      disabled={busy || savingPrefs || p.required}
                      checked={prefs.plugins.includes(p.id)}
                      onChange={(e) =>
                        void updatePrefs({
                          ...prefs,
                          plugins: e.target.checked
                            ? [...prefs.plugins, p.id]
                            : prefs.plugins.filter((id) => id !== p.id),
                        })
                      }
                    />
                    <span>
                      <span className="text-sm">{p.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {p.description}
                      </span>
                    </span>
                  </label>
                ))}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  这些是本地 Chat 工具插件；第三方场景插件仍在 Pascal 的 Plugins 面板管理。
                </p>
              </>
            )}
            {panel === 'model' && (
              <>
                <label className="text-xs">
                  对话模型
                  <select
                    aria-label="对话模型"
                    className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    disabled={busy || savingPrefs}
                    value={prefs.modelId}
                    onChange={(e) =>
                      void updatePrefs({
                        ...prefs,
                        modelId: e.target.value,
                        effort: config?.models.find((m) => m.id === e.target.value)?.thinking
                          ? prefs.effort
                          : 'fast',
                      })
                    }
                  >
                    {config?.models.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.available}>
                        {m.label}
                        {!m.available ? ' · 未连接' : m.loaded ? ' · 已加载' : ' · 未加载'}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="my-2 text-xs text-muted-foreground">
                  {current?.vision ? '支持图片与文本' : '仅支持文本'} · 已配置{' '}
                  {config?.models.length || 0} 个模型
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs">
                  <Brain className="size-4" />
                  推理强度
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {config?.efforts.map((e) => (
                    <button
                      type="button"
                      aria-label={`推理强度：${e.name}`}
                      aria-pressed={prefs.effort === e.id}
                      key={e.id}
                      disabled={busy || savingPrefs || (!current?.thinking && e.id !== 'fast')}
                      className={`rounded-md px-2 py-2 text-xs disabled:opacity-40 ${prefs.effort === e.id ? 'bg-background shadow' : ''}`}
                      onClick={() => void updatePrefs({ ...prefs, effort: e.id })}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs">{effort?.description}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">{config?.reasoningNote}</p>
              </>
            )}
            {panel === 'context' && (
              <>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span>仅本地推理 · 不消耗 Pascal credits</span>
                  <button
                    type="button"
                    aria-label="刷新上下文"
                    onClick={() => {
                      void fetch(`${url}&action=context`)
                        .then((r) => r.json())
                        .then((c) => {
                          setContext(c)
                          setTotals(c.totals)
                          setLatest(c.latest?.usage || null)
                        })
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <dt>最近一次模型输入</dt>
                  <dd className="text-right">{num(latest?.prompt_tokens)} tokens</dd>
                  <dt>所选模型配置上限</dt>
                  <dd className="text-right">{num(current?.contextLimit)} tokens</dd>
                  <dt>累计输入</dt>
                  <dd className="text-right">{num(totals?.input)}</dd>
                  <dt>其中缓存</dt>
                  <dd className="text-right">
                    {totals?.cachedReported ? num(totals.cached) : '未报告'}
                  </dd>
                  <dt>累计输出</dt>
                  <dd className="text-right">{num(totals?.output)}</dd>
                  <dt>其中推理</dt>
                  <dd className="text-right">
                    {totals?.reasoningReported ? num(totals.reasoning) : '未报告'}
                  </dd>
                  <dt>模型调用</dt>
                  <dd className="text-right">{num(totals?.calls)}</dd>
                  <dt>历史消息进入上下文</dt>
                  <dd className="text-right">{context.historyMessages ?? 0} 条</dd>
                  <dt>可发现工具</dt>
                  <dd className="text-right">{context.tools?.length ?? 0} 个</dd>
                  <dt>已加载参数定义</dt>
                  <dd className="text-right">{context.loadedTools?.length ?? 0} 个</dd>
                </dl>
                <p className="mt-3 text-[10px] text-muted-foreground">
                  {current?.contextLimitSource}
                  。累计输入包含每次调用重复提交的上下文；缓存属于输入，推理属于输出。旧版本调用未计入。
                </p>
                <div className="mt-3 border-t border-border pt-3 text-xs">
                  <strong>当前场景 · 版本 {context.scene?.version ?? '—'}</strong>
                  <p className="mt-1 break-all font-mono text-[10px]">{sceneId}</p>
                  <p className="mt-2">{context.scene?.nodeCount ?? '—'} 个节点</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {Object.entries(context.scene?.counts || {}).map(([kind, n]) => (
                      <span key={kind}>
                        {(
                          {
                            site: '场地',
                            building: '建筑',
                            level: '楼层',
                            wall: '墙',
                            zone: '房间',
                            door: '门',
                            window: '窗',
                            item: '家具',
                            slab: '楼板',
                            ceiling: '天花',
                            roof: '屋顶',
                          } as Record<string, string>
                        )[kind] || kind}{' '}
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
                <details className="mt-3 text-xs">
                  <summary>工具与附件清单</summary>
                  <p className="mt-2 break-all">{context.tools?.join(', ') || '尚无执行记录'}</p>
                  {context.attachments?.map((a) => (
                    <p className="mt-1" key={a.id}>
                      {a.name}
                    </p>
                  ))}
                </details>
              </>
            )}
          </div>
        )}
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {status}
        </p>
        {!!attachments.length && (
          <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"
              >
                <Paperclip className="size-3" />
                <span className="max-w-40 truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`移除附件 ${a.name}`}
                  disabled={busy}
                  onClick={() => setAttachments((s) => s.filter((x) => x.id !== a.id))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void uploadFiles(e.dataTransfer.files)
          }}
        >
          <textarea
            aria-label="给本地 AI 的指令"
            className="min-h-20 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-violet-400"
            placeholder="描述修改，或拖入参考图片／PDF…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!ready || busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <input
            ref={fileInput}
            aria-label="选择附件"
            type="file"
            className="hidden"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.json,.csv"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files)
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={chip}
              aria-label="插件"
              title="工具插件"
              disabled={!config || busy}
              onClick={() => setPanel(panel === 'plugins' ? null : 'plugins')}
            >
              <Puzzle className="size-4" />
              <span className="sr-only">插件</span>
            </button>
            <button
              type="button"
              className={chip}
              aria-label="添加附件"
              title="图片、PDF、文本 · 每个8 MB以内"
              disabled={!ready || busy || uploading || attachments.length >= 4}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              className={chip}
              aria-label="上下文详情"
              title="上下文与用量"
              disabled={!ready}
              onClick={() => void inspectContext()}
            >
              <BookOpen className="size-4" />
            </button>
            <button
              type="button"
              className={`${chip} min-w-0 flex-1 justify-between`}
              aria-label="模型和推理强度"
              disabled={!config || busy}
              onClick={() => setPanel(panel === 'model' ? null : 'model')}
            >
              <span className="truncate">
                {current?.label?.replace(' · 本地', '') || 'Qwen3.8'} · {effort?.name || '快速'}
              </span>
              <ChevronDown className="size-3" />
            </button>
            {busy ? (
              <button
                type="button"
                aria-label="停止"
                disabled={!!controller.current && !requestAccepted}
                className="rounded-lg bg-violet-600 p-2 text-white"
                onClick={async () => {
                  setStatus('正在停止，等待当前操作保存…')
                  try {
                    await fetch(url, { method: 'DELETE' })
                  } finally {
                    controller.current?.abort()
                    setBusy(true)
                  }
                }}
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="发送"
                disabled={
                  !ready || uploading || savingPrefs || (!input.trim() && !attachments.length)
                }
                className="rounded-lg bg-violet-600 p-2 text-white disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {uploading
            ? '正在处理附件…'
            : '刷新或切换页面不会停止任务；点击停止才取消。附件最多4个，PDF读取前3页。'}
        </p>
      </div>
    </section>
  )
}
