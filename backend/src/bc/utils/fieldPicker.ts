import { drizzle } from 'drizzle-orm/postgres-js'
import { bcFieldMap } from '../../db/schema.js'
import * as schema from '../../db/schema.js'

type DB = ReturnType<typeof drizzle<typeof schema>>

const EMPTY_DATES = new Set(['0001-01-01', '9999-12-31'])

/**
 * Probeert automatisch meerdere veldnaamvarianten in een BC-response object.
 * Slaat de gevonden variant op in bcFieldMap voor verificatie via de admin UI.
 */
export async function pickField(
  obj: Record<string, unknown>,
  logicalField: string,
  entityType: string,
  candidates: string[],
  db: DB,
): Promise<unknown> {
  for (const key of candidates) {
    if (key in obj && obj[key] !== null && obj[key] !== undefined) {
      const value = obj[key]

      // Filter lege BC-datums
      if (typeof value === 'string' && EMPTY_DATES.has(value.slice(0, 10))) {
        continue
      }

      // Sla gevonden variant op (upsert)
      const exampleStr = typeof value === 'object' ? JSON.stringify(value) : String(value)
      try {
        await db
          .insert(bcFieldMap)
          .values({
            entityType,
            logicalField,
            detectedVariant: key,
            exampleValue: exampleStr.slice(0, 200),
            lastSeenAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [bcFieldMap.entityType, bcFieldMap.logicalField],
            set: {
              detectedVariant: key,
              exampleValue: exampleStr.slice(0, 200),
              lastSeenAt: new Date(),
            },
          })
      } catch {
        // Niet-kritiek — veldmapping bijhouden mag de sync niet blokkeren
      }

      return value
    }
  }

  return undefined
}

/** Bekende kandidatenlijsten per logisch veld */
export const FIELD_CANDIDATES: Record<string, string[]> = {
  // Algemeen
  id: ['id', 'Id', 'ID'],
  no: ['no', 'No', 'No_', 'number', 'Number'],
  name: ['displayName', 'name', 'Name', 'fullName', 'description'],
  email: ['email', 'Email', 'personalEmail', 'workEmail'],
  // Datums
  startDate: ['startDate', 'start_date', 'StartDate', 'startingDate'],
  endDate: ['endDate', 'end_date', 'EndDate', 'endingDate', 'dueDate'],
  // Projecten / taken
  status: ['status', 'Status', 'jobStatus', 'lineStatus', 'state'],
  quantity: ['quantity', 'Quantity', 'qty', 'Qty', 'quantityBase'],
  type: ['type', 'Type', 'lineType', 'LineType', 'jobTaskType'],
}
