import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'

THREE.Mesh.prototype.raycast = acceleratedRaycast

// ─── Types ────────────────────────────────────────────────────────────────────

interface CadViewerProps {
  url: string
  fileName?: string
  compareUrl?: string
  compareFileName?: string
  allCadFiles?: { fileUrl: string; fileName: string }[]
}

interface Annotation {
  id: number
  position: THREE.Vector3
  text: string
}

interface MeasurePoint {
  position: THREE.Vector3
  screenX: number
  screenY: number
}

interface PartNode {
  name: string
  mesh: THREE.Mesh
  visible: boolean
  highlighted: boolean
}

interface ModelStats {
  volumeCm3: number
  weightKg: number
  surfaceCm2: number
  sizeX: number
  sizeY: number
  sizeZ: number
  centerOfMass: THREE.Vector3
}

type ViewMode = 'solid' | 'wireframe'
type ActiveTool = 'none' | 'measure' | 'annotate' | 'face-select'
type ClipAxis = 'none' | 'x' | 'y' | 'z'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeVolumeMm3(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const pos = g.attributes.position
  let vol = 0
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i),   ay = pos.getY(i),   az = pos.getZ(i)
    const bx = pos.getX(i+1), by = pos.getY(i+1), bz = pos.getZ(i+1)
    const cx = pos.getX(i+2), cy = pos.getY(i+2), cz = pos.getZ(i+2)
    vol += (ax*(by*cz - bz*cy) + bx*(cy*az - cz*ay) + cx*(ay*bz - az*by)) / 6
  }
  return Math.abs(vol)
}

function computeSurfaceMm2(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const pos = g.attributes.position
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let area = 0
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i+1)
    c.fromBufferAttribute(pos, i+2)
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
  }
  return area
}

function computeCenterOfMass(geo: THREE.BufferGeometry): THREE.Vector3 {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const pos = g.attributes.position
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const centroid = new THREE.Vector3()
  let totalArea = 0
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i+1)
    c.fromBufferAttribute(pos, i+2)
    const triArea = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
    const triCenter = a.clone().add(b).add(c).divideScalar(3)
    centroid.addScaledVector(triCenter, triArea)
    totalArea += triArea
  }
  if (totalArea > 0) centroid.divideScalar(totalArea)
  return centroid
}

function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
) {
  const center = box.getCenter(new THREE.Vector3())
  const size   = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov    = camera.fov * (Math.PI / 180)
  const dist   = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.5
  const dir    = camera.position.clone().sub(controls.target).normalize()
  camera.position.copy(center).addScaledVector(dir.length() > 0 ? dir : new THREE.Vector3(1,1,1).normalize(), dist)
  controls.target.copy(center)
  camera.near = dist * 0.01
  camera.far  = dist * 100
  camera.updateProjectionMatrix()
  controls.update()
}

async function loadStepGeometry(url: string): Promise<{ meshes: { geo: THREE.BufferGeometry; name: string }[] }> {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const u8  = new Uint8Array(buf)

  // dynamically import to keep initial bundle lean
  const initOcct = (await import('occt-import-js')).default
  // @ts-ignore – vite ?url import
  const wasmUrl  = new URL('occt-import-js/dist/occt-import-js.wasm', import.meta.url).href
  const occt     = await initOcct({ locateFile: () => wasmUrl })

  const result = occt.ReadStepFile(u8, null)
  if (!result.success) throw new Error('STEP parse failed')

  const meshes: { geo: THREE.BufferGeometry; name: string }[] = []
  for (let mi = 0; mi < result.meshes.length; mi++) {
    const m    = result.meshes[mi]
    const geo  = new THREE.BufferGeometry()
    const verts: number[] = []
    const norms: number[] = []
    for (let fi = 0; fi < m.triangleCount; fi++) {
      for (let vi = 0; vi < 3; vi++) {
        const idx = m.triangleIndices[fi * 3 + vi]
        verts.push(m.vertices[idx * 3], m.vertices[idx * 3 + 1], m.vertices[idx * 3 + 2])
        if (m.normals) norms.push(m.normals[idx * 3], m.normals[idx * 3 + 1], m.normals[idx * 3 + 2])
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    if (norms.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
    else geo.computeVertexNormals()
    meshes.push({ geo, name: m.name ?? `Part ${mi + 1}` })
  }
  return { meshes }
}

async function loadStlGeometry(url: string): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    new STLLoader().load(url, resolve, undefined, reject)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CadViewer({ url, fileName, compareUrl, compareFileName, allCadFiles = [] }: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const frameRef     = useRef<number>(0)
  const mainGroupRef = useRef<THREE.Group | null>(null)
  const cmpGroupRef  = useRef<THREE.Group | null>(null)
  const bomMeshRef   = useRef<THREE.Mesh | null>(null)  // single merged mesh for raycasting
  const modelBoxRef  = useRef<THREE.Box3>(new THREE.Box3())
  const annotationMeshesRef = useRef<THREE.Mesh[]>([])
  const measureObjsRef      = useRef<THREE.Object3D[]>([])
  const clipPlaneRef        = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(1,0,0), 0))

  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [stats, setStats]           = useState<ModelStats | null>(null)

  const [viewMode, setViewMode]         = useState<ViewMode>('solid')
  const [opacity, setOpacity]           = useState(1)
  const [activeTool, setActiveTool]     = useState<ActiveTool>('none')
  const [clipAxis, setClipAxis]         = useState<ClipAxis>('none')
  const [clipValue, setClipValue]       = useState(0)
  const [clipRange, setClipRange]       = useState<[number,number]>([0,1])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showTree, setShowTree]         = useState(false)
  const [explodeFactor, setExplodeFactor] = useState(0)
  const [compareMode, setCompareMode]   = useState(false)
  const [compareTarget, setCompareTarget] = useState<string | null>(compareUrl ?? null)
  const [showCompareSelector, setShowCompareSelector] = useState(false)

  const [parts, setParts]           = useState<PartNode[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotInput, setAnnotInput]   = useState<{ x: number; y: number; pos3d: THREE.Vector3 } | null>(null)
  const [annotText, setAnnotText]     = useState('')
  const [annotIdCounter, setAnnotIdCounter] = useState(0)

  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([])
  const [measureDist, setMeasureDist]     = useState<number | null>(null)

  const [coordReadout, setCoordReadout] = useState<{ x: number; y: number; z: number } | null>(null)
  const [faceInfo, setFaceInfo]         = useState<{ areaMm2: number; edgeMm: number | null } | null>(null)
  const [selectedFaceMesh, setSelectedFaceMesh] = useState<THREE.Mesh | null>(null)

  // ── Init Three.js ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas    = canvasRef.current!
    const container = containerRef.current!

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.localClippingEnabled = true
    renderer.setClearColor(0xf8f9fa)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(1, 2, 3)
    scene.add(dirLight)
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3)
    dirLight2.position.set(-1, -1, -2)
    scene.add(dirLight2)

    const axes = new THREE.AxesHelper(50)
    scene.add(axes)

    const grid = new THREE.GridHelper(500, 50, 0xcccccc, 0xe8e8e8)
    scene.add(grid)

    const w = container.clientWidth  || container.offsetWidth  || 800
    const h = container.clientHeight || container.offsetHeight || 400
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000)
    camera.position.set(200, 150, 200)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

    renderer.setSize(w, h)

    const resize = () => {
      const w2 = container.clientWidth  || container.offsetWidth  || 800
      const h2 = container.clientHeight || container.offsetHeight || 400
      if (w2 === 0 || h2 === 0) return
      renderer.setSize(w2, h2)
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      controls.dispose()
      renderer.dispose()
    }
  }, [])

  // ── Load model ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return

    setLoading(true)
    setLoadError(null)
    setStats(null)
    setMeasurePoints([])
    setMeasureDist(null)
    setAnnotations([])
    setFaceInfo(null)
    setParts([])

    if (mainGroupRef.current) {
      sceneRef.current.remove(mainGroupRef.current)
      mainGroupRef.current = null
    }
    measureObjsRef.current.forEach(o => sceneRef.current!.remove(o))
    measureObjsRef.current = []

    const isStep = /\.(stp|step)$/i.test(url)

    async function doLoad() {
      try {
        const group  = new THREE.Group()
        const partNodes: PartNode[] = []

        if (isStep) {
          const { meshes } = await loadStepGeometry(url)
          for (const { geo, name } of meshes) {
            geo.computeBoundingBox()
            geo.computeVertexNormals()
            ;(geo as any).boundsTree = new MeshBVH(geo)
            const mat  = buildMaterial(viewMode, opacity)
            const mesh = new THREE.Mesh(geo, mat)
            mesh.name  = name
            group.add(mesh)
            partNodes.push({ name, mesh, visible: true, highlighted: false })
          }
        } else {
          const geo = await loadStlGeometry(url)
          geo.computeVertexNormals()
          ;(geo as any).boundsTree = new MeshBVH(geo)
          const mat  = buildMaterial(viewMode, opacity)
          const mesh = new THREE.Mesh(geo, mat)
          mesh.name  = fileName ?? 'Model'
          group.add(mesh)
          partNodes.push({ name: mesh.name, mesh, visible: true, highlighted: false })
        }

        sceneRef.current!.add(group)
        mainGroupRef.current = group

        const box = new THREE.Box3().setFromObject(group)
        modelBoxRef.current = box
        fitCameraToBox(cameraRef.current!, controlsRef.current!, box)

        const size = box.getSize(new THREE.Vector3())
        const com  = computeCenterOfMass(
          (group.children[0] as THREE.Mesh).geometry
        )

        // zwaartepunt bolletje
        const comSphere = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(size.x, size.y, size.z) * 0.015, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xff8800 }),
        )
        comSphere.position.copy(com)
        group.add(comSphere)

        // stats berekeningen op eerste / merged geometry
        const firstGeo = (group.children[0] as THREE.Mesh).geometry
        const mm3 = computeVolumeMm3(firstGeo)
        const cm3 = mm3 / 1000
        const mm2 = computeSurfaceMm2(firstGeo)
        setStats({
          volumeCm3: cm3,
          weightKg: cm3 * 0.00785,
          surfaceCm2: mm2 / 100,
          sizeX: Math.round(size.x * 10) / 10,
          sizeY: Math.round(size.y * 10) / 10,
          sizeZ: Math.round(size.z * 10) / 10,
          centerOfMass: com,
        })

        setClipRange([box.min.x, box.max.x])
        setClipValue((box.min.x + box.max.x) / 2)

        // grid op onderkant model zetten
        const gridObj = sceneRef.current!.children.find(c => c instanceof THREE.GridHelper)
        if (gridObj) gridObj.position.y = box.min.y

        setParts(partNodes)
        // bewaar eerste mesh voor raycasting
        bomMeshRef.current = partNodes[0]?.mesh ?? null
      } catch (err) {
        setLoadError(String(err))
      } finally {
        setLoading(false)
      }
    }

    doLoad()
  }, [url])

  // ── Compare model ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    if (cmpGroupRef.current) {
      sceneRef.current.remove(cmpGroupRef.current)
      cmpGroupRef.current = null
    }
    if (!compareMode || !compareTarget) return

    const isStep = /\.(stp|step)$/i.test(compareTarget)
    async function loadCompare() {
      try {
        const group = new THREE.Group()
        if (isStep) {
          const { meshes } = await loadStepGeometry(compareTarget!)
          for (const { geo, name } of meshes) {
            geo.computeVertexNormals()
            const mat  = new THREE.MeshPhongMaterial({ color: 0xff3333, transparent: true, opacity: 0.45, depthWrite: false })
            const mesh = new THREE.Mesh(geo, mat)
            mesh.name  = name
            group.add(mesh)
          }
        } else {
          const geo = await loadStlGeometry(compareTarget!)
          geo.computeVertexNormals()
          const mat  = new THREE.MeshPhongMaterial({ color: 0xff3333, transparent: true, opacity: 0.45, depthWrite: false })
          const mesh = new THREE.Mesh(geo, mat)
          group.add(mesh)
        }

        // align by bounding box center
        if (mainGroupRef.current) {
          const mainBox = new THREE.Box3().setFromObject(mainGroupRef.current)
          const cmpBox  = new THREE.Box3().setFromObject(group)
          const mainCenter = mainBox.getCenter(new THREE.Vector3())
          const cmpCenter  = cmpBox.getCenter(new THREE.Vector3())
          group.position.sub(cmpCenter).add(mainCenter)
        }

        // make main model semi-transparent blue
        mainGroupRef.current?.traverse(o => {
          if (o instanceof THREE.Mesh && !(o.geometry instanceof THREE.SphereGeometry)) {
            const m = o.material as THREE.MeshPhongMaterial
            m.color.set(0x3366ff)
            m.transparent = true
            m.opacity = 0.45
            m.depthWrite = false
          }
        })

        sceneRef.current!.add(group)
        cmpGroupRef.current = group
      } catch {}
    }
    loadCompare()

    return () => {
      // restore main model material on cleanup
      mainGroupRef.current?.traverse(o => {
        if (o instanceof THREE.Mesh && !(o.geometry instanceof THREE.SphereGeometry)) {
          const m = o.material as THREE.MeshPhongMaterial
          m.color.set(0x88aacc)
          m.transparent = opacity < 1
          m.opacity = opacity
          m.depthWrite = opacity >= 1
        }
      })
    }
  }, [compareMode, compareTarget])

  // ── View mode / opacity ──────────────────────────────────────────────────
  useEffect(() => {
    mainGroupRef.current?.traverse(o => {
      if (o instanceof THREE.Mesh && !(o.geometry instanceof THREE.SphereGeometry)) {
        o.material = buildMaterial(viewMode, opacity)
      }
    })
  }, [viewMode, opacity])

  // ── Clipping plane ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!rendererRef.current) return
    if (clipAxis === 'none') {
      rendererRef.current.clippingPlanes = []
      return
    }
    const normal = clipAxis === 'x' ? new THREE.Vector3(1,0,0)
                 : clipAxis === 'y' ? new THREE.Vector3(0,1,0)
                 :                    new THREE.Vector3(0,0,1)
    clipPlaneRef.current.normal.copy(normal)
    clipPlaneRef.current.constant = -clipValue
    rendererRef.current.clippingPlanes = [clipPlaneRef.current]
  }, [clipAxis, clipValue])

  useEffect(() => {
    if (clipAxis !== 'none') {
      const box = modelBoxRef.current
      const [min, max] = clipAxis === 'x' ? [box.min.x, box.max.x]
                       : clipAxis === 'y' ? [box.min.y, box.max.y]
                       :                    [box.min.z, box.max.z]
      setClipRange([min, max])
      setClipValue((min + max) / 2)
    }
  }, [clipAxis])

  // ── Exploded view ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (parts.length < 2) return
    const box = modelBoxRef.current
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = box.getSize(new THREE.Vector3()).length()
    parts.forEach(p => {
      const partCenter = new THREE.Box3().setFromObject(p.mesh).getCenter(new THREE.Vector3())
      const dir = partCenter.clone().sub(center).normalize()
      if (dir.length() < 0.001) return
      p.mesh.position.copy(dir.multiplyScalar(explodeFactor * maxDim * 0.5))
    })
  }, [explodeFactor, parts])

  // ── Mouse events ──────────────────────────────────────────────────────────
  const getRaycastHit = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const mouse  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, cameraRef.current!)
    const targets: THREE.Mesh[] = []
    mainGroupRef.current?.traverse(o => { if (o instanceof THREE.Mesh) targets.push(o) })
    const hits = raycaster.intersectObjects(targets)
    return hits[0] ?? null
  }, [])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = getRaycastHit(e)
    if (!hit) return

    if (activeTool === 'measure') {
      const pt: MeasurePoint = { position: hit.point.clone(), screenX: e.clientX, screenY: e.clientY }
      setMeasurePoints(prev => {
        if (prev.length >= 2) {
          clearMeasureObjects()
          const updated = [pt]
          return updated
        }
        const updated = [...prev, pt]
        if (updated.length === 2) {
          const dist = updated[0].position.distanceTo(updated[1].position)
          setMeasureDist(dist)
          drawMeasureLine(updated[0].position, updated[1].position)
        }
        return updated
      })

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00aaff }),
      )
      dot.position.copy(hit.point)
      sceneRef.current!.add(dot)
      measureObjsRef.current.push(dot)
    }

    if (activeTool === 'annotate') {
      const canvas = canvasRef.current!
      const rect   = canvas.getBoundingClientRect()
      setAnnotInput({ x: e.clientX - rect.left, y: e.clientY - rect.top, pos3d: hit.point.clone() })
    }

    if (activeTool === 'face-select') {
      const geo   = (hit.object as THREE.Mesh).geometry
      const idx   = hit.faceIndex ?? 0
      const posAttr = geo.attributes.position
      const a = new THREE.Vector3().fromBufferAttribute(posAttr, idx * 3)
      const b = new THREE.Vector3().fromBufferAttribute(posAttr, idx * 3 + 1)
      const c = new THREE.Vector3().fromBufferAttribute(posAttr, idx * 3 + 2)
      const areaMm2 = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
      const edgeLens = [a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)]
      const edgeMm = Math.max(...edgeLens)
      setFaceInfo({ areaMm2, edgeMm })

      if (selectedFaceMesh) sceneRef.current?.remove(selectedFaceMesh)
      const faceGeo = new THREE.BufferGeometry()
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z
      ], 3))
      const faceMesh = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ color: 0xffdd00, side: THREE.DoubleSide }))
      sceneRef.current!.add(faceMesh)
      setSelectedFaceMesh(faceMesh)
    }
  }, [activeTool, selectedFaceMesh])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = getRaycastHit(e)
    if (hit) {
      setCoordReadout({
        x: Math.round(hit.point.x * 10) / 10,
        y: Math.round(hit.point.y * 10) / 10,
        z: Math.round(hit.point.z * 10) / 10,
      })
    } else {
      setCoordReadout(null)
    }
  }, [getRaycastHit])

  function drawMeasureLine(p1: THREE.Vector3, p2: THREE.Vector3) {
    const geo  = new THREE.BufferGeometry().setFromPoints([p1, p2])
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00aaff, linewidth: 2 }))
    sceneRef.current!.add(line)
    measureObjsRef.current.push(line)
  }

  function clearMeasureObjects() {
    measureObjsRef.current.forEach(o => sceneRef.current?.remove(o))
    measureObjsRef.current = []
    setMeasurePoints([])
    setMeasureDist(null)
  }

  // ── View presets ──────────────────────────────────────────────────────────
  function setView(preset: 'iso' | 'top' | 'front' | 'right') {
    const camera   = cameraRef.current!
    const controls = controlsRef.current!
    const box      = modelBoxRef.current
    const center   = box.getCenter(new THREE.Vector3())
    const size     = box.getSize(new THREE.Vector3())
    const dist     = Math.max(size.x, size.y, size.z) * 2

    const dirs: Record<string, THREE.Vector3> = {
      iso:   new THREE.Vector3(1,1,1).normalize(),
      top:   new THREE.Vector3(0,1,0),
      front: new THREE.Vector3(0,0,1),
      right: new THREE.Vector3(1,0,0),
    }
    camera.position.copy(center).addScaledVector(dirs[preset], dist)
    controls.target.copy(center)
    controls.update()
  }

  function zoomToFit() {
    fitCameraToBox(cameraRef.current!, controlsRef.current!, modelBoxRef.current)
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  function takeScreenshot() {
    const renderer = rendererRef.current!
    renderer.render(sceneRef.current!, cameraRef.current!)
    const link    = document.createElement('a')
    link.download = `cad-${(fileName ?? 'model').replace(/\.[^.]+$/, '')}.png`
    link.href     = renderer.domElement.toDataURL('image/png')
    link.click()
  }

  // ── Annotations ──────────────────────────────────────────────────────────
  function confirmAnnotation() {
    if (!annotInput || !annotText.trim()) { setAnnotInput(null); return }
    setAnnotations(prev => [...prev, { id: annotIdCounter, position: annotInput.pos3d, text: annotText.trim() }])
    setAnnotIdCounter(c => c + 1)
    setAnnotText('')
    setAnnotInput(null)
  }

  function project3dToScreen(pos: THREE.Vector3): { x: number; y: number } | null {
    if (!cameraRef.current || !canvasRef.current) return null
    const canvas = canvasRef.current
    const v      = pos.clone().project(cameraRef.current)
    return {
      x: (v.x + 1) / 2 * canvas.clientWidth,
      y: -(v.y - 1) / 2 * canvas.clientHeight,
    }
  }

  // ── Part visibility ───────────────────────────────────────────────────────
  function togglePartVisible(idx: number) {
    setParts(prev => prev.map((p, i) => {
      if (i !== idx) return p
      p.mesh.visible = !p.visible
      return { ...p, visible: !p.visible }
    }))
  }

  function togglePartHighlight(idx: number) {
    setParts(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const hl = !p.highlighted
      ;(p.mesh.material as THREE.MeshPhongMaterial).color.set(hl ? 0xffaa00 : 0x88aacc)
      return { ...p, highlighted: hl }
    }))
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative flex-1 w-full bg-gray-100 select-none" style={{ minHeight: 400 }}>
      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur border-b border-gray-200 flex-wrap">
        <span className="text-[11px] font-medium text-gray-600 mr-1 truncate max-w-[120px]" title={fileName}>{fileName ?? 'Model'}</span>
        <div className="flex gap-0.5 border-r border-gray-200 pr-2 mr-1">
          {(['iso','top','front','right'] as const).map(v => {
            const label = v === 'front' ? 'Voor' : v === 'right' ? 'Rechts' : v.charAt(0).toUpperCase() + v.slice(1)
            const tips: Record<string, string> = { iso: 'Isometrisch aanzicht', top: 'Bovenaanzicht', front: 'Vooraanzicht', right: 'Rechteraanzicht' }
            return (
              <Tip key={v} tip={tips[v]} pos="bottom">
                <button onClick={() => setView(v)} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 hover:bg-teal-100 hover:text-teal-700 text-gray-600 font-medium uppercase">{label}</button>
              </Tip>
            )
          })}
        </div>
        <Tip tip="Zoom naar model — centreert en past camera aan op het hele model" pos="bottom">
          <button onClick={zoomToFit} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
          </button>
        </Tip>
        <Tip tip={isFullscreen ? 'Volledig scherm sluiten' : 'Volledig scherm — vergroot viewer naar het hele scherm'} pos="bottom">
          <button onClick={toggleFullscreen} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            {isFullscreen
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            }
          </button>
        </Tip>
        <Tip tip="Screenshot — slaat het huidige 3D-aanzicht op als PNG afbeelding" pos="bottom">
          <button onClick={takeScreenshot} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </button>
        </Tip>
        {parts.length > 1 && (
          <Tip tip="Assembly boom — toon de onderdelen van dit STEP-bestand, verberg of markeer individuele parts" pos="bottom">
            <button onClick={() => setShowTree(v => !v)} className={`p-1 rounded text-gray-500 ${showTree ? 'bg-teal-100 text-teal-700' : 'hover:bg-gray-100'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v4H3zM3 10h8v4H3zM3 17h8v4H3zM15 12h6v4h-6zM18 16v5"/></svg>
            </button>
          </Tip>
        )}
      </div>

      {/* Assembly tree sidebar */}
      {showTree && parts.length > 1 && (
        <div className="absolute top-9 left-0 z-20 w-48 max-h-64 overflow-auto bg-white/95 border border-gray-200 rounded-br-lg shadow text-[11px]">
          {parts.map((p, i) => (
            <div key={i} className="flex items-center gap-1 px-2 py-1 hover:bg-gray-50 border-b border-gray-100">
              <button onClick={() => togglePartVisible(i)} className={`w-3 h-3 rounded border ${p.visible ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`} />
              <span className="flex-1 truncate text-gray-700" onClick={() => togglePartHighlight(i)}>{p.name}</span>
              <span className={`w-2 h-2 rounded-full ${p.highlighted ? 'bg-orange-400' : 'bg-transparent'}`} />
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: activeTool !== 'none' ? 'crosshair' : 'grab' }}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
      />

      {/* Coordinate readout */}
      {coordReadout && (
        <div className="absolute bottom-14 right-2 z-20 text-[10px] text-gray-500 bg-white/80 px-2 py-0.5 rounded pointer-events-none">
          X: {coordReadout.x} &nbsp; Y: {coordReadout.y} &nbsp; Z: {coordReadout.z} mm
        </div>
      )}

      {/* Measure distance label */}
      {measureDist !== null && measurePoints.length === 2 && (() => {
        const s = project3dToScreen(
          measurePoints[0].position.clone().add(measurePoints[1].position).multiplyScalar(0.5)
        )
        return s ? (
          <div className="absolute z-20 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded pointer-events-none"
               style={{ left: s.x + 4, top: s.y + 36 }}>
            {Math.round(measureDist * 10) / 10} mm
          </div>
        ) : null
      })()}

      {/* Annotation labels */}
      {annotations.map(ann => {
        const s = project3dToScreen(ann.position)
        if (!s) return null
        return (
          <div key={ann.id} className="absolute z-20 bg-yellow-400 text-gray-900 text-[10px] font-medium px-2 py-0.5 rounded shadow pointer-events-none"
               style={{ left: s.x + 4, top: s.y + 36 }}>
            {ann.text}
          </div>
        )
      })}

      {/* Annotation input popup */}
      {annotInput && (
        <div className="absolute z-30 bg-white border border-gray-300 rounded-lg shadow-lg p-2 flex gap-1"
             style={{ left: annotInput.x + 4, top: annotInput.y + 36 }}>
          <input
            autoFocus
            className="text-xs border border-gray-200 rounded px-2 py-1 w-40 outline-none"
            placeholder="Annotatie tekst…"
            value={annotText}
            onChange={e => setAnnotText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmAnnotation(); if (e.key === 'Escape') setAnnotInput(null) }}
          />
          <button onClick={confirmAnnotation} className="text-xs px-2 py-1 bg-teal-600 text-white rounded hover:bg-teal-700">OK</button>
          <button onClick={() => setAnnotInput(null)} className="text-xs px-1 py-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Face info popup */}
      {faceInfo && (
        <div className="absolute z-20 top-10 right-2 bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-[11px] text-gray-700">
          <div className="font-semibold text-gray-800 mb-1">Geselecteerd vlak</div>
          <div>Opp: <b>{Math.round(faceInfo.areaMm2 * 10) / 10} mm²</b></div>
          {faceInfo.edgeMm !== null && <div>Langste zijde: <b>{Math.round(faceInfo.edgeMm * 10) / 10} mm</b></div>}
          <button onClick={() => { setFaceInfo(null); if (selectedFaceMesh) { sceneRef.current?.remove(selectedFaceMesh); setSelectedFaceMesh(null) } }} className="mt-1 text-[10px] text-gray-400 hover:text-red-500">Sluiten</button>
        </div>
      )}

      {/* Compare legend */}
      {compareMode && (
        <div className="absolute z-20 top-10 left-2 bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-[10px] text-gray-700 space-y-0.5">
          <div className="font-semibold text-gray-800 mb-1">Vergelijking</div>
          <div><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1" />Oud (v1)</div>
          <div><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1" />Nieuw (v2)</div>
          <div><span className="inline-block w-3 h-3 rounded-full bg-purple-500 mr-1" />Ongewijzigd</div>
        </div>
      )}

      {/* Compare selector dropdown */}
      {showCompareSelector && (
        <div className="absolute z-30 top-9 right-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-[11px] max-w-xs">
          <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-b border-gray-100">Kies vergelijkingsbestand</div>
          {allCadFiles.filter(f => f.fileUrl !== url).map(f => (
            <button key={f.fileUrl}
              onClick={() => { setCompareTarget(f.fileUrl); setCompareMode(true); setShowCompareSelector(false) }}
              className="w-full text-left px-3 py-2 hover:bg-teal-50 text-gray-700 truncate border-b border-gray-50"
            >
              {f.fileName}
            </button>
          ))}
          <button onClick={() => setShowCompareSelector(false)} className="w-full px-3 py-2 text-gray-400 hover:bg-gray-50">Annuleren</button>
        </div>
      )}

      {/* Clipping plane slider */}
      {clipAxis !== 'none' && (
        <div className="absolute z-20 bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 border border-gray-200 rounded-full px-3 py-1 shadow text-[11px]">
          <span className="font-semibold text-gray-600 uppercase">{clipAxis}</span>
          <input type="range" min={clipRange[0]} max={clipRange[1]} step={(clipRange[1]-clipRange[0])/200}
            value={clipValue} onChange={e => setClipValue(+e.target.value)}
            className="w-32 accent-teal-600" />
          <span className="text-gray-500">{Math.round(clipValue)} mm</span>
          <button onClick={() => { setClipAxis('none') }} className="text-gray-400 hover:text-red-500 ml-1">✕</button>
        </div>
      )}

      {/* Exploded view slider */}
      {parts.length > 1 && explodeFactor > 0 && (
        <div className="absolute z-20 bottom-14 right-2 flex items-center gap-2 bg-white/90 border border-gray-200 rounded-full px-3 py-1 shadow text-[11px]">
          <span className="text-gray-600">Exploded</span>
          <input type="range" min={0} max={1} step={0.01} value={explodeFactor}
            onChange={e => setExplodeFactor(+e.target.value)}
            className="w-24 accent-orange-400" />
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur border-t border-gray-200 flex-wrap">
        {/* Tool buttons */}
        <ToolBtn active={activeTool === 'measure'} onClick={() => setActiveTool(v => v === 'measure' ? 'none' : 'measure')} label="Meten"
          tooltip="Meten — klik twee punten op het model om de afstand in mm te tonen" />
        {measureDist !== null && (
          <Tip tip="Verwijder alle meetlijnen en punten" pos="top">
            <button onClick={clearMeasureObjects} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500">Wis</button>
          </Tip>
        )}
        <ToolBtn active={viewMode === 'wireframe'} onClick={() => setViewMode(v => v === 'wireframe' ? 'solid' : 'wireframe')} label="Draad"
          tooltip="Draadmodel — wissel tussen volledig model en draadframe weergave" />
        <ToolBtn active={activeTool === 'face-select'} onClick={() => setActiveTool(v => v === 'face-select' ? 'none' : 'face-select')} label="Vlak"
          tooltip="Vlakselectie — klik op een vlak om het oppervlak en de langste zijde te meten" />
        <ToolBtn active={activeTool === 'annotate'} onClick={() => setActiveTool(v => v === 'annotate' ? 'none' : 'annotate')} label="Notitie"
          tooltip="Annotatie — klik op het model om een tekstnotitie te plaatsen op die positie" />
        {annotations.length > 0 && (
          <Tip tip="Verwijder alle geplaatste annotaties van het model" pos="top">
            <button onClick={() => setAnnotations([])} className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500">Wis notities</button>
          </Tip>
        )}

        {/* Doorsnede */}
        <div className="flex gap-0.5 border-l border-gray-200 pl-1 ml-1 items-center">
          <span className="text-[10px] text-gray-400 self-center">Snijvlak:</span>
          {(['x','y','z'] as const).map(ax => (
            <Tip key={ax} tip={`Doorsnede langs de ${ax.toUpperCase()}-as — gebruik de schuifregelaar om het snijvlak te verschuiven`} pos="top">
              <button onClick={() => setClipAxis(v => v === ax ? 'none' : ax)}
                className={`px-1.5 py-0.5 text-[10px] rounded font-semibold uppercase ${clipAxis === ax ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-teal-50 text-gray-600'}`}>
                {ax}
              </button>
            </Tip>
          ))}
        </div>

        {/* Exploded */}
        {parts.length > 1 && (
          <Tip tip="Exploded view — beweeg de onderdelen van de assembly uiteen om de opbouw te zien" pos="top">
            <button onClick={() => setExplodeFactor(v => v > 0 ? 0 : 0.3)}
              className={`px-1.5 py-0.5 text-[10px] rounded ml-1 ${explodeFactor > 0 ? 'bg-orange-400 text-white' : 'bg-gray-100 hover:bg-orange-50 text-gray-600'}`}>
              Exploded
            </button>
          </Tip>
        )}

        {/* Compare */}
        <Tip tip={compareMode ? 'Vergelijking sluiten — terug naar enkel model' : 'Vergelijk — laad een tweede CAD-bestand als overlay om versieverschillen te zien'} pos="top">
          <button onClick={() => {
            if (compareMode) { setCompareMode(false); setShowCompareSelector(false) }
            else { setShowCompareSelector(v => !v) }
          }}
            className={`px-1.5 py-0.5 text-[10px] rounded ml-1 ${compareMode ? 'bg-purple-500 text-white' : 'bg-gray-100 hover:bg-purple-50 text-gray-600'}`}>
            {compareMode ? `Vergelijking ✕` : 'Vergelijk'}
          </button>
        </Tip>

        {/* Opacity */}
        <Tip tip="Opaciteit — maak het model transparanter om interne vormen te zien" pos="top">
          <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
            <span className="text-[10px] text-gray-400">Opaciteit</span>
            <input type="range" min={0.1} max={1} step={0.05} value={opacity}
              onChange={e => setOpacity(+e.target.value)}
              className="w-16 accent-teal-600" />
          </div>
        </Tip>

        {/* Stats */}
        {stats && (
          <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-500">
            <span>Vol: <b className="text-gray-700">{stats.volumeCm3.toFixed(1)} cm³</b> ~{stats.weightKg.toFixed(2)} kg</span>
            <span>Opp: <b className="text-gray-700">{stats.surfaceCm2.toFixed(1)} cm²</b></span>
            <span className="text-gray-400">{stats.sizeX}×{stats.sizeY}×{stats.sizeZ} mm</span>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gray-50/90">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">CAD bestand laden…</p>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gray-50/90 gap-2">
          <p className="text-sm text-red-500 font-medium">Laden mislukt</p>
          <p className="text-xs text-gray-400 max-w-xs text-center">{loadError}</p>
        </div>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function buildMaterial(mode: ViewMode, opacity: number): THREE.Material {
  if (mode === 'wireframe') {
    return new THREE.MeshBasicMaterial({ color: 0x555555, wireframe: true })
  }
  return new THREE.MeshPhongMaterial({
    color: 0x88aacc,
    specular: 0x222222,
    shininess: 40,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  })
}

function Tip({ tip, pos = 'top', children }: { tip: string; pos?: 'top' | 'bottom'; children: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className={`absolute z-50 whitespace-nowrap px-2 py-1 text-[10px] font-medium bg-gray-800 text-white rounded shadow-lg pointer-events-none
          ${pos === 'top' ? 'bottom-full mb-1.5 left-1/2 -translate-x-1/2' : 'top-full mt-1.5 left-1/2 -translate-x-1/2'}`}>
          {tip}
          <div className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent
            ${pos === 'top' ? 'top-full border-t-gray-800' : 'bottom-full border-b-gray-800'}`} />
        </div>
      )}
    </div>
  )
}

function ToolBtn({ active, onClick, label, tooltip }: { active: boolean; onClick: () => void; label: string; tooltip: string }) {
  return (
    <Tip tip={tooltip} pos="top">
      <button onClick={onClick}
        className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors ${active ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-teal-50 text-gray-600'}`}>
        {label}
      </button>
    </Tip>
  )
}
