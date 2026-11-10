import { describe, expect, test } from 'bun:test'
import { ItemNode } from './item'

const asset = {
  id: 'generated-chair',
  category: 'furniture',
  name: 'Chair',
  thumbnail: '/chair.png',
  src: '/chair.glb',
}
const orientation = {
  version: 1,
  modelSha256: 'a'.repeat(64),
  recordHash: 'b'.repeat(64),
  status: 'accepted',
  source: 'vlm_inferred',
  assetId: asset.id,
  assetSrc: asset.src,
  frontLocal: [0, 0, 1],
  frontRole: 'seated_forward',
  category: 'chair',
  reason: '多视图一致',
}
describe('asset orientation snapshots', () => {
  test('old items load without orientation and new snapshots survive scene parsing', () => {
    expect(ItemNode.parse({ asset }).asset.orientation).toBeUndefined()
    const item = ItemNode.parse({
      asset: { ...asset, orientation },
      metadata: { spatialReference: { source: 'user_confirmed', frontLocal: [1, 0, 0] } },
    })
    expect(item.asset.orientation).toEqual(orientation)
    expect(ItemNode.parse(JSON.parse(JSON.stringify(item))).metadata).toEqual(item.metadata)
  })
  test('invalid metadata cannot introduce nonfinite directions or unknown sources', () => {
    expect(
      ItemNode.safeParse({
        asset: { ...asset, orientation: { ...orientation, frontLocal: [NaN, 0, 1] } },
      }).success,
    ).toBe(false)
    expect(
      ItemNode.safeParse({
        asset: { ...asset, orientation: { ...orientation, source: 'model_said_confirmed' } },
      }).success,
    ).toBe(false)
  })
})
