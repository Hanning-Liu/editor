import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { ROOT, BLENDER } from './config.mjs'
import { dir, fileUrl } from './store.mjs'
export async function ensureFloorplan(
  job,
  run,
  signal,
  onPhase = async () => {},
) {
  const d = dir(job.id),
    hash = createHash('sha256')
      .update(await readFile(path.join(d, 'model.glb')))
      .digest('hex')
  let metadata
  try {
    const m = JSON.parse(await readFile(path.join(d, 'floorplan.json'), 'utf8'))
    if (
      m.projectionVersion === 2 &&
      m.modelSha256 === hash &&
      (await stat(path.join(d, 'floorplan.png'))).size > 0
    )
      metadata = m
  } catch {}
  if (!metadata) {
    await onPhase('正在生成与模型尺寸对齐的 2D 正交俯视图')
    await run(
      BLENDER,
      [
        '--background',
        '--factory-startup',
        '--python-exit-code',
        '1',
        '--python',
        path.join(ROOT, 'studio/floorplan_worker.py'),
        '--',
        path.join(d, 'job.json'),
        JSON.stringify(job.result.dimensions),
      ],
      job,
      signal,
      onPhase,
      { timeout: 300000 },
    )
    metadata = JSON.parse(
      await readFile(path.join(d, 'floorplan.json'), 'utf8'),
    )
  }
  if (metadata.modelSha256 !== hash) throw Error('俯视图生成期间模型文件已变化')
  return {
    floorPlan: 'floorplan.png',
    floorPlanUrl:
      fileUrl(job, 'floorplan.png') + '&v=' + hash.slice(0, 12) + '-2',
    projection: metadata,
  }
}
