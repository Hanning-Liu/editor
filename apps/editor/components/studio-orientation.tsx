'use client'

import { useEffect, useState } from 'react'

export type OrientationSnapshot = {
  status: 'accepted' | 'needs_review' | 'symmetric'
  source: string
  modelSha256: string
  recordHash: string
  frontLocal?: number[]
  reason: string
  frontRole: string
  category: string
}
export type OrientationDetails = {
  views: { id: number; url: string; frontLocal: number[]; yawDegrees: number }[]
  reason: string
}
export type OrientationTask = { status: string; phase: string; error?: string }
const button =
  'rounded-md border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-40'
export function StudioOrientation({
  jobId,
  orientation,
  details,
  task,
  busy,
  onAction,
  onPreview,
}: {
  jobId: string
  orientation?: OrientationSnapshot
  details?: OrientationDetails
  task?: OrientationTask
  busy: boolean
  onAction: (action: string, body: Record<string, unknown>) => Promise<void>
  onPreview: (front: number[] | null) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => {
    setSelected(null)
    onPreview(null)
  }, [onPreview])
  const active = task && ['queued', 'running'].includes(task.status)
  const labels = { accepted: '正面已确定', needs_review: '需要复核', symmetric: '没有唯一正面' }
  const source =
    orientation?.source === 'asset_user_confirmed'
      ? '资产人工确认'
      : orientation?.source === 'generator_verified'
        ? '生成声明已通过视觉复核'
        : '本地 VLM 估计'
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-label="家具正面朝向">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          家具正面 · {orientation ? labels[orientation.status] : '尚未识别'}
        </p>
        <button
          className={button}
          disabled={busy || !!active}
          onClick={() => void onAction('orientation', { jobId, force: !!orientation })}
        >
          {orientation ? '重新识别正面' : '识别正面'}
        </button>
      </div>
      {active && (
        <p role="status" className="text-sm">
          {task.phase}
        </p>
      )}
      {active && (
        <button
          className={button}
          disabled={busy}
          onClick={() => void onAction('orientation-cancel', { jobId })}
        >
          取消朝向识别
        </button>
      )}
      {task?.error && <p className="text-xs text-red-400">{task.error}</p>}
      {orientation && (
        <>
          <p className="text-xs text-muted-foreground">
            {source} · {orientation.category} · {orientation.frontRole}
          </p>
          {orientation.frontLocal && (
            <p className="text-xs">
              模型本地前向：({orientation.frontLocal.map((v) => Number(v.toFixed(3))).join(', ')}) ·
              紫色箭头
            </p>
          )}
          <p className="text-xs text-muted-foreground">{orientation.reason}</p>
          {orientation.status === 'needs_review' && (
            <p className="text-xs text-amber-400">
              此结果不会用于自动选墙。请选择下方最正对家具正面的视图，或确认无唯一正面。
            </p>
          )}
          {orientation.status === 'symmetric' && (
            <p className="text-xs text-muted-foreground">
              相对编辑需明确世界坐标，或为具体实例设置使用方向。
            </p>
          )}
        </>
      )}
      {selected !== null && (
        <p className="text-xs text-violet-400">箭头预览为所选方向，点击保存后生效。</p>
      )}
      {!!details?.views?.length && (
        <>
          <p className="text-xs">
            复核：选择从哪一侧看是家具正面。只保存朝向属性，模型和实例位置保持不变。
          </p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="朝向复核视图">
            {details.views.map((view) => (
              <button
                key={view.id}
                aria-label={`将视图 V${view.id} 设为家具正面`}
                aria-pressed={selected === view.id}
                className={`overflow-hidden rounded-lg border text-xs ${selected === view.id ? 'border-violet-400' : 'border-border'}`}
                disabled={busy || !!active}
                onClick={() => {
                  setSelected(view.id)
                  onPreview(view.frontLocal)
                }}
              >
                <img
                  src={view.url}
                  alt={`朝向视图 V${view.id}`}
                  className="w-full object-contain"
                />
                V{view.id} · {Math.round(view.yawDegrees)}°
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={busy || !!active || selected === null || !orientation}
              onClick={() =>
                void onAction('orientation-review', {
                  jobId,
                  expectedRecordHash: orientation?.recordHash,
                  expectedModelSha256: orientation?.modelSha256,
                  status: 'accepted',
                  viewId: selected,
                })
              }
            >
              保存所选正面
            </button>
            <button
              className={button}
              disabled={busy || !!active || !orientation}
              onClick={() =>
                void onAction('orientation-review', {
                  jobId,
                  expectedRecordHash: orientation?.recordHash,
                  expectedModelSha256: orientation?.modelSha256,
                  status: 'symmetric',
                })
              }
            >
              确认没有唯一正面
            </button>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        资产识别可复用于多个实例；实例的手动正面修正始终优先。
      </p>
    </section>
  )
}
