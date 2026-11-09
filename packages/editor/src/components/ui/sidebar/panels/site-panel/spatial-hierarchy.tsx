'use client'

import {
  type AnyNodeId,
  type FunctionalZoneNode,
  type FurnitureGroupNode,
  type ItemNode,
  type ZoneNode,
  editFunctionalZone,
  editFurnitureGroup,
  transformFurnitureGroup,
  getSpatialHierarchy,
  runAsSingleSceneHistoryStep,
  useScene,
  usePascalI18n,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useMemo, useState, type ReactNode } from 'react'
import { runUndo, runRedo } from '../../../../../lib/history'
import { TreeNode } from './tree-node'

type Choice =
  | { kind: 'zone'; id?: string }
  | { kind: 'group'; id?: string; areaId: string }
const control =
  'w-full rounded border border-border bg-background p-1.5 text-xs'
const button =
  'rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40'

/** Semantic rows reference real items; their support tree is never rewritten. */
export function RoomSpatialTree({
  roomId,
  row,
}: {
  roomId: string
  row: ReactNode
}) {
  const i18n = usePascalI18n()
  const nodes = useScene((s) => s.nodes)
  const [expanded, setExpanded] = useState(true)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const reading = useMemo(
    () => getSpatialHierarchy(nodes, { roomId }).result.rooms[0],
    [nodes, roomId],
  )
  const room = nodes[roomId as AnyNodeId]
  if (room?.type !== 'zone' || !reading) return <>{row}</>
  const candidateIds = new Set([
    ...reading.unassignedItems.map((i) => i.id),
    ...reading.functionalZones.flatMap((a) => [
      ...a.ungroupedItems.map((i) => i.id),
      ...a.furnitureGroups.flatMap((g) => g.memberIds),
    ]),
  ])
  const candidates = [...candidateIds].flatMap((id) => {
    const n = nodes[id as AnyNodeId]
    return n?.type === 'item' ? [n] : []
  })
  const apply = (
    kind: 'zone' | 'group' | 'transform',
    input: Record<string, unknown>,
  ) => {
    try {
      const current = useScene.getState()
      if (current.readOnly) throw Error('当前项目只读')
      const outcome =
        kind === 'zone'
          ? editFunctionalZone(current.nodes, input)
          : kind === 'group'
            ? editFurnitureGroup(current.nodes, input)
            : transformFurnitureGroup(
                current.nodes,
                input as unknown as { id: string },
              )
      if (outcome.changes)
        runAsSingleSceneHistoryStep(useScene, () =>
          useScene
            .getState()
            .applyNodeChanges(
              outcome.changes as Parameters<typeof current.applyNodeChanges>[0],
            ),
        )
      setError('')
      setNotice(
        i18n._({
          id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1flm01',
          message: 'Applied; waiting for autosave.',
        }),
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  const roots = (ids: string[]) =>
    ids.filter((id) => {
      let p = nodes[id as AnyNodeId]?.parentId
      const seen = new Set<string>()
      while (p && !seen.has(p)) {
        if (ids.includes(p)) return false
        seen.add(p)
        p = nodes[p as AnyNodeId]?.parentId ?? null
      }
      return true
    })
  return (
    <section
      aria-label={i18n._({
        id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.spatialLabel',
        message: 'Spatial hierarchy {name}',
        values: { name: room.name },
      })}
      data-room-hierarchy={roomId}
    >
      <div className="relative">
        {row}
        <button
          type="button"
          className="absolute left-6 top-1 h-6 w-5 rounded text-xs hover:bg-accent"
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleRoom',
            message:
              '{expanded, select, true {Collapse} other {Expand}} room {name}',
            values: { expanded: String(expanded), name: room.name },
          })}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="border-b border-border/50 pb-2">
          <div className="flex flex-wrap gap-1 py-1 pl-12">
            <button
              type="button"
              className={button}
              onClick={() => {
                setChoice({ kind: 'zone' })
                setNotice('')
              }}
            >
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textqqmuk7',
                message: 'Add functional zone',
              })}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                runUndo()
                setError('')
                setNotice(
                  i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.texte9b2m',
                    message: 'Undone',
                  }),
                )
              }}
            >
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text7rs518',
                message: 'Undo hierarchy edit',
              })}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                runRedo()
                setError('')
                setNotice(
                  i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textegm1r',
                    message: 'Redone',
                  }),
                )
              }}
            >
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textrxkhfx',
                message: 'Redo hierarchy edit',
              })}
            </button>
          </div>
          {reading.functionalZones.map((area) => (
            <FunctionalZoneTree
              key={area.id}
              area={area}
              onEdit={() => setChoice({ kind: 'zone', id: area.id })}
              onAddGroup={() => setChoice({ kind: 'group', areaId: area.id })}
            >
              {area.furnitureGroups.map((group) => (
                <FurnitureGroupTree
                  key={group.id}
                  group={group}
                  onEdit={() =>
                    setChoice({ kind: 'group', id: group.id, areaId: area.id })
                  }
                  onSelect={() => {
                    useViewer.getState().setSelection({
                      selectedIds: roots(group.memberIds) as AnyNodeId[],
                      zoneId: null,
                    })
                  }}
                >
                  {roots(group.memberIds)
                    .filter((id) => nodes[id as AnyNodeId])
                    .map((id) => (
                      <TreeNode key={id} nodeId={id as AnyNodeId} depth={5} />
                    ))}
                </FurnitureGroupTree>
              ))}
              {area.ungroupedItems.length > 0 && (
                <div className="pl-16 text-xs text-muted-foreground">
                  {i18n._({
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text1skhpl',
                    message: 'Ungrouped furniture',
                  })}
                </div>
              )}
              {roots(area.ungroupedItems.map((i) => i.id)).map((id) => (
                <TreeNode key={id} nodeId={id as AnyNodeId} depth={4} />
              ))}
            </FunctionalZoneTree>
          ))}
          {reading.unassignedItems.length > 0 && (
            <div className="py-1 pl-12 text-xs text-muted-foreground">
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.length',
                message: 'Unassigned furniture · {length}',
                values: { length: reading.unassignedItems.length },
              })}
            </div>
          )}
          {roots(reading.unassignedItems.map((i) => i.id)).map((id) => (
            <TreeNode key={id} nodeId={id as AnyNodeId} depth={3} />
          ))}
          {choice && (
            <SpatialHierarchyEditor
              key={JSON.stringify(choice)}
              choice={choice}
              room={room}
              nodes={nodes}
              candidates={candidates}
              apply={apply}
              close={() => setChoice(null)}
            />
          )}
          {error && (
            <p role="alert" className="px-3 text-xs text-red-400">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="px-3 text-xs text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function FunctionalZoneTree({
  area,
  children,
  onEdit,
  onAddGroup,
}: {
  area: FunctionalZoneNode
  children: ReactNode
  onEdit: () => void
  onAddGroup: () => void
}) {
  const i18n = usePascalI18n()
  const [open, setOpen] = useState(true)
  return (
    <div data-functional-zone={area.id}>
      <div className="flex min-h-8 items-center gap-1 pl-12 pr-2 text-xs">
        <button
          type="button"
          aria-expanded={open}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleZone',
            message:
              '{expanded, select, true {Collapse} other {Expand}} functional zone {name}',
            values: { expanded: String(open), name: area.name },
          })}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: area.color }}
        />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={onEdit}
        >
          {area.name}
        </button>
        <button
          type="button"
          className={button}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.editZone',
            message: 'Edit functional zone {name}',
            values: { name: area.name },
          })}
          onClick={onEdit}
        >
          {i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textmekb',
            message: 'Edit',
          })}
        </button>
        <button
          type="button"
          className={button}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.addGroup',
            message: 'Add furniture group {name}',
            values: { name: area.name },
          })}
          onClick={onAddGroup}
        >
          {i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.text11yvhl',
            message: '+ Group',
          })}
        </button>
      </div>
      {open && children}
    </div>
  )
}
function FurnitureGroupTree({
  group,
  children,
  onEdit,
  onSelect,
}: {
  group: FurnitureGroupNode
  children: ReactNode
  onEdit: () => void
  onSelect: () => void
}) {
  const i18n = usePascalI18n()
  const [open, setOpen] = useState(true)
  return (
    <div data-furniture-group={group.id}>
      <div className="flex min-h-8 items-center gap-1 pl-16 pr-2 text-xs">
        <button
          type="button"
          aria-expanded={open}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleGroup',
            message:
              '{expanded, select, true {Collapse} other {Expand}} furniture group {name}',
            values: { expanded: String(open), name: group.name },
          })}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={onSelect}
        >
          {group.name} · {group.memberIds.length}
        </button>
        <button
          type="button"
          className={button}
          aria-label={i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.editGroup',
            message: 'Edit furniture group {name}',
            values: { name: group.name },
          })}
          onClick={onEdit}
        >
          {i18n._({
            id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textmekb',
            message: 'Edit',
          })}
        </button>
      </div>
      {open && children}
    </div>
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
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? [])
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
              choice.kind === 'group' ? choice.areaId : undefined,
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
