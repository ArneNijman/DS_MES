import { BCClient } from '../client.js'
import { FastifyInstance } from 'fastify'
import { employees } from '../../db/schema.js'
import { pickField, FIELD_CANDIDATES } from '../utils/fieldPicker.js'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

interface SyncResult {
  added: number
  updated: number
  errors: string[]
}

export async function syncEmployees(
  client: BCClient,
  fastify: FastifyInstance,
): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, errors: [] }
  const db = fastify.db

  try {
    const companiesRes = await client.get<{ value: Record<string, unknown>[] }>('/companies')
    const companies = companiesRes.value ?? []

    for (const company of companies) {
      const companyId = company.id as string
      let items: Record<string, unknown>[] = []

      try {
        const res = await client.get<{ value: Record<string, unknown>[] }>(
          `/companies(${companyId})/employees`,
        )
        items = res.value ?? []
      } catch {
        try {
          const res = await client.get<{ value: Record<string, unknown>[] }>(
            `/companies(${companyId})/resources`,
          )
          items = res.value ?? []
        } catch (err) {
          result.errors.push(`Bedrijf ${companyId}: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
      }

      for (const item of items) {
        try {
          const bcId =
            (await pickField(item, 'id', 'employees', FIELD_CANDIDATES.id, db) as string) ??
            (await pickField(item, 'no', 'employees', FIELD_CANDIDATES.no, db) as string) ??
            randomUUID()

          const name = (await pickField(item, 'name', 'employees', FIELD_CANDIDATES.name, db) as string) ?? 'Onbekend'
          const email = (await pickField(item, 'email', 'employees', FIELD_CANDIDATES.email, db) as string | undefined)

          const existing = await db.query.employees.findFirst({
            where: (e, { eq }) => eq(e.bcId, bcId),
          })

          if (existing) {
            await db.update(employees).set({
              name,
              email: email ?? existing.email,
              bcData: item,
              syncedAt: new Date(),
            }).where(eq(employees.bcId, bcId))
            result.updated++
          } else {
            await db.insert(employees).values({
              bcId,
              name,
              email,
              bcData: item,
              syncedAt: new Date(),
            })
            result.added++
          }
        } catch (err) {
          result.errors.push(`Medewerker sync: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } catch (err) {
    result.errors.push(`Sync fout: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}
