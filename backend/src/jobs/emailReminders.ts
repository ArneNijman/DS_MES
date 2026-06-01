import cron from 'node-cron'
import type { FastifyInstance } from 'fastify'
import { sendMail, getNotifiableEmployees, mailLayout } from '../lib/mailer.js'
import {
  smtpSettings, employees, tasks, ncrRegistrations, preventiveActions,
  maintenanceTasks, breakdowns, measuringTools, calibrationRecords,
  customerComplaints,
} from '../db/schema.js'
import { eq, and, ne, isNotNull, lt, or } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

let cronJob: cron.ScheduledTask | null = null

/** Berekent de volgende kalibratie-datum op basis van het laatste record + interval */
function nextKalibratieDate(lastDatum: string | null, interval: string | null): Date | null {
  if (!lastDatum || !interval || interval === 'geen') return null
  const base = new Date(lastDatum)
  if (isNaN(base.getTime())) return null
  const days = interval === 'jaarlijks' ? 365
    : interval === 'halfjaarlijks' ? 182
    : interval === 'kwartaal' ? 91
    : null
  if (!days) return null
  return new Date(base.getTime() + days * 86_400_000)
}

export function startEmailReminders(fastify: FastifyInstance) {
  // Draait elke werkdag om 07:30
  cronJob = cron.schedule('30 7 * * 1-5', async () => {
    try {
      await verzendReminders(fastify)
    } catch (err) {
      fastify.log.error({ err }, '[emailReminders] Cron fout')
    }
  })
  fastify.log.info('[emailReminders] Dagelijkse reminder cron gestart (07:30 werkdagen)')
}

export function stopEmailReminders() {
  cronJob?.stop()
}

async function verzendReminders(fastify: FastifyInstance) {
  // Controleer interval-instelling
  const [smtp] = await fastify.db.select({ reminderInterval: smtpSettings.reminderInterval })
    .from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
  if (!smtp) return

  const now = new Date()
  const dag = now.getDay()    // 0=zo, 1=ma, …, 6=za
  const datum = now.getDate() // dag van de maand

  const interval = smtp.reminderInterval
  if (interval === 'wekelijks' && dag !== 1) return       // alleen maandag
  if (interval === 'maandelijks' && datum !== 1) return   // alleen 1e van maand

  // Haal alle medewerkers op met email notificaties aan
  const alleEmployees = await getNotifiableEmployees(fastify.db)

  for (const emp of alleEmployees) {
    const secties: string[] = []

    // ── Open taken ───────────────────────────────────────────
    const openTaken = await fastify.db.select({ id: tasks.id, title: tasks.title, priority: tasks.priority, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(eq(tasks.assignedToId, emp.id), ne(tasks.status, 'gearchiveerd')))
    if (openTaken.length > 0) {
      secties.push(`
        <div class="section">
          <h2>Mijn taken (${openTaken.length})</h2>
          ${openTaken.map(t => `
            <div class="item">
              <strong>${t.title}</strong>
              <span class="badge badge-orange">${t.priority}</span>
              ${t.dueDate ? `<span style="color:#6b7280;font-size:12px;margin-left:6px">Deadline: ${t.dueDate}</span>` : ''}
            </div>`).join('')}
        </div>`)
    }

    // ── Open NCRs (persoonlijk) ────────────────────────────
    const openNcrs = await fastify.db.select({ ncrId: ncrRegistrations.ncrId, shortDescription: ncrRegistrations.shortDescription, status: ncrRegistrations.status })
      .from(ncrRegistrations)
      .where(and(
        eq(ncrRegistrations.assignedToId, emp.id),
        sql`${ncrRegistrations.status} NOT IN ('gesloten','vervallen')`,
      ))
    if (openNcrs.length > 0) {
      secties.push(`
        <div class="section">
          <h2>Mijn NCRs (${openNcrs.length})</h2>
          ${openNcrs.map(n => `<div class="item"><strong>${n.ncrId}</strong> — ${n.shortDescription ?? ''} <span class="badge badge-teal">${n.status}</span></div>`).join('')}
        </div>`)
    }

    // ── Open onderhoudstaken ──────────────────────────────
    const openOnderhoud = await fastify.db.select({ id: maintenanceTasks.id, title: maintenanceTasks.title })
      .from(maintenanceTasks)
      .where(and(eq(maintenanceTasks.assignedToId, emp.id), sql`${maintenanceTasks.status} NOT IN ('voltooid','geannuleerd')`))
    if (openOnderhoud.length > 0) {
      secties.push(`
        <div class="section">
          <h2>Onderhoudstaken (${openOnderhoud.length})</h2>
          ${openOnderhoud.map(o => `<div class="item">${o.title}</div>`).join('')}
        </div>`)
    }

    // ── Open storingen ────────────────────────────────────
    const openStoringen = await fastify.db.select({ id: breakdowns.id, title: breakdowns.title })
      .from(breakdowns)
      .where(and(eq(breakdowns.reportedById, emp.id), sql`${breakdowns.resolvedAt} IS NULL`))
    if (openStoringen.length > 0) {
      secties.push(`
        <div class="section">
          <h2>Storingen (${openStoringen.length})</h2>
          ${openStoringen.map(s => `<div class="item">${s.title}</div>`).join('')}
        </div>`)
    }

    // ── Kalibratie vervalt binnenkort (teamleider) ────────
    const mijnTools = await fastify.db
      .select({ id: measuringTools.id, toolId: measuringTools.toolId, artikelnaam: measuringTools.artikelnaam, interval: measuringTools.interval })
      .from(measuringTools)
      .where(and(eq(measuringTools.teamleiderId, emp.id), eq(measuringTools.kalibratiePlicht, true)))
    const over30dagen = new Date(now.getTime() + 30 * 86_400_000)
    const vervallendTools: string[] = []
    for (const tool of mijnTools) {
      const [last] = await fastify.db.select({ datum: calibrationRecords.datum })
        .from(calibrationRecords)
        .where(eq(calibrationRecords.toolId, tool.id))
        .orderBy(sql`${calibrationRecords.datum} DESC`)
        .limit(1)
      const volgende = nextKalibratieDate(last?.datum ?? null, tool.interval)
      if (volgende && volgende <= over30dagen) {
        vervallendTools.push(`<div class="item"><strong>${tool.toolId}</strong> ${tool.artikelnaam ?? ''} — vervalt ${volgende.toLocaleDateString('nl-NL')}</div>`)
      }
    }
    if (vervallendTools.length > 0) {
      secties.push(`
        <div class="section">
          <h2>Kalibratie binnenkort vervallen (${vervallendTools.length})</h2>
          ${vervallendTools.join('')}
        </div>`)
    }

    // ── Extra voor quality/admin: alle open NCRs + klantmeldingen ──
    const empData = await fastify.db.select({ role: employees.role }).from(employees).where(eq(employees.id, emp.id)).limit(1)
    if (empData[0]?.role === 'quality' || empData[0]?.role === 'admin') {
      const alleNcrs = await fastify.db.select({ ncrId: ncrRegistrations.ncrId, shortDescription: ncrRegistrations.shortDescription, status: ncrRegistrations.status })
        .from(ncrRegistrations)
        .where(sql`${ncrRegistrations.status} NOT IN ('gesloten','vervallen')`)
      if (alleNcrs.length > 0) {
        secties.push(`
          <div class="section">
            <h2>Alle open NCRs (${alleNcrs.length})</h2>
            ${alleNcrs.map(n => `<div class="item"><strong>${n.ncrId}</strong> — ${n.shortDescription ?? ''} <span class="badge badge-teal">${n.status}</span></div>`).join('')}
          </div>`)
      }
      const alleKlantmeldingen = await fastify.db
        .select({ ctrId: customerComplaints.ctrId, klant: customerComplaints.klant, status: customerComplaints.status })
        .from(customerComplaints)
        .where(sql`${customerComplaints.status} NOT IN ('gesloten','vervallen')`)
      if (alleKlantmeldingen.length > 0) {
        secties.push(`
          <div class="section">
            <h2>Alle open klantmeldingen (${alleKlantmeldingen.length})</h2>
            ${alleKlantmeldingen.map(k => `<div class="item"><strong>${k.ctrId}</strong> ${k.klant ? `— ${k.klant}` : ''} <span class="badge badge-teal">${k.status}</span></div>`).join('')}
          </div>`)
      }
    }

    if (secties.length === 0) continue

    await sendMail(fastify.db, {
      to: emp.email,
      subject: `MES Overzicht — ${now.toLocaleDateString('nl-NL')}`,
      html: mailLayout('Dagelijks overzicht', `
        <p>Hallo ${emp.name}, hier is je overzicht van vandaag:</p>
        ${secties.join('')}
      `),
    })
  }
}
