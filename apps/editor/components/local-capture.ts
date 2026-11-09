'use client'

import { emitter, type SnapshotCapturedEvent, type ThumbnailGenerateEvent } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useEffect } from 'react'

// This bridge exists only in the isolated renderer page, never in the user's editing tab.
export function useLocalCapture(sceneId: string, rendering: boolean, projectId: string) {
  useEffect(() => {
    if (!rendering) return
    const capture = (input: Omit<ThumbnailGenerateEvent, 'projectId'>) =>
      new Promise<{ base64: string; width: number; height: number; presentation?: unknown }>(
        (resolve, reject) => {
          const requestId = crypto.randomUUID()
          const cleanup = () => {
            clearTimeout(timer)
            emitter.off('snapshot:captured', done)
            emitter.off('snapshot:capture-failed', failed)
          }
          const done = (event: SnapshotCapturedEvent) => {
            if (event.requestId !== requestId) return
            cleanup()
            const reader = new FileReader()
            reader.onload = () =>
              resolve({
                base64: String(reader.result).split(',')[1] || '',
                width: event.width,
                height: event.height,
                presentation: event.presentation,
              })
            reader.onerror = () => reject(Error('图片读取失败'))
            reader.readAsDataURL(event.blob)
          }
          const failed = (event: { requestId: string; error: string }) => {
            if (event.requestId !== requestId) return
            cleanup()
            reject(Error(event.error))
          }
          const timer = setTimeout(() => {
            cleanup()
            reject(Error('渲染超时'))
          }, 45000)
          emitter.on('snapshot:captured', done)
          emitter.on('snapshot:capture-failed', failed)
          emitter.emit('camera-controls:generate-thumbnail', {
            ...input,
            projectId,
            requestId,
            ephemeral: true,
          })
        },
      )
    const exportGlb = async () => {
      const exporter = useEditor.getState().modelExport
      if (!exporter) throw Error('GLB 导出器未就绪')
      const artifact = await exporter('glb', {
        download: false,
        onlyVisible: false,
        textures: 'reference',
        timeoutMs: 60000,
      })
      if (!artifact) throw Error('GLB 导出未返回文件')
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(artifact.blob)
      })
      return { base64, warnings: artifact.warnings }
    }
    const host = window as unknown as {
      pascalLocalCapture?: typeof capture
      pascalLocalExport?: typeof exportGlb
      pascalLocalReady?: () => boolean
    }
    host.pascalLocalExport = exportGlb
    host.pascalLocalReady = () => Boolean(useEditor.getState().modelExport)
    host.pascalLocalCapture = capture
    return () => {
      delete host.pascalLocalCapture
      delete host.pascalLocalExport
      delete host.pascalLocalReady
    }
  }, [sceneId, rendering, projectId])
}
