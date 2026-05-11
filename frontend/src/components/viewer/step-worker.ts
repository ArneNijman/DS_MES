// Web Worker: STEP parsing off the main thread (persistent — OCCT initialised once)
import initOcctModule from 'occt-import-js'

interface MeshData {
  verts: Float32Array
  norms: Float32Array | null
  name:  string
}

type InMsg =
  | { type: 'init';  wasmUrl: string }
  | { type: 'parse'; url: string; id: number }

let occt: any = null

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data

  if (msg.type === 'init') {
    try {
      occt = await (initOcctModule as any)({ locateFile: () => msg.wasmUrl })
      self.postMessage({ type: 'ready' })
    } catch (err: any) {
      self.postMessage({ type: 'init-error', error: err?.message ?? 'Init mislukt' })
    }
    return
  }

  if (msg.type === 'parse') {
    const { url, id } = msg
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const u8  = new Uint8Array(buf)

      const result = occt.ReadStepFile(u8, null)
      if (!result.success) throw new Error('STEP parse mislukt')

      const meshes: MeshData[] = []
      const transfers: ArrayBuffer[] = []

      for (let mi = 0; mi < result.meshes.length; mi++) {
        const m     = result.meshes[mi]
        const count = m.triangleCount * 3
        const verts = new Float32Array(count * 3)
        const norms = m.normals ? new Float32Array(count * 3) : null

        for (let fi = 0; fi < m.triangleCount; fi++) {
          for (let vi = 0; vi < 3; vi++) {
            const out = (fi * 3 + vi) * 3
            const idx = m.triangleIndices[fi * 3 + vi]
            verts[out]     = m.vertices[idx * 3]
            verts[out + 1] = m.vertices[idx * 3 + 1]
            verts[out + 2] = m.vertices[idx * 3 + 2]
            if (norms) {
              norms[out]     = m.normals[idx * 3]
              norms[out + 1] = m.normals[idx * 3 + 1]
              norms[out + 2] = m.normals[idx * 3 + 2]
            }
          }
        }

        transfers.push(verts.buffer)
        if (norms) transfers.push(norms.buffer)
        meshes.push({ verts, norms, name: m.name ?? `Part ${mi + 1}` })
      }

      self.postMessage({ type: 'parse-ok', id, meshes }, transfers)
    } catch (err: any) {
      self.postMessage({ type: 'parse-error', id, error: err?.message ?? 'Parse mislukt' })
    }
  }
}
