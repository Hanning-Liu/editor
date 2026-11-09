'use client'
import { Bounds, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'

type Props = {
  kind: string
  url: string
  maps?: Record<string, string>
  roughness: number
  metalness: number
}
function Model({ url }: { url: string }) {
  const gltf = useGLTF(url)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  return <primitive object={model} />
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
              <Model url={p.url} />
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
