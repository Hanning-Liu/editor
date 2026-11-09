import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const DATA = path.join(ROOT, 'studio-data')
export const MLX_PY =
  process.env.STUDIO_MLX_PYTHON ||
  '/Users/Bill_Admin/miniforge3/envs/MLX/bin/python'
export const TRELLIS_ROOT =
  process.env.STUDIO_TRELLIS_ROOT ||
  '/Users/Bill_Admin/Research/nnndl/try-mlx-vlm/trellis-mac'
export const BLENDER =
  process.env.STUDIO_BLENDER ||
  '/Applications/Blender.app/Contents/MacOS/Blender'
export const QWEN_URL =
  process.env.LOCAL_QWEN_URL || 'http://127.0.0.1:18080/v1/chat/completions'
export const QWEN_MODEL =
  process.env.LOCAL_QWEN_MODEL || 'mlx-community/Qwen3.8-27B-8bit'
const cache = path.join(
  process.env.HOME,
  '.cache/huggingface/hub/models--black-forest-labs--FLUX.2-klein-9B/snapshots',
)
export const FLUX_PATH =
  process.env.STUDIO_FLUX_PATH ||
  (existsSync(cache)
    ? path.join(cache, readdirSync(cache).filter((n) => !n.startsWith('.'))[0])
    : '')
export function capabilities() {
  return {
    types: [
      {
        id: 'render',
        label: 'AI 效果图',
        engine: 'FLUX.2 Klein 9B · 参考图优先',
        available: existsSync(MLX_PY) && existsSync(FLUX_PATH),
      },
      {
        id: 'material',
        label: '基础无缝材质',
        engine: 'FLUX.2 Klein 9B + 无缝处理',
        available: existsSync(MLX_PY) && existsSync(FLUX_PATH),
      },
      {
        id: 'blender',
        label: 'Qwen＋Blender 模型',
        engine: 'Qwen3.8 27B → bpy',
        available: existsSync(BLENDER),
      },
      {
        id: 'pbr',
        label: '完整 PBR 材质',
        engine: '基础纹理 → 估算 PBR 六张图 + ORM',
        available: existsSync(MLX_PY),
      },
      {
        id: 'trellis',
        label: '图片转 3D',
        engine: 'TRELLIS.2 · Apple Silicon',
        available: existsSync(path.join(TRELLIS_ROOT, '.venv/bin/python')),
      },
    ],
    maxInputBytes: 20 * 1024 * 1024,
    queue: '重型任务串行执行',
    pbrNote:
      '法线、高度、AO 和粗糙度由纹理估计，金属度按参数生成；不代表实测物理属性。',
  }
}
