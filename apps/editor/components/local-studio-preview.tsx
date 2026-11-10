'use client'
import { Bounds, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { Box3, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'

type Props = {
  front?: number[]
  kind: string
  url: string
  maps?: Record<string, string>
  roughness: number
  metalness: number
}
function Model({ url, front }: { url: string; front?: number[] }) {
  const gltf = useGLTF(url)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const arrow = useMemo(() => {
    if (
      !front ||
      front.length !== 3 ||
      !front.every(Number.isFinite) ||
      Math.hypot(...front) < 1e-6
    )
      return null
    const box = new Box3().setFromObject(model),
      size = box.getSize(new Vector3()),
      center = box.getCenter(new Vector3())
    center.y = box.max.y + Math.max(size.x, size.z) * 0.08
    return {
      direction: new Vector3(...front).normalize(),
      origin: center,
      length: Math.max(size.x, size.z) * 0.65,
    }
  }, [model, front])
  return (
    <group>
      <primitive object={model} />
      {arrow && <arrowHelper args={[arrow.direction, arrow.origin, arrow.length, 0xa78bfa]} />}
    </group>
  )
}
function Surface({
  maps,
  roughness,
  metalness,
}: {
  maps: Record<string, string>
  roughness: number
  metalness: number
}) {
  const textures = useTexture(maps)
  for (const [name, t] of Object.entries(textures)) {
    const space = name === 'baseColor' ? SRGBColorSpace : NoColorSpace
    if (t.colorSpace !== space || t.wrapS !== RepeatWrapping || t.wrapT !== RepeatWrapping) {
      t.colorSpace = space
      t.wrapS = RepeatWrapping
      t.wrapT = RepeatWrapping
      t.needsUpdate = true
    }
  }
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        map={textures.baseColor}
        normalMap={textures.normal}
        aoMap={textures.ao}
        roughnessMap={textures.roughness}
        metalnessMap={textures.metalness}
        bumpMap={textures.height}
        bumpScale={0.015}
        roughness={textures.roughness ? 1 : roughness}
        metalness={textures.metalness ? 1 : metalness}
      />
    </mesh>
  )
}
export default function LocalStudioPreview(p: Props) {
  return (
    <div
      className="h-80 w-full overflow-hidden rounded-xl bg-neutral-900"
      data-testid="studio-three-preview"
    >
      <Canvas camera={{ position: [2.6, 1.8, 3.2], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#24262c']} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={3} />
        <directionalLight position={[-3, 2, -2]} intensity={1.5} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            {p.kind === 'model' ? (
              <Model url={p.url} front={p.front} />
            ) : (
              <Surface
                maps={p.maps || { baseColor: p.url }}
                roughness={p.roughness}
                metalness={p.metalness}
              />
            )}
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
