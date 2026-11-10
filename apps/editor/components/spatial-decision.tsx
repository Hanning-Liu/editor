'use client'

type Decision = {
  kind?: string
  status?: string
  message?: string
  referenceDescription?: string
  relation?: string
  subject?: { name?: string; id?: string }
  orientation?: { evidence?: string; source?: string }
  originLevel?: number[]
  directions?: Record<string, { world: number[]; level: number[] }>
  candidates?: {
    wallId: string
    name: string
    eligible: boolean
    reason: string
    rayDistanceM: number | null
  }[]
  selection?: { name?: string; wallId?: string; reason?: string }
  editTool?: string
  toolParameters?: unknown
}
const names: Record<string, string> = { front: '前方', back: '后方', left: '左侧', right: '右侧' }
const vector = (v?: number[]) => v?.map((x) => Number(x.toFixed(3))).join(', ')

export function SpatialDecision({
  value,
  parameters,
  rejected,
}: {
  value: unknown
  parameters?: unknown
  rejected?: boolean
}) {
  const d = value as Decision | undefined
  if (!d || !['spatial_reference', 'relative_wall_decision'].includes(d.kind || '')) return null
  return (
    <section
      aria-label="家具方位决策"
      className={`my-2 space-y-2 rounded-md border p-3 text-xs ${rejected || d.status !== 'resolved' ? 'border-red-500/60' : 'border-violet-400/50'}`}
    >
      <p className="font-medium">
        {d.subject?.name || d.subject?.id} · {names[d.relation || ''] || '朝向'}
        {d.selection ? ` → ${d.selection.name}` : ''}
      </p>
      <p>参照系：{d.referenceDescription || '尚未确定'}</p>
      {d.orientation && <p>正面依据：{d.orientation.evidence || d.orientation.source}</p>}
      {d.originLevel && <p>家具锚点 X/Z：({vector(d.originLevel)}) 米</p>}
      {d.directions && (
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(d.directions).map(([k, v]) => (
            <p key={k}>
              {names[k]} · 世界 ({vector(v.world)})
            </p>
          ))}
        </div>
      )}
      {d.candidates && (
        <div role="group" className="space-y-2 border-t border-border pt-2" aria-label="候选墙">
          {d.candidates.map((c) => (
            <div key={c.wallId}>
              <p className={c.wallId === d.selection?.wallId ? 'font-medium text-violet-400' : ''}>
                {c.wallId === d.selection?.wallId ? '选中' : '排除'} · {c.name}
                {c.rayDistanceM !== null ? ` · ${c.rayDistanceM.toFixed(2)} 米` : ''}
              </p>
              <p className="text-muted-foreground">{c.reason}</p>
            </div>
          ))}
        </div>
      )}
      {d.selection?.reason && <p>选择依据：{d.selection.reason}</p>}
      {rejected && <p className="text-red-400">该次编辑已拒绝，未执行这些参数。</p>}
      {d.message && <p className="text-muted-foreground">{d.message}</p>}
      {Boolean(d.toolParameters || parameters) && (
        <div>
          <p>
            {rejected ? '被拒绝的' : '实际提交的'}工具参数{d.editTool ? ` · ${d.editTool}` : ''}
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px]">
            {JSON.stringify(d.toolParameters || parameters, null, 2)}
          </pre>
        </div>
      )}
    </section>
  )
}
