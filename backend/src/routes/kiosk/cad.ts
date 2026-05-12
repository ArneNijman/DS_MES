import { FastifyInstance } from 'fastify'
import { readFile, writeFile, access } from 'fs/promises'
import { join, basename } from 'path'

const UPLOADS_DIR = '/app/uploads'

let occtInstance: any = null

async function getOcct(): Promise<any> {
  if (occtInstance) return occtInstance
  const initOcct = (await import('occt-import-js')).default
  const wasmFile   = await readFile('/app/node_modules/occt-import-js/dist/occt-import-js.wasm')
  const wasmBinary = wasmFile.buffer.slice(wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength)
  occtInstance = await (initOcct as any)({ wasmBinary })
  return occtInstance
}

export async function kioskCadRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // GET /kiosk/cad/mesh?url=/uploads/xxx.stp
  // Parses STEP server-side and returns binary mesh data (cached as .mesh.bin)
  fastify.get('/kiosk/cad/mesh', auth, async (req, reply) => {
    const { url } = req.query as { url?: string }
    if (!url?.startsWith('/uploads/')) {
      return reply.status(400).send({ error: 'Ongeldige URL' })
    }

    const filename = basename(url)
    if (!/\.(stp|step|cad)$/i.test(filename)) {
      return reply.status(400).send({ error: 'Alleen STP/STEP/CAD bestanden worden ondersteund' })
    }

    const filePath  = join(UPLOADS_DIR, filename)
    const cachePath = filePath + '.mesh.bin'

    // Serve cached result if available
    try {
      await access(cachePath)
      const cached = await readFile(cachePath)
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Cache-Control', 'max-age=86400')
        .send(cached)
    } catch { /* cache miss, parse below */ }

    // Read the STP file
    let fileData: Buffer
    try {
      fileData = await readFile(filePath)
    } catch {
      return reply.status(404).send({ error: 'Bestand niet gevonden' })
    }

    // Parse with OCCT (singleton — initialises once per backend process)
    fastify.log.info(`CAD: OCCT initialiseren voor ${filename}`)
    const occt   = await getOcct()
    fastify.log.info(`CAD: OCCT klaar, bestand parsen (${fileData.length} bytes)`)
    const u8     = new Uint8Array(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength))
    const result = occt.ReadStepFile(u8, null)
    fastify.log.info(`CAD: Parse resultaat — success=${result.success}, meshes=${result.meshes?.length ?? 0}`)
    if (!result.success) {
      return reply.status(422).send({ error: 'STEP parse mislukt' })
    }

    // Encode meshes as compact binary:
    //  [meshcount u32]
    //  per mesh: [namelen u32][name utf8][vertcount u32][hasNorms u32][verts f32...][norms f32...]
    const enc   = new TextEncoder()
    const parts: Buffer[] = []

    const hdr = Buffer.alloc(4)
    hdr.writeUInt32LE(result.meshes.length)
    parts.push(hdr)

    for (let mi = 0; mi < result.meshes.length; mi++) {
      const m     = result.meshes[mi]
      const name  = m.name ?? `Part ${mi + 1}`
      const nameB = enc.encode(name)

      // occt-import-js v0.0.x stores data in:
      //   m.index.array        — flat triangle-index array
      //   m.attributes.position.array — flat vertex positions (x,y,z per vertex)
      //   m.attributes.normal?.array  — flat normals (optional)
      const idxArr  = m.index?.array as number[] | undefined
      const posArr  = m.attributes?.position?.array as number[] | undefined
      const normArr = m.attributes?.normal?.array  as number[] | undefined

      if (!idxArr || !posArr || idxArr.length === 0) continue

      const triangleCount = Math.floor(idxArr.length / 3)
      const count         = triangleCount * 3

      const verts = new Float32Array(count * 3)
      const norms = normArr ? new Float32Array(count * 3) : null

      for (let fi = 0; fi < triangleCount; fi++) {
        for (let vi = 0; vi < 3; vi++) {
          const out = (fi * 3 + vi) * 3
          const idx = idxArr[fi * 3 + vi]
          verts[out]     = posArr[idx * 3]
          verts[out + 1] = posArr[idx * 3 + 1]
          verts[out + 2] = posArr[idx * 3 + 2]
          if (norms && normArr) {
            norms[out]     = normArr[idx * 3]
            norms[out + 1] = normArr[idx * 3 + 1]
            norms[out + 2] = normArr[idx * 3 + 2]
          }
        }
      }

      const nl = Buffer.alloc(4); nl.writeUInt32LE(nameB.length)
      const vc = Buffer.alloc(4); vc.writeUInt32LE(verts.length)
      const hn = Buffer.alloc(4); hn.writeUInt32LE(norms ? 1 : 0)

      parts.push(nl, Buffer.from(nameB), vc, hn)
      parts.push(Buffer.from(verts.buffer))
      if (norms) parts.push(Buffer.from(norms.buffer))
    }

    const combined = Buffer.concat(parts)

    // Cache for next request
    writeFile(cachePath, combined).catch(() => {})

    return reply
      .header('Content-Type', 'application/octet-stream')
      .send(combined)
  })
}
