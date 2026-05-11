import { XMLParser } from 'fast-xml-parser'

export interface InspectionFeature {
  id: string
  name: string
  type: string
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
      nominalX: nominal, nominalY: 0, nominalZ: 0,
      measuredX: measured, measuredY: 0, measuredZ: 0,
      deviation,
      tolerancePlus: tolPlus,
      toleranceMinus: tolMinus,
      status: statusFromOutOfTol(d['@_OutOfTolerance'] ?? 0),
    }
  })
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
