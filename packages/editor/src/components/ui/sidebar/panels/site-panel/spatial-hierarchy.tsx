'use client'
import {
  type AnyNodeId,
  type FunctionalZoneNode,
  type FurnitureGroupNode,
  editFunctionalZone,
  editFurnitureGroup,
  getSpatialHierarchy,
  useScene,
  usePascalI18n,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  ChevronRight,
  MoreHorizontal,
  Plus,
  Boxes,
  LayoutGrid,
} from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type DragEvent,
} from 'react'
import {
  applySpatialChanges,
  spatialRoots,
  spatialDropChanges,
  SPATIAL_DRAG_TYPE,
  type SpatialDrag,
} from '../../../../../lib/spatial-hierarchy'
import {
  inspectSpatial,
  useSpatialInspector,
} from '../../../../../store/use-spatial-inspector'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../primitives/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../../primitives/dropdown-menu'
import { hoverFunctionalZone, leaveFunctionalZone } from '../../../../../lib/functional-zone-selection'
import { useFunctionalZonePresentation } from '../../../../../hooks/use-functional-zone-presentation'
import { InlineRenameField } from './inline-rename-input'
import { TreeNode } from './tree-node'

type Action = { label: string; run: () => void; disabled?: boolean }
const iconButton =
  'flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100'
function RowMenu({
  children,
  actions,
}: {
  children: ReactNode
  actions: Action[]
}) {
  const pending = useRef<(() => void) | null>(null)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(e) => {
          if (pending.current) {
            e.preventDefault()
            const run = pending.current
            pending.current = null
            run()
          }
        }}
      >
        {actions.map((a) => (
          <ContextMenuItem
            key={a.label}
            disabled={a.disabled}
            onSelect={() => {
              pending.current = a.run
            }}
          >
            {a.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
function MoreActions({ actions }: { actions: Action[] }) {
  const pending = useRef<(() => void) | null>(null)
  const i18n = usePascalI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={iconButton}
          aria-label={i18n._({
            id: 'editor.spatial.actions',
            message: 'More actions',
          })}
        >
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(e) => {
          if (pending.current) {
            e.preventDefault()
            const run = pending.current
            pending.current = null
            run()
          }
        }}
      >
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            disabled={a.disabled}
            onSelect={() => {
              pending.current = a.run
            }}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
function writeDrag(e: DragEvent, drag: SpatialDrag) {
  e.stopPropagation()
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(SPATIAL_DRAG_TYPE, JSON.stringify(drag))
}

/** Semantic rows and drop targets never replace the physical support tree. */
export function RoomSpatialTree({
  roomId,
  row,
}: {
  roomId: string
  row: ReactNode
}) {
  const i18n = usePascalI18n(),
    nodes = useScene((s) => s.nodes),
    selectedIds = useViewer((s) => s.selection.selectedIds),
    readOnly = useScene((s) => s.readOnly)
  const {areas} = useFunctionalZonePresentation()
  const [expanded, setExpanded] = useState(true),
    [error, setError] = useState('')
  const reading = useMemo(
    () => getSpatialHierarchy(nodes, { roomId }).result.rooms[0],
    [nodes, roomId],
  )
  const room = nodes[roomId as AnyNodeId]
  if (room?.type !== 'zone' || !reading) return <>{row}</>
  const addZone = () => inspectSpatial(roomId, { kind: 'zone' })
  const roomActions = [
    {
      label: i18n._({
        id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.textqqmuk7',
        message: 'Add functional zone',
      }),
      run: addZone,
      disabled: readOnly,
    },
  ]
  const drop = (e: DragEvent, targetId: string) => {
    if (!e.dataTransfer.types.includes(SPATIAL_DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    try {
      const drag = JSON.parse(
        e.dataTransfer.getData(SPATIAL_DRAG_TYPE),
      ) as SpatialDrag
      applySpatialChanges(
        spatialDropChanges(useScene.getState().nodes, drag, targetId),
      )
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const itemTree = (id: string, depth: number) => (
    <RowMenu
      key={id}
      actions={reading.functionalZones.map((area) => ({
        label: i18n._({
          id: 'editor.spatial.createGroupIn',
          message: 'Create furniture group in {name}',
          values: { name: area.name },
        }),
        disabled: readOnly,
        run: () =>
          inspectSpatial(roomId, {
            kind: 'group',
            areaId: area.id,
            memberIds: spatialRoots(
              nodes,
              selectedIds.includes(id as AnyNodeId) ? selectedIds : [id],
            ),
          }),
      }))}
    >
      <div
        data-spatial-item={id}
        draggable={!readOnly}
        onDragStart={(e) => {
          const hit =
            (e.target as HTMLElement)
              .closest('[data-treenode-id]')
              ?.getAttribute('data-treenode-id') ?? id
          writeDrag(e, {
            kind: 'items',
            ids: selectedIds.includes(hit as AnyNodeId) ? selectedIds : [hit],
          })
        }}
      >
        <TreeNode nodeId={id as AnyNodeId} depth={depth} />
      </div>
    </RowMenu>
  )
  return (
    <section data-room-hierarchy={roomId}>
      <RowMenu actions={roomActions}>
        <div className="group/spatial relative">
          {row}
          <button
            type="button"
            className="absolute left-6 top-1 flex size-6 items-center justify-center rounded hover:bg-accent"
            aria-label={i18n._({
              id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleRoom',
              message:
                '{expanded, select, true {Collapse} other {Expand}} room {name}',
              values: { expanded: String(expanded), name: room.name },
            })}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight size={12} className={expanded ? 'rotate-90' : ''} />
          </button>
          <div className="absolute right-2 top-1 flex bg-background opacity-0 group-hover/spatial:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              disabled={readOnly}
              className={iconButton}
              aria-label={roomActions[0]!.label}
              onClick={addZone}
            >
              <Plus size={15} />
            </button>
            <MoreActions actions={roomActions} />
          </div>
        </div>
      </RowMenu>
      {expanded && (
        <div>
          {reading.functionalZones.map((area) => {
            const selection = selectedIds.filter(
              (id) => nodes[id as AnyNodeId]?.type === 'item',
            )
            const addGroup = () =>
              inspectSpatial(roomId, {
                kind: 'group',
                areaId: area.id,
                memberIds: spatialRoots(nodes, selection),
              })
            return (
              <SemanticRow
                key={area.id}
                node={area}
                displayColor={areas.find((n) => n.id === area.id)?.displayColor}
                depth={3}
                onDrop={(e) => drop(e, area.id)}
                onSelect={() =>
                  inspectSpatial(roomId, { kind: 'zone', id: area.id })
                }
                onAdd={addGroup}
                addLabel={i18n._({
                  id: 'editor.spatial.createGroup',
                  message: 'Create furniture group',
                })}
              >
                {area.furnitureGroups.map((group) => (
                  <SemanticRow
                    key={group.id}
                    node={group}
                    depth={4}
                    count={group.memberIds.length}
                    onDrop={(e) => drop(e, group.id)}
                    onSelect={() =>
                      inspectSpatial(roomId, {
                        kind: 'group',
                        id: group.id,
                        areaId: area.id,
                      })
                    }
                  >
                    {spatialRoots(nodes, group.memberIds)
                      .filter((id) => nodes[id as AnyNodeId])
                      .map((id) => itemTree(id, 5))}
                  </SemanticRow>
                ))}
                {spatialRoots(
                  nodes,
                  area.ungroupedItems.map((i) => i.id),
                ).map((id) => itemTree(id, 4))}
              </SemanticRow>
            )
          })}
          {reading.unassignedItems.length > 0 && (
            <div className="py-1 pl-12 text-xs text-muted-foreground">
              {i18n._({
                id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.length',
                message: 'Unassigned furniture · {length}',
                values: { length: reading.unassignedItems.length },
              })}
            </div>
          )}
          {spatialRoots(
            nodes,
            reading.unassignedItems.map((i) => i.id),
          ).map((id) => itemTree(id, 3))}
          {error && (
            <p role="alert" className="px-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
function SemanticRow({
  node,
  displayColor,
  depth,
  count,
  children,
  onSelect,
  onAdd,
  addLabel,
  onDrop,
}: {
  displayColor?: string
  node: FunctionalZoneNode | FurnitureGroupNode
  depth: number
  count?: number
  children: ReactNode
  onSelect: () => void
  onAdd?: () => void
  addLabel?: string
  onDrop: (e: DragEvent) => void
}) {
  const i18n = usePascalI18n(),
    readOnly = useScene((s) => s.readOnly),
    inspection = useSpatialInspector((s) => s.inspection)
  const [open, setOpen] = useState(true),
    [renaming, setRenaming] = useState(false),
    [over, setOver] = useState(false),
    [error, setError] = useState('')
  const rename = (name: string | undefined) => {
    if (!name?.trim()) return
    try {
      const nodes = useScene.getState().nodes
      const out =
        node.type === 'functional-zone'
          ? editFunctionalZone(nodes, { id: node.id, name })
          : editFurnitureGroup(nodes, { id: node.id, name })
      if (out.changes) applySpatialChanges(out.changes)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const actions: Action[] = [
    {
      label: i18n._({
        id: 'editor.spatial.properties',
        message: 'Spatial properties',
      }),
      run: onSelect,
    },
    {
      label: i18n._({ id: 'editor.spatial.rename', message: 'Rename' }),
      run: () => setRenaming(true),
      disabled: readOnly,
    },
  ]
  if (onAdd && addLabel)
    actions.push({ label: addLabel, run: onAdd, disabled: readOnly })
  const hovered = useViewer((s) => s.hoveredId), selected = useViewer((s) => s.selection.selectedIds)
  const isZone = node.type === 'functional-zone'
  return (
    <div
      {...(isZone
        ? { 'data-functional-zone': node.id }
        : { 'data-furniture-group': node.id })}
    >
      <RowMenu actions={actions}>
        <div
          data-spatial-row={node.id}
          onPointerEnter={() => { if (isZone) hoverFunctionalZone([node.id]) }}
          onPointerLeave={() => { if (isZone) leaveFunctionalZone([node.id]) }}
          data-zone-hovered={isZone && hovered === node.id}
          data-zone-selected={isZone && selected.includes(node.id)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.key === 'Enter') {
              e.preventDefault()
              onSelect()
            } else if (e.key === 'F2' && !readOnly) {
              e.preventDefault()
              e.stopPropagation()
              setRenaming(true)
            }
          }}
          draggable={!readOnly && !isZone && !renaming}
          onDragStart={(e) => writeDrag(e, { kind: 'group', id: node.id })}
          onDragOver={(e) => {
            if (!readOnly && e.dataTransfer.types.includes(SPATIAL_DRAG_TYPE)) {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              setOver(true)
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false)
            onDrop(e)
          }}
          onClick={onSelect}
          onDoubleClick={() => !readOnly && setRenaming(true)}
          className={
            'group/spatial flex h-8 cursor-pointer items-center gap-1 border-b border-border/50 pr-2 text-sm ' +
            (over
              ? 'bg-primary/15 ring-1 ring-primary'
              : inspection?.choice.id === node.id || selected.includes(node.id)
                ? 'bg-accent/50'
                : 'hover:bg-accent/30')
          }
          style={{ paddingLeft: depth * 12 + 12 }}
        >
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center"
            aria-label={i18n._(
              isZone
                ? {
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleZone',
                    message:
                      '{expanded, select, true {Collapse} other {Expand}} functional zone {name}',
                    values: { expanded: String(open), name: node.name },
                  }
                : {
                    id: 'editor.sidebar.panels.sitePanel.spatialHierarchy.toggleGroup',
                    message:
                      '{expanded, select, true {Collapse} other {Expand}} furniture group {name}',
                    values: { expanded: String(open), name: node.name },
                  },
            )}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(!open)
            }}
          >
            <ChevronRight size={12} className={open ? 'rotate-90' : ''} />
          </button>
          {isZone ? (
            <LayoutGrid size={14} style={{ color: displayColor ?? node.color }} />
          ) : (
            <Boxes size={14} className="text-muted-foreground" />
          )}
          <InlineRenameField
            name={node.name}
            defaultName={node.name}
            isEditing={renaming}
            onRename={rename}
            onStopEditing={() => setRenaming(false)}
            className="min-w-0 flex-1 truncate"
          />
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">{count}</span>
          )}
          <div
            className="ml-auto flex opacity-0 group-hover/spatial:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {onAdd && (
              <button
                type="button"
                disabled={readOnly}
                className={iconButton}
                aria-label={addLabel}
                onClick={onAdd}
              >
                <Plus size={14} />
              </button>
            )}
            <MoreActions actions={actions} />
          </div>
        </div>
      </RowMenu>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {open && children}
    </div>
  )
}
