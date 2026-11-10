import { afterEach, beforeEach, expect, test } from 'bun:test'
import { FunctionalZoneNode, LevelNode, useScene, ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../store/use-editor'
import useInteractionScope from '../store/use-interaction-scope'
import { useSpatialInspector } from '../store/use-spatial-inspector'
import {
  functionalZoneEvents,
  hoverFunctionalZone,
  leaveFunctionalZone,
  selectFunctionalZone,
} from './functional-zone-selection'

const originalNodes = useScene.getState().nodes
const ids = ['functional-zone_a', 'functional-zone_b'] as const
beforeEach(() => {
  const level = LevelNode.parse({ id: 'level_test' }),
    room = ZoneNode.parse({
      id: 'zone_test',
      name: 'Room',
      parentId: level.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    })
  const a = FunctionalZoneNode.parse({
      id: ids[0],
      roomId: room.id,
      parentId: level.id,
      name: 'A',
      polygon: room.polygon,
    }),
    b = FunctionalZoneNode.parse({ ...a, id: ids[1], name: 'B' })
  useScene.setState({ nodes: { [level.id]: level, [room.id]: room, [a.id]: a, [b.id]: b } })
  useInteractionScope.getState().end()
  useEditor.setState({
    mode: 'select',
    isCaptureMode: false,
    isPreviewMode: false,
    isFirstPersonMode: false,
    workspaceMode: 'edit',
  })
  useViewer.setState({ hoveredId: null, cameraDragging: false, inputDragging: false })
  useViewer.getState().setSelection({ selectedIds: [] })
})
afterEach(() => {
  useInteractionScope.getState().end()
  useSpatialInspector.getState().close()
  useScene.setState({ nodes: originalNodes })
  useViewer.getState().setHoveredId(null)
  useViewer.getState().setSelection({ selectedIds: [] })
  useEditor.setState({ mode: 'select', isCaptureMode: false })
})
test('shared boundary cycles semantic selection and opens its room inspector without changing graph', () => {
  const before = structuredClone(useScene.getState().nodes)
  expect(selectFunctionalZone(ids)).toBe(true)
  expect(useViewer.getState().selection.selectedIds).toEqual([ids[0]])
  expect(selectFunctionalZone(ids)).toBe(true)
  expect(useViewer.getState().selection.selectedIds).toEqual([ids[1]])
  expect(useSpatialInspector.getState().inspection?.roomId).toBe('zone_test')
  expect(useScene.getState().nodes).toEqual(before)
})
test('drafting, capture and camera drags retain pointer ownership', () => {
  useInteractionScope.getState().begin({ kind: 'drafting', tool: 'functional-zone' })
  expect(selectFunctionalZone(ids)).toBe(false)
  expect(hoverFunctionalZone(ids)).toBe(false)
  useInteractionScope.getState().end()
  useEditor.setState({ isCaptureMode: true })
  expect(selectFunctionalZone(ids)).toBe(false)
  useEditor.setState({ isCaptureMode: false })
  useViewer.setState({ cameraDragging: true })
  expect(hoverFunctionalZone(ids)).toBe(false)
  expect(useViewer.getState().selection.selectedIds).toEqual([])
})
test('leaving one boundary does not clear another node hover and right click never changes selection', () => {
  hoverFunctionalZone([ids[0]!])
  leaveFunctionalZone([ids[1]!])
  expect(useViewer.getState().hoveredId).toBe(ids[0])
  functionalZoneEvents(ids).onClick({
    button: 2,
    stopPropagation: () => {
      throw Error('Right click intercepted')
    },
  })
  expect(useViewer.getState().selection.selectedIds).toEqual([])
  leaveFunctionalZone([ids[0]!])
  expect(useViewer.getState().hoveredId).toBeNull()
})

test('3D release selects once and the following DOM click does not cycle again', () => {
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  })
  try {
    selectFunctionalZone(ids)
    const events = functionalZoneEvents(ids, '3d'),
      event = { button: 0, stopPropagation: () => {} }
    events.onPointerDown(event)
    events.onPointerUp(event)
    events.onClick(event)
    expect(useViewer.getState().selection.selectedIds).toEqual([ids[1]])
  } finally {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
  }
})
