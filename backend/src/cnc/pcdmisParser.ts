import { XMLParser } from 'fast-xml-parser'

export interface InspectionAxis {
  axis: string           // 'X' | 'Y' | 'Z' | 'T' | etc.
  nominal: number
  measured: number
  deviation: number
  tolerancePlus: number
  toleranceMinus: number
  outOfTol: boolean
  min?: number
  max?: number
}

export interface InspectionFeature {
  id: string
  name: string
  type: string
  dimensionType: string    // e.g. 'LOCATION' | 'TRUE POSITION' | 'PROFILE SURFACE'
  nominalX: number
  nominalY: number
  nominalZ: number
  measuredX: number
  measuredY: number
  measuredZ: number
  deviation: number
  tolerancePlus: number
  toleranceMinus: number
  status: 'pass' | 'fail'
  axes?: InspectionAxis[]  // per-axis detail rows (X/Y/Z/T) for tabular display
  axisI?: number           // cylinder/feature axis vector (from TheoVector)
  axisJ?: number
  axisK?: number
}

export interface InspectionResult {
  partName: string | null
  programName: string | null
  operator: string | null
  machine: string | null
  dateTime: string | null
  serialNumber: string | null
  features: InspectionFeature[]
  summary: { total: number; pass: number; fail: number }
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: true })

function num(v: unknown): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return isNaN(n) ? 0 : n
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function statusFromOutOfTol(v: unknown): 'pass' | 'fail' {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '0' || s === 'false' || s === 'pass' || s === 'ok' ? 'pass' : 'fail'
}

// ── Format A: <RESULTS><FEATURES><FEATURE name="..." type="..."> ───────────────
function tryFormatA(root: Record<string, unknown>): InspectionFeature[] | null {
  const results = root['RESULTS'] as Record<string, unknown> | undefined
  if (!results) return null
  const featuresNode = results['FEATURES'] as Record<string, unknown> | undefined
  if (!featuresNode) return null
  const raw = featuresNode['FEATURE']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (list.length === 0) return null

  return list.map((f: Record<string, unknown>, i: number) => {
    const nom = (f['NOMINAL'] ?? f['nominal'] ?? {}) as Record<string, unknown>
    const meas = (f['MEASURED'] ?? f['measured'] ?? {}) as Record<string, unknown>
    const dev = f['DEVIATION'] ?? f['deviation'] ?? {}
    const tol = (f['TOLERANCE'] ?? f['tolerance'] ?? {}) as Record<string, unknown>
    const devVal = num((dev as Record<string, unknown>)?.['@_value'] ?? (dev as Record<string, unknown>)?.['@_dz'] ?? (dev as Record<string, unknown>)?.['@_dx'] ?? 0)
    const tolPlus = num(tol['@_plus'] ?? tol['@_value'] ?? 0)
    const tolMinus = num(tol['@_minus'] ?? tol['@_value'] ?? 0)
    const outOfTol = f['@_status'] ?? f['@_out_of_tolerance'] ?? (Math.abs(devVal) > Math.abs(tolPlus) || Math.abs(devVal) > Math.abs(tolMinus) ? 1 : 0)
    return {
      id: String(i + 1),
      name: str(f['@_name']) ?? `Feature ${i + 1}`,
      type: str(f['@_type']) ?? 'UNKNOWN',
      dimensionType: '',
      nominalX: num(nom['@_x']),
      nominalY: num(nom['@_y']),
      nominalZ: num(nom['@_z']),
      measuredX: num(meas['@_x']),
      measuredY: num(meas['@_y']),
      measuredZ: num(meas['@_z']),
      deviation: devVal,
      tolerancePlus: tolPlus,
      toleranceMinus: tolMinus,
      status: statusFromOutOfTol(outOfTol),
    }
  })
}

// ── Format B: <PCDMIS_RESULTS><MEASUREMENT_RESULTS><RES_ENTITY ...> ───────────
function tryFormatB(root: Record<string, unknown>): InspectionFeature[] | null {
  const pcdmis = root['PCDMIS_RESULTS'] as Record<string, unknown> | undefined
  if (!pcdmis) return null
  const measResults = pcdmis['MEASUREMENT_RESULTS'] as Record<string, unknown> | undefined
  if (!measResults) return null
  const raw = measResults['RES_ENTITY']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (list.length === 0) return null

  return list.map((e: Record<string, unknown>, i: number) => {
    const actual = (e['ACTUAL_MEASUREMENT'] ?? {}) as Record<string, unknown>
    const dim = (actual['DIMENSION_RESULT'] ?? actual['RESULT'] ?? {}) as Record<string, unknown>
    const nominal = num(dim['@_nominal'])
    const measured = num(dim['@_measured'])
    const deviation = num(dim['@_deviation'] ?? measured - nominal)
    const tolPlus = num(dim['@_tolerance_plus'] ?? dim['@_tolerance'] ?? 0)
    const tolMinus = num(dim['@_tolerance_minus'] ?? -(dim['@_tolerance'] ?? 0))
    const outOfTol = dim['@_out_of_tolerance'] ?? (Math.abs(deviation) > Math.abs(tolPlus) ? 1 : 0)
    const pos = (e['POSITION'] ?? {}) as Record<string, unknown>
    return {
      id: String(i + 1),
      name: str(e['@_name']) ?? `Feature ${i + 1}`,
      type: str(e['@_type']) ?? 'UNKNOWN',
      dimensionType: '',
      nominalX: num(pos['@_x'] ?? pos['@_nom_x'] ?? 0),
      nominalY: num(pos['@_y'] ?? pos['@_nom_y'] ?? 0),
      nominalZ: num(pos['@_z'] ?? pos['@_nom_z'] ?? 0),
      measuredX: num(pos['@_meas_x'] ?? pos['@_x'] ?? 0),
      measuredY: num(pos['@_meas_y'] ?? pos['@_y'] ?? 0),
      measuredZ: num(pos['@_meas_z'] ?? pos['@_z'] ?? 0),
      deviation,
      tolerancePlus: tolPlus,
      toleranceMinus: tolMinus,
      status: statusFromOutOfTol(outOfTol),
    }
  })
}

// ── Format C: generiek — zoek nodes met nominal + measured + deviation attributen
function tryFormatGeneric(root: Record<string, unknown>): InspectionFeature[] | null {
  const features: InspectionFeature[] = []
  let counter = 0

  function walk(node: unknown, parentName?: string): void {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if ('@_nominal' in obj && '@_measured' in obj) {
      counter++
      const nominal = num(obj['@_nominal'])
      const measured = num(obj['@_measured'])
      const deviation = num(obj['@_deviation'] ?? measured - nominal)
      const tolPlus = num(obj['@_tolerance_plus'] ?? obj['@_tolerance'] ?? 0)
      const tolMinus = num(obj['@_tolerance_minus'] ?? -(obj['@_tolerance'] ?? 0))
      const outOfTol = obj['@_out_of_tolerance'] ?? obj['@_status'] ?? (Math.abs(deviation) > Math.abs(tolPlus) ? 1 : 0)
      features.push({
        id: String(counter),
        name: str(obj['@_name'] ?? obj['@_label'] ?? parentName) ?? `Feature ${counter}`,
        type: str(obj['@_type'] ?? obj['@_feature_type']) ?? 'UNKNOWN',
        dimensionType: '',
        nominalX: 0, nominalY: 0, nominalZ: 0,
        measuredX: 0, measuredY: 0, measuredZ: 0,
        deviation,
        tolerancePlus: tolPlus,
        toleranceMinus: tolMinus,
        status: statusFromOutOfTol(outOfTol),
      })
      return
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue
      if (Array.isArray(val)) val.forEach(item => walk(item, key))
      else walk(val, key)
    }
  }

  walk(root)
  return features.length > 0 ? features : null
}

// ── Format D: PC-DMIS DataPage+ <ExecutionTransaction><DimensionCmd ...> ──────
function tryFormatD(root: Record<string, unknown>): InspectionFeature[] | null {
  const tx = root['ExecutionTransaction'] as Record<string, unknown> | undefined
  if (!tx) return null
  const raw = tx['DimensionCmd']
  if (!raw) return null
  const list = Array.isArray(raw) ? raw : [raw]
  if (list.length === 0) return null

  return list.map((d: Record<string, unknown>, i: number) => {
    const nominal  = num(d['@_Nominal'])
    const measured = num(d['@_Measured'])
    const deviation = num(d['@_Deviation'] ?? measured - nominal)
    const tolPlus  = num(d['@_PlusTol']  ?? 0)
    const tolMinus = num(d['@_MinusTol'] ?? 0)
    const featureId = str(d['@_FeatureID']) ?? `F${i + 1}`
    const featureId2 = str(d['@_FeatureID2'])
    const axis = str(d['@_Axis']) ?? ''
    const name = featureId2 ? `${featureId} ↔ ${featureId2} [${axis}]` : `${featureId} [${axis}]`
    return {
      id: String(i + 1),
      name,
      type: str(d['@_Type']) ?? 'DIM',
      dimensionType: str(d['@_Type']) ?? '',
      nominalX: nominal, nominalY: 0, nominalZ: 0,
      measuredX: measured, measuredY: 0, measuredZ: 0,
      deviation,
      tolerancePlus: tolPlus,
      toleranceMinus: tolMinus,
      status: statusFromOutOfTol(d['@_OutOfTolerance'] ?? 0),
    }
  })
}

// ── Format E: PC-DMIS MeasurementRoutine XML ──────────────────────────────────
// Root: <MeasurementRoutine><MeasurementRoutineData>
// Each measurement is in a <StartLocation> element containing <FeatureID>, <XLocation>, <YLocation>, <ZLocation>
function tryFormatE(root: Record<string, unknown>): InspectionFeature[] | null {
  const mr = root['MeasurementRoutine'] as Record<string, unknown> | undefined
  if (!mr) return null

  const features: InspectionFeature[] = []

  // Pass 1: collect TheoVector per feature id so CYL markers can be oriented correctly
  const featureVectors = new Map<string, { i: number; j: number; k: number }>()
  function collectVectors(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const id = obj['@_id']
    if (typeof id === 'string' && id && obj['TheoVector']) {
      const v = obj['TheoVector'] as Record<string, unknown>
      featureVectors.set(id, { i: num(v['@_i']), j: num(v['@_j']), k: num(v['@_k']) })
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue
      if (Array.isArray(val)) val.forEach(collectVectors)
      else collectVectors(val)
    }
  }
  collectVectors(mr)

  // Extract a numeric value from an XML node that may be:
  //   <Node value="1.23" />        → { '@_value': 1.23 }   (attribute)
  //   <Node>1.23</Node>            → 1.23                   (text content, parsed by fxp)
  //   <Node>1.23</Node> (string)   → "1.23"                 (text content, unparsed)
  function nodeVal(node: unknown): number {
    if (node == null) return 0
    if (typeof node === 'number') return isNaN(node) ? 0 : node
    if (typeof node === 'string') { const n = parseFloat(node.replace(',', '.')); return isNaN(n) ? 0 : n }
    if (typeof node === 'object') {
      const o = node as Record<string, unknown>
      // attribute: value="1.23"
      if ('@_value' in o) return num(o['@_value'])
      // text content stored as #text by some parsers
      if ('#text' in o) return num(o['#text'])
    }
    return 0
  }

  function extractAxisData(loc: unknown): { nominal: number; measured: number; tolPlus: number; tolMinus: number; min: number | undefined; max: number | undefined } {
    const o = (loc ?? {}) as Record<string, unknown>
    const minNode  = o['Min'] as unknown
    const maxNode  = o['Max'] as unknown
    const minVal = minNode != null ? nodeVal(minNode) : undefined
    const maxVal = maxNode != null ? nodeVal(maxNode) : undefined
    return {
      nominal:   nodeVal(o['Nominal']       ?? o['@_nominal']),
      measured:  nodeVal(o['Measured']      ?? o['@_measured']),
      tolPlus:   nodeVal(o['PlusTolerance'] ?? o['@_plus_tol']),
      tolMinus:  nodeVal(o['MinusTolerance'] ?? o['@_minus_tol']),
      min: minVal !== undefined ? minVal : undefined,
      max: maxVal !== undefined ? maxVal : undefined,
    }
  }

  function pushLocationFeature(obj: Record<string, unknown>, dimType: string): boolean {
    // ── LOCATION (StartLocation) ──────────────────────────────────────────────
    // FeatureID (uppercase D), XLocation / YLocation / ZLocation, optional TLocation
    const fidNode = obj['FeatureID'] as Record<string, unknown> | undefined
    if (fidNode && obj['XLocation'] && obj['YLocation'] && obj['ZLocation']) {
      const displayId = str((obj['DisplayID'] as Record<string, unknown>)?.['@_value'])
      const featureId = displayId || (str(fidNode['@_value']) ?? `F${features.length + 1}`)
      const x = extractAxisData(obj['XLocation'])
      const y = extractAxisData(obj['YLocation'])
      const z = extractAxisData(obj['ZLocation'])
      const t = obj['TLocation'] ? extractAxisData(obj['TLocation']) : null

      const devX = x.measured - x.nominal
      const devY = y.measured - y.nominal
      const devZ = z.measured - z.nominal
      const mag3d = Math.sqrt(devX * devX + devY * devY + devZ * devZ)

      const tDev = t ? (t.measured - t.nominal) : mag3d
      const tTolPlus  = t ? t.tolPlus  : Math.max(x.tolPlus,  y.tolPlus,  z.tolPlus)
      const tTolMinus = t ? t.tolMinus : Math.max(x.tolMinus, y.tolMinus, z.tolMinus)
      // PC-DMIS stores MinusTolerance as positive magnitude; actual lower bound = -tolMinus
      // e.g. tolMinus=0.15 → acceptable range: [-0.15, +tolPlus]
      const tOOT = tDev < -tTolMinus || tDev > tTolPlus
      const xOOT = devX < -x.tolMinus || devX > x.tolPlus
      const yOOT = devY < -y.tolMinus || devY > y.tolPlus
      const zOOT = devZ < -z.tolMinus || devZ > z.tolPlus
      const inTol = !tOOT && !xOOT && !yOOT && !zOOT

      features.push({
        id: featureId, name: featureId, type: 'POINT', dimensionType: dimType,
        nominalX: x.nominal, nominalY: y.nominal, nominalZ: z.nominal,
        measuredX: x.measured, measuredY: y.measured, measuredZ: z.measured,
        deviation: Math.abs(tDev),
        tolerancePlus: tTolPlus, toleranceMinus: tTolMinus,
        status: inTol ? 'pass' : 'fail',
        axes: [
          { axis: 'X', nominal: x.nominal, measured: x.measured, deviation: devX, tolerancePlus: x.tolPlus, toleranceMinus: x.tolMinus, outOfTol: xOOT, min: x.min, max: x.max },
          { axis: 'Y', nominal: y.nominal, measured: y.measured, deviation: devY, tolerancePlus: y.tolPlus, toleranceMinus: y.tolMinus, outOfTol: yOOT, min: y.min, max: y.max },
          { axis: 'Z', nominal: z.nominal, measured: z.measured, deviation: devZ, tolerancePlus: z.tolPlus, toleranceMinus: z.tolMinus, outOfTol: zOOT, min: z.min, max: z.max },
          { axis: 'T', nominal: t ? t.nominal : 0, measured: t ? t.measured : mag3d, deviation: tDev, tolerancePlus: tTolPlus, toleranceMinus: tTolMinus, outOfTol: tOOT, min: t?.min, max: t?.max },
        ],
      })
      return true
    }

    // ── TRUE POSITION (TruePositionStartLocation) ─────────────────────────────
    // FeatureId (lowercase d), TruePositionXLocation / TruePositionYLocation /
    // TruePositionDFLocation / TruePositionTrueDimensionLocation
    const fidNodeTP = obj['FeatureId'] as Record<string, unknown> | undefined
    if (fidNodeTP && obj['TruePositionXLocation'] && obj['TruePositionTrueDimensionLocation']) {
      const displayIdTP = str((obj['DisplayId'] as Record<string, unknown>)?.['@_value'])
      const featureId = displayIdTP || (str(fidNodeTP['@_value']) ?? `F${features.length + 1}`)
      const x  = extractAxisData(obj['TruePositionXLocation'])
      const y  = extractAxisData(obj['TruePositionYLocation'])
      const df = obj['TruePositionDFLocation'] ? extractAxisData(obj['TruePositionDFLocation']) : null
      const td = extractAxisData(obj['TruePositionTrueDimensionLocation'])

      // AxisFixedOfTPStartLocation = the "fixed" axis (Z position of the feature center)
      // TruePositionZLocation is an alternative name for the same concept
      const zFixedKey = obj['TruePositionZLocation'] ? 'TruePositionZLocation'
                      : obj['AxisFixedOfTPStartLocation'] ? 'AxisFixedOfTPStartLocation'
                      : null
      const z  = zFixedKey ? extractAxisData(obj[zFixedKey]) : null
      const devX  = num(((obj['TruePositionXLocation'] as Record<string, unknown>)?.['DeviationOfTPLocation'] as Record<string, unknown>)?.['@_value'])
      const devY  = num(((obj['TruePositionYLocation'] as Record<string, unknown>)?.['DeviationOfTPLocation'] as Record<string, unknown>)?.['@_value'])
      const devZ  = (z && zFixedKey) ? num(((obj[zFixedKey] as Record<string, unknown>)?.['DeviationOfTPLocation'] as Record<string, unknown>)?.['@_value']) : 0
      const tDev  = td.measured - td.nominal
      const tOOT  = tDev < -td.tolMinus || tDev > td.tolPlus
      const xOOT  = devX < -x.tolMinus || devX > x.tolPlus
      const yOOT  = devY < -y.tolMinus || devY > y.tolPlus
      const zOOT  = z ? (devZ < -z.tolMinus || devZ > z.tolPlus) : false

      const axes: InspectionAxis[] = [
        { axis: 'X',  nominal: x.nominal,  measured: x.measured,  deviation: devX, tolerancePlus: x.tolPlus,  toleranceMinus: x.tolMinus,  outOfTol: xOOT,  min: x.min,  max: x.max },
        { axis: 'Y',  nominal: y.nominal,  measured: y.measured,  deviation: devY, tolerancePlus: y.tolPlus,  toleranceMinus: y.tolMinus,  outOfTol: yOOT,  min: y.min,  max: y.max },
      ]
      if (z) axes.push({ axis: 'Z', nominal: z.nominal, measured: z.measured, deviation: devZ, tolerancePlus: z.tolPlus, toleranceMinus: z.tolMinus, outOfTol: zOOT, min: z.min, max: z.max })
      if (df) {
        const devDF = num(((obj['TruePositionDFLocation'] as Record<string, unknown>)?.['DeviationOfTPLocation'] as Record<string, unknown>)?.['@_value'])
        const dfOOT = devDF < -df.tolMinus || devDF > df.tolPlus
        axes.push({ axis: 'DF', nominal: df.nominal, measured: df.measured, deviation: devDF, tolerancePlus: df.tolPlus, toleranceMinus: df.tolMinus, outOfTol: dfOOT, min: df.min, max: df.max })
      }
      axes.push({ axis: 'T', nominal: td.nominal, measured: td.measured, deviation: tDev, tolerancePlus: td.tolPlus, toleranceMinus: td.tolMinus, outOfTol: tOOT, min: td.min, max: td.max })

      const vec = featureVectors.get(str(fidNodeTP['@_value']) ?? '')
      features.push({
        id: featureId, name: featureId, type: 'POINT', dimensionType: dimType,
        nominalX: x.nominal, nominalY: y.nominal, nominalZ: z ? z.nominal : 0,
        measuredX: x.measured, measuredY: y.measured, measuredZ: z ? z.measured : 0,
        deviation: Math.abs(tDev),
        tolerancePlus: td.tolPlus, toleranceMinus: td.tolMinus,
        status: (tOOT || xOOT || yOOT || zOOT) ? 'fail' : 'pass',
        axes,
        ...(vec ? { axisI: vec.i, axisJ: vec.j, axisK: vec.k } : {}),
      })
      return true
    }

    return false
  }

  // Known element names → readable dimension type label.
  // Unknown element names fall back to the element name itself so nothing is silently dropped.
  const DIM_TYPE: Record<string, string> = {
    StartLocation:               'LOCATION',
    TruePositionStartLocation:   'TRUE POSITION',
    Profile:                     'PROFILE SURFACE',
    DistanceStartLocation:       'DISTANCE',
    AngleStartLocation:          'ANGLE',
    DiameterStartLocation:       'DIAMETER',
    StraightnessStartLocation:   'STRAIGHTNESS',
    FlatnessStartLocation:       'FLATNESS',
    RoundnessStartLocation:      'ROUNDNESS',
    CylindricityStartLocation:   'CYLINDRICITY',
    PerpendicularityStartLocation: 'PERPENDICULARITY',
    ParallelismStartLocation:    'PARALLELISM',
    AngularityStartLocation:     'ANGULARITY',
    ConcentricityStartLocation:  'CONCENTRICITY',
    SymmetryStartLocation:       'SYMMETRY',
    RunoutStartLocation:         'RUNOUT',
  }

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue
      // Try to parse any element that structurally looks like a dimension block,
      // whether known or unknown. Use the mapped label or fall back to the element name.
      const items = Array.isArray(val) ? val : [val]
      let anyParsed = false
      for (const item of items) {
        if (item && typeof item === 'object') {
          const dimLabel = DIM_TYPE[key] ?? key
          if (pushLocationFeature(item as Record<string, unknown>, dimLabel)) {
            anyParsed = true
          } else {
            walk(item)
          }
        }
      }
      // If val was not an array and wasn't parsed, walk it (already done above via items loop)
      void anyParsed
    }
  }

  walk(mr)
  return features.length > 0 ? features : null
}

function extractHeader(root: Record<string, unknown>): Pick<InspectionResult, 'partName' | 'programName' | 'operator' | 'machine' | 'dateTime' | 'serialNumber'> {
  // zoek header op meerdere bekende paden
  const get = (o: unknown, k: string): Record<string, unknown> | undefined => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[k] as Record<string, unknown> | undefined
    return undefined
  }

  // Format D: PartData in ExecutionTransaction
  const tx = root['ExecutionTransaction'] as Record<string, unknown> | undefined
  if (tx) {
    const pd = tx['PartData'] as Record<string, unknown> | undefined
    if (pd) {
      return {
        partName:     str(pd['@_PartName']),
        programName:  str(pd['@_MeasurementRoutine']),
        operator:     null,
        machine:      null,
        dateTime:     str((root['ExecutionTransaction'] as Record<string, unknown>)?.['@_DateTime']),
        serialNumber: str(pd['@_SerialNumber']),
      }
    }
  }

  // Format E: MeasurementRoutine header
  const mr = root['MeasurementRoutine'] as Record<string, unknown> | undefined
  if (mr) {
    const mrh = mr['MeasurementRoutineHeader'] as Record<string, unknown> | undefined
    return {
      partName:     null,
      programName:  null,
      operator:     null,
      machine:      null,
      dateTime:     str((mrh?.['XMLCreationTime'] as Record<string, unknown>)?.['@_time']),
      serialNumber: null,
    }
  }

  const candidates = [
    get(get(root, 'RESULTS'), 'HEADER'),
    get(get(root, 'PCDMIS_RESULTS'), 'HEADER'),
    get(root, 'HEADER'),
    get(get(root, 'PartProgram'), 'Header'),
  ]

  for (const h of candidates) {
    if (!h) continue
    return {
      partName: str(h['PARTNAME'] ?? h['PartName'] ?? h['@_partname']),
      programName: str(h['PROGRAMNAME'] ?? h['ProgramName'] ?? h['@_program']),
      operator: str(h['OPERATOR'] ?? h['Operator'] ?? h['@_operator']),
      machine: str(h['MACHINE'] ?? h['Machine'] ?? h['@_machine']),
      dateTime: str(h['DATETIME'] ?? h['DateTime'] ?? h['@_datetime']),
      serialNumber: str(h['SERIALNUMBER'] ?? h['SerialNumber'] ?? h['@_serialnumber']),
    }
  }
  return { partName: null, programName: null, operator: null, machine: null, dateTime: null, serialNumber: null }
}

export function parsePcdmisXml(xmlContent: string): InspectionResult {
  let root: Record<string, unknown>
  try {
    root = parser.parse(xmlContent) as Record<string, unknown>
  } catch {
    return { partName: null, programName: null, operator: null, machine: null, dateTime: null, serialNumber: null, features: [], summary: { total: 0, pass: 0, fail: 0 } }
  }

  const features =
    tryFormatE(root) ??
    tryFormatD(root) ??
    tryFormatA(root) ??
    tryFormatB(root) ??
    tryFormatGeneric(root) ??
    []

  const header = extractHeader(root)
  const pass = features.filter(f => f.status === 'pass').length
  return {
    ...header,
    features,
    summary: { total: features.length, pass, fail: features.length - pass },
  }
}
