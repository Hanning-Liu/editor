'use client'
import {
  type AnyNodeId,
  type ItemNode,
  type ZoneNode,
  type FurnitureGroupNode,
  usePascalI18n,
  useScene,
  editFunctionalZone,
  editFurnitureGroup,
  transformFurnitureGroup,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useState } from 'react'
import { applySpatialChanges } from '../../../lib/spatial-hierarchy'
import {
  useSpatialInspector,
  spatialSelectionKey,
  type SpatialChoice as Choice,
} from '../../../store/use-spatial-inspector'
import { PanelWrapper } from './panel-wrapper'
const control =
  'w-full rounded border border-border bg-background p-1.5 text-xs'
const button =
  'rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40'
export function SpatialHierarchyPanel() {
  const i18n = usePascalI18n()
  const inspection = useSpatialInspector((s) => s.inspection)
  const close = useSpatialInspector((s) => s.close)
  const nodes = useScene((s) => s.nodes)
  const selection = useViewer((s) => s.selection)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (
      inspection &&
      (spatialSelectionKey() !== inspection.selectionKey ||
        (inspection.choice.id && !nodes[inspection.choice.id as AnyNodeId]))
    )
      close()
  }, [selection, inspection, close, nodes])
  if (!inspection) return null
  const current = inspection.choice.id
    ? nodes[inspection.choice.id as AnyNodeId]
    : undefined
  const area =
    current?.type === 'furniture-group'
      ? nodes[current.functionalZoneId as AnyNodeId]
      : current
  const roomId =
    area?.type === 'functional-zone' ? area.roomId : inspection.roomId
  const room = nodes[roomId as AnyNodeId]
  if (room?.type !== 'zone') return null
  const { choice } = inspection
  const apply = (
    kind: 'zone' | 'group' | 'transform',
    input: Record<string, unknown>,
  ) => {
    try {
      const current = useScene.getState().nodes
      const out =
        kind === 'zone'
          ? editFunctionalZone(current, input)
          : kind === 'group'
            ? editFurnitureGroup(current, input)
            : transformFurnitureGroup(current, input as { id: string })
      if (out.changes) applySpatialChanges(out.changes)
      setError('')
      setNotice(i18n._({ id: 'editor.spatial.applied', message: 'Applied' }))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  return (
    <PanelWrapper
      title={i18n._({
        id: 'editor.spatial.properties',
        message: 'Spatial properties',
      })}
      onClose={close}
    >
      <SpatialHierarchyEditor
        key={
          JSON.stringify(choice) +
          JSON.stringify(choice.id ? nodes[choice.id as AnyNodeId] : null)
        }
        choice={choice}
        room={room}
        nodes={nodes}
        candidates={Object.values(nodes).filter(
          (n): n is ItemNode =>
            n.type === 'item' && n.parentId === room.parentId,
        )}
        apply={apply}
        close={close}
      />
      {error && (
        <p role="alert" className="px-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="px-3 text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </PanelWrapper>
  )
}
function SpatialHierarchyEditor({
  choice,
  room,
  nodes,
  candidates,
  apply,
  close,
}: {
  choice: Choice
  room: ZoneNode
  nodes: ReturnType<typeof useScene.getState>['nodes']
  candidates: ItemNode[]
  apply: (
    kind: 'zone' | 'group' | 'transform',
    input: Record<string, unknown>,
  ) => boolean
  close: () => void
}) {
  const i18n = usePascalI18n()
  const old = choice.id ? nodes[choice.id as AnyNodeId] : undefined
  const area = old?.type === 'functional-zone' ? old : undefined
  const group = old?.type === 'furniture-group' ? old : undefined
  const [name, setName] = useState(
    old?.name ?? (choice.kind === 'zone' ? '新功能分区' : '新家具组团'),
  )
  const [functions, setFunctions] = useState(area?.functions.join('、') ?? '')
  const [polygon, setPolygon] = useState<[number, number][]>(
    area?.polygon ?? room.polygon.map((p) => [...p]),
  )
  const [purpose, setPurpose] = useState(group?.purpose ?? '')
  const [members, setMembers] = useState<string[]>(
    group?.memberIds ??
      (choice.kind === 'group'
        ? (choice.memberIds ?? []).filter(
            (id) =>
              !Object.values(nodes).some(
                (n) => n.type === 'furniture-group' && n.memberIds.includes(id),
              ),
          )
        : []),
  )
  const [anchor, setAnchor] = useState(group?.anchorNodeId ?? '')
  const [roles, setRoles] = useState<Record<string, string>>(
    group?.memberRoles ?? {},
  )
  const [dx, setDx] = useState('0'),
    [dz, setDz] = useState('0'),
    [angle, setAngle] = useState('0')
  const otherGroups = Object.values(nodes).filter(
    (n): n is FurnitureGroupNode =>
      n.type === 'furniture-group' && n.id !== group?.id,
  )
  const available = [
    ...new Map(
      [
        ...candidates,
        ...(group?.memberIds ?? []).flatMap((id) => {
          const n = nodes[id as AnyNodeId]
          return n?.type === 'item' ? [n] : []
        }),
      ].map((n) => [n.id, n]),
    ).values(),
  ]
  const submit = () => {
    const ok =
      choice.kind === 'zone'
        ? apply('zone', {
            id: choice.id,
            roomId: room.id,
            name,
            functions: functions
              .split(/[、,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
            polygon,
          })
        : apply('group', {
            id: choice.id,
            functionalZoneId:
              group?.functionalZoneId ??
              (choice.kind === 'group' ? choice.areaId : undefined),
            name,
            purpose,
            memberIds: members,
            anchorNodeId: anchor || null,
            memberRoles: Object.fromEntries(
              Object.entries(roles).filter(([id]) => members.includes(id)),
            ),
          })
    if (ok) close()
  }
  return (
    <div
      role="group"
      aria-label={
        choice.kind === 'zone'
          ? i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textr39me3',
              message: 'Functional zone editor',
            })
          : i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text16rlge',
              message: 'Furniture group editor',
            })
      }
      className="m-2 space-y-2 rounded border border-border p-2"
    >
      <p className="text-xs font-semibold">
        {choice.kind === 'zone'
          ? i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textayfzqq',
              message: 'Functional zone',
            })
          : i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textbwyvof',
              message: 'Furniture group',
            })}{' '}
        ·{' '}
        {old
          ? i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textmekb',
              message: 'Edit',
            })
          : i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textehj3',
              message: 'Create',
            })}
      </p>
      <label className="block text-xs">
        {i18n._({
          id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.texteyrn',
          message: 'Name',
        })}
        <input
          className={control}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textc5vh0o',
            message: 'Hierarchy name',
          })}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {choice.kind === 'zone' ? (
        <>
          <label className="block text-xs">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1jjt7m',
              message: 'Functions (comma separated)',
            })}
            <input
              className={control}
              aria-label={i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textap1cmq',
                message: 'Zone functions',
              })}
              value={functions}
              onChange={(e) => setFunctions(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.xZ',
              message:
                'Boundary points in X/Z metres. Start with the room outline and edit corners; no walls are created.',
            })}
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {polygon.map((p, i) => (
              <div className="flex gap-1" key={'corner-' + i}>
                <input
                  className={control}
                  type="number"
                  step="0.1"
                  aria-label={i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.pointX',
                    message: 'Boundary point {index} X',
                    values: { index: i + 1 },
                  })}
                  value={p[0]}
                  onChange={(e) =>
                    setPolygon(
                      polygon.map((q, j) =>
                        i === j ? [Number(e.target.value), q[1]] : q,
                      ),
                    )
                  }
                />
                <input
                  className={control}
                  type="number"
                  step="0.1"
                  aria-label={i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.pointZ',
                    message: 'Boundary point {index} Z',
                    values: { index: i + 1 },
                  })}
                  value={p[1]}
                  onChange={(e) =>
                    setPolygon(
                      polygon.map((q, j) =>
                        i === j ? [q[0], Number(e.target.value)] : q,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className={button}
                  disabled={polygon.length <= 3}
                  aria-label={i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.removePoint',
                    message: 'Delete boundary point {index}',
                    values: { index: i + 1 },
                  })}
                  onClick={() => setPolygon(polygon.filter((_, j) => j !== i))}
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={button}
            onClick={() => {
              const a = polygon.at(-1)!,
                b = polygon[0]!
              setPolygon([...polygon, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]])
            }}
          >
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text2cwspw',
              message: 'Add boundary point',
            })}
          </button>
        </>
      ) : (
        <>
          <label className="block text-xs">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textgcw8wa',
              message: 'Group purpose',
            })}
            <input
              className={control}
              aria-label={i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textgcw8wa',
                message: 'Group purpose',
              })}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text9vhvpz',
              message:
                'Membership keeps furniture in place; supported objects follow their host.',
            })}
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {available.map((item) => {
              const owner = otherGroups.find((g) =>
                g.memberIds.includes(item.id),
              )
              return (
                <div key={item.id}>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      aria-label={i18n._({
                        id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.memberLabel',
                        message: 'Group member {name}',
                        values: { name: item.name ?? item.asset.name },
                      })}
                      checked={members.includes(item.id)}
                      disabled={!!owner}
                      onChange={(e) => {
                        setMembers(
                          e.target.checked
                            ? [...members, item.id]
                            : members.filter((id) => id !== item.id),
                        )
                        if (!e.target.checked && anchor === item.id)
                          setAnchor('')
                      }}
                    />
                    {item.name ?? item.asset.name}
                    {owner
                      ? i18n._({
                          id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text13eo2n',
                          message: '(already grouped)',
                        })
                      : ''}
                  </label>
                  {members.includes(item.id) && (
                    <input
                      className={control}
                      aria-label={i18n._({
                        id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.roleLabel',
                        message: 'Member role {name}',
                        values: { name: item.name ?? item.asset.name },
                      })}
                      placeholder={i18n._({
                        id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.texth2v9tb',
                        message: 'Member role (optional)',
                      })}
                      value={roles[item.id] ?? ''}
                      onChange={(e) =>
                        setRoles({ ...roles, [item.id]: e.target.value })
                      }
                    />
                  )}
                </div>
              )
            })}
          </div>
          <label className="block text-xs">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textdfxjts',
              message: 'Rotation anchor',
            })}
            <select
              className={control}
              aria-label={i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textgd1ibh',
                message: 'Group anchor',
              })}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            >
              <option value="">
                {i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1t2qgq',
                  message: 'Root member centre',
                })}
              </option>
              {members.map((id) => (
                <option key={id} value={id}>
                  {nodes[id as AnyNodeId]?.name ?? id}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={submit}>
          {i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textaggoao',
            message: 'Save hierarchy',
          })}
        </button>
        <button type="button" className={button} onClick={close}>
          {i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textaweu1h',
            message: 'Close editor',
          })}
        </button>
        {old && (
          <button
            type="button"
            className={button}
            onClick={() => {
              if (apply(choice.kind, { id: old.id, delete: true })) close()
            }}
          >
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textoa1t',
              message: 'Remove ',
            })}
            {choice.kind === 'zone'
              ? i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1bfvwx',
                  message: 'zone and groups',
                })
              : i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textm1em',
                  message: 'group',
                })}
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1l1flz',
              message: ' (keep furniture)',
            })}
          </button>
        )}
      </div>
      {group && (
        <fieldset className="space-y-1 border-t border-border pt-2">
          <legend className="text-xs">
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1gzjhg',
              message: 'Group transform · rotate then translate',
            })}
          </legend>
          <div className="grid grid-cols-3 gap-1">
            <label className="text-xs">
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.x',
                message: 'ΔX metres',
              })}
              <input
                aria-label={i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.x2',
                  message: 'Group translation X',
                })}
                className={control}
                type="number"
                step="0.1"
                value={dx}
                onChange={(e) => setDx(e.target.value)}
              />
            </label>
            <label className="text-xs">
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.z',
                message: 'ΔZ metres',
              })}
              <input
                aria-label={i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.z2',
                  message: 'Group translation Z',
                })}
                className={control}
                type="number"
                step="0.1"
                value={dz}
                onChange={(e) => setDz(e.target.value)}
              />
            </label>
            <label className="text-xs">
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.texthrnixw',
                message: 'Angle °',
              })}
              <input
                aria-label={i18n._({
                  id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textkhqjqr',
                  message: 'Group rotation angle',
                })}
                className={control}
                type="number"
                step="15"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className={button}
            onClick={() => {
              if (
                apply('transform', {
                  id: group.id,
                  translate: [Number(dx), Number(dz)],
                  angleDegrees: Number(angle),
                })
              ) {
                setDx('0')
                setDz('0')
                setAngle('0')
              }
            }}
          >
            {i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1rih4t',
              message: 'Apply group transform',
            })}
          </button>
        </fieldset>
      )}
    </div>
  )
}
