import type { SceneStore } from '@pascal-app/mcp/storage'
import { z } from 'zod'
import { apiGraphSchema } from './graph-schema'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const name = z.string().min(1).max(200)
const version = z.number().int().nonnegative()
const mutate = z.object({ expectedVersion: version.optional() }).strict()
const ownerId = z.string().max(200).nullable().optional()
const projectId = z.string().max(200).nullable().optional()
const limit = z.number().int().min(1).max(500).optional()
const rpcSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('createProject'),
      args: z.tuple([
        z.object({ id: id.optional(), name, ownerId, isPrivate: z.boolean().optional() }).strict(),
      ]),
    })
    .strict(),
  z.object({ method: z.literal('getProjectStatus'), args: z.tuple([id]) }).strict(),
  z
    .object({
      method: z.literal('save'),
      args: z.tuple([
        z
          .object({
            id: id.optional(),
            name,
            projectId,
            ownerId,
            graph: apiGraphSchema,
            thumbnailUrl: z.string().url().nullable().optional(),
            expectedVersion: version.optional(),
            expectedGraphHash: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable()
              .optional(),
            saveMode: z.enum(['draft', 'checkpoint']).optional(),
            publish: z.literal(false).optional(),
            agentSessionId: z.string().max(200).optional(),
            operation: z.string().max(200).optional(),
            allowSceneWipe: z.boolean().optional(),
          })
          .strict(),
      ]),
    })
    .strict(),
  z.object({ method: z.literal('load'), args: z.tuple([id]) }).strict(),
  z
    .object({
      method: z.literal('list'),
      args: z.tuple([
        z
          .object({
            projectId: z.string().max(200).optional(),
            ownerId: z.string().max(200).optional(),
            limit,
          })
          .strict(),
      ]),
    })
    .strict(),
  z.object({ method: z.literal('delete'), args: z.tuple([id, mutate]) }).strict(),
  z.object({ method: z.literal('rename'), args: z.tuple([id, name, mutate]) }).strict(),
  z
    .object({
      method: z.literal('appendSceneEvent'),
      args: z.tuple([
        z
          .object({ sceneId: id, version, kind: z.string().min(1).max(200), graph: apiGraphSchema })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      method: z.literal('listSceneEvents'),
      args: z.tuple([id, z.object({ afterEventId: version.optional(), limit }).strict()]),
    })
    .strict(),
])

export async function workerStoreRpc(store: SceneStore, body: unknown): Promise<unknown> {
  const input = rpcSchema.parse(body)
  switch (input.method) {
    case 'createProject':
      if (!store.createProject) throw Error('Project creation unavailable')
      return store.createProject(...input.args)
    case 'getProjectStatus':
      if (!store.getProjectStatus) throw Error('Project status unavailable')
      return store.getProjectStatus(...input.args)
    case 'save': {
      const opts = input.args[0] as Parameters<SceneStore['save']>[0]
      const existing = opts.id ? await store.load(opts.id) : null
      if (opts.expectedGraphHash && existing?.graphHash !== opts.expectedGraphHash)
        throw Object.assign(Error('Scene changed during worker operation'), {
          code: 'version_conflict',
        })
      if (existing?.nodeCount && !Object.keys(opts.graph.nodes).length && !opts.allowSceneWipe)
        throw Object.assign(Error('Scene wipe requires an explicit flag'), { code: 'invalid' })
      // SQLite increments every save. Pin that version after the hash check so
      // an intervening browser write still fails atomically inside the store.
      return store.save({
        ...opts,
        ...(opts.expectedGraphHash && opts.expectedVersion === undefined
          ? { expectedVersion: existing?.version }
          : {}),
      })
    }
    case 'load':
      return store.load(...input.args)
    case 'list':
      return store.list(...input.args)
    case 'delete':
      return store.delete(...input.args)
    case 'rename':
      return store.rename(...input.args)
    case 'appendSceneEvent':
      if (!store.appendSceneEvent) throw Error('Scene events unavailable')
      return store.appendSceneEvent(
        input.args[0] as Parameters<NonNullable<SceneStore['appendSceneEvent']>>[0],
      )
    case 'listSceneEvents':
      if (!store.listSceneEvents) throw Error('Scene events unavailable')
      return store.listSceneEvents(...input.args)
  }
}
