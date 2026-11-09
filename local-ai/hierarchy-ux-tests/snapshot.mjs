import { writeFile } from 'node:fs/promises'
const { scenes } = await fetch('http://127.0.0.1:3002/api/scenes').then((r) =>
  r.json(),
)
const out = {}
for (const s of scenes)
  out[s.id] = (
    await fetch('http://127.0.0.1:3002/api/scenes/' + s.id).then((r) =>
      r.json(),
    )
  ).graph
await writeFile(
  new URL('./original-scenes.json', import.meta.url),
  JSON.stringify(out),
)
console.log('Saved', scenes.length, 'original scenes')
