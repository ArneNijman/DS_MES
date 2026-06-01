import cron from 'node-cron'
import type { FastifyInstance } from 'fastify'
import { sendMail, getNotifiableEmployees, mailLayout, type MailAttachment } from '../lib/mailer.js'
import { genereerRapportPdf } from '../lib/pdf-generator.js'
import {
  smtpSettings, employees, tasks, ncrRegistrations, preventiveActions,
  maintenanceTasks, breakdowns, measuringTools, calibrationRecords,
  customerComplaints,
} from '../db/schema.js'
import { eq, and, ne, sql } from 'drizzle-orm'

let cronJob: cron.ScheduledTask | null = null

function nextKalibratieDate(lastDatum: string | null, interval: string | null): Date | null {
  if (!lastDatum || !interval || interval === 'geen') return null
  const base = new Date(lastDatum)
  if (isNaN(base.getTime())) return null
  const days = interval === 'jaarlijks' ? 365 : interval === 'halfjaarlijks' ? 182 : interval === 'kwartaal' ? 91 : null
  if (!days) return null
  return new Date(base.getTime() + days * 86_400_000)
}

export function startEmailReminders(fastify: FastifyInstance) {
  cronJob = cron.schedule('30 7 * * 1-5', async () => {
    try { await verzendReminders(fastify) }
    catch (err) { fastify.log.error({ err }, '[emailReminders] Cron fout') }
  })
  fastify.log.info('[emailReminders] Dagelijkse reminder cron gestart (07:30 werkdagen)')
}

export function stopEmailReminders() { cronJob?.stop() }

async function verzendReminders(fastify: FastifyInstance) {
  const [smtp] = await fastify.db.select({
    reminderInterval:   smtpSettings.reminderInterval,
    intervalTaken:      smtpSettings.intervalTaken,
    intervalNcr:        smtpSettings.intervalNcr,
    intervalOnderhoud:  smtpSettings.intervalOnderhoud,
    intervalKalibratie: smtpSettings.intervalKalibratie,
    intervalKwaliteit:  smtpSettings.intervalKwaliteit,
  }).from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
  if (!smtp) return

  const now   = new Date()
  const dag   = now.getDay()
  const datum = now.getDate()

  /** Geeft true als het interval van vandaag verstuurd moet worden. */
  function moetVerzenden(interval: string): boolean {
    if (interval === 'wekelijks'   && dag   !== 1) return false
    if (interval === 'maandelijks' && datum !== 1) return false
    return true
  }

  const datumLabel = now.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const alleEmployees = await getNotifiableEmployees(fastify.db)

  for (const emp of alleEmployees) {
    const bijlagen: MailAttachment[] = []
    const samenvatting: string[] = []

    // ── Open taken ────────────────────────────────────────────────────────
    const openTaken = moetVerzenden(smtp.intervalTaken) ? await fastify.db
      .select({ id: tasks.id, title: tasks.title, priority: tasks.priority, dueDate: tasks.dueDate, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.assignedToId, emp.id), ne(tasks.status, 'gearchiveerd'))) : []
    if (openTaken.length > 0) {
      samenvatting.push(`${openTaken.length} open ${openTaken.length === 1 ? 'taak' : 'taken'}`)
      const pdf = await genereerRapportPdf('Taken overzicht', datumLabel, [{
        titel: `Open taken — ${emp.name}`,
        regels: openTaken.map(t => ({
          kolom1: t.title,
          kolom2: t.priority,
          kolom3: t.dueDate ?? '',
        })),
      }])
      bijlagen.push({ filename: `taken-${datumLabel.replace(/\//g, '-')}.pdf`, content: pdf })
    }

    // ── Open NCRs (persoonlijk) ────────────────────────────────────────
    const openNcrs = moetVerzenden(smtp.intervalNcr) ? await fastify.db
      .select({ ncrId: ncrRegistrations.ncrId, shortDescription: ncrRegistrations.shortDescription, status: ncrRegistrations.status })
      .from(ncrRegistrations)
      .where(and(eq(ncrRegistrations.assignedToId, emp.id), sql`${ncrRegistrations.status} NOT IN ('gesloten','vervallen')`)) : []
    if (openNcrs.length > 0) {
      samenvatting.push(`${openNcrs.length} open NCR${openNcrs.length > 1 ? 's' : ''}`)
      const pdf = await genereerRapportPdf('NCR overzicht', datumLabel, [{
        titel: `Open NCRs — ${emp.name}`,
        regels: openNcrs.map(n => ({ kolom1: n.ncrId, kolom2: n.shortDescription ?? '', kolom3: n.status })),
      }])
      bijlagen.push({ filename: `ncrs-${datumLabel.replace(/\//g, '-')}.pdf`, content: pdf })
    }

    // ── Open onderhoudstaken ──────────────────────────────────────────
    const openOnderhoud = moetVerzenden(smtp.intervalOnderhoud) ? await fastify.db
      .select({ id: maintenanceTasks.id, title: maintenanceTasks.title, status: maintenanceTasks.status })
      .from(maintenanceTasks)
      .where(and(eq(maintenanceTasks.assignedToId, emp.id), sql`${maintenanceTasks.status} NOT IN ('voltooid','geannuleerd')`)) : []
    if (openOnderhoud.length > 0) {
      samenvatting.push(`${openOnderhoud.length} onderhoudstaak${openOnderhoud.length > 1 ? 'en' : ''}`)
      const pdf = await genereerRapportPdf('Onderhoud overzicht', datumLabel, [{
        titel: `Open onderhoudstaken — ${emp.name}`,
        regels: openOnderhoud.map(o => ({ kolom1: o.title, kolom2: o.status })),
      }])
      bijlagen.push({ filename: `onderhoud-${datumLabel.replace(/\//g, '-')}.pdf`, content: pdf })
    }

    // ── Kalibratie vervalt binnenkort ─────────────────────────────────
    const vervallend: { toolId: string; naam: string; vervalt: string }[] = []
    if (moetVerzenden(smtp.intervalKalibratie)) {
      const mijnTools = await fastify.db
        .select({ id: measuringTools.id, toolId: measuringTools.toolId, artikelnaam: measuringTools.artikelnaam, interval: measuringTools.interval })
        .from(measuringTools)
        .where(and(eq(measuringTools.teamleiderId, emp.id), eq(measuringTools.kalibratiePlicht, true)))
      const over30 = new Date(now.getTime() + 30 * 86_400_000)
      for (const tool of mijnTools) {
        const [last] = await fastify.db.select({ datum: calibrationRecords.datum })
          .from(calibrationRecords).where(eq(calibrationRecords.toolId, tool.id))
          .orderBy(sql`${calibrationRecords.datum} DESC`).limit(1)
        const volgende = nextKalibratieDate(last?.datum ?? null, tool.interval)
        if (volgende && volgende <= over30)
          vervallend.push({ toolId: tool.toolId, naam: tool.artikelnaam ?? '', vervalt: volgende.toLocaleDateString('nl-NL') })
      }
    }
    if (vervallend.length > 0) {
      samenvatting.push(`${vervallend.length} kalibratie${vervallend.length > 1 ? 's' : ''} vervalt binnenkort`)
      const pdf = await genereerRapportPdf('Kalibratie rapport', datumLabel, [{
        titel: 'Kalibratie binnenkort vervallen',
        regels: vervallend.map(v => ({ kolom1: v.toolId, kolom2: v.naam, kolom3: `Vervalt: ${v.vervalt}` })),
      }])
      bijlagen.push({ filename: `kalibratie-${datumLabel.replace(/\//g, '-')}.pdf`, content: pdf })
    }

    // ── Extra voor quality/admin ──────────────────────────────────────
    const [empData] = await fastify.db.select({ role: employees.role }).from(employees).where(eq(employees.id, emp.id)).limit(1)
    if ((empData?.role === 'quality' || empData?.role === 'admin') && moetVerzenden(smtp.intervalKwaliteit)) {
      const alleNcrs = await fastify.db
        .select({ ncrId: ncrRegistrations.ncrId, shortDescription: ncrRegistrations.shortDescription, status: ncrRegistrations.status })
        .from(ncrRegistrations)
        .where(sql`${ncrRegistrations.status} NOT IN ('gesloten','vervallen')`)
      const alleKlantmeldingen = await fastify.db
        .select({ ctrId: customerComplaints.ctrId, klant: customerComplaints.klant, status: customerComplaints.status, omschrijving: customerComplaints.omschrijving })
        .from(customerComplaints)
        .where(sql`${customerComplaints.status} NOT IN ('gesloten','vervallen')`)

      if (alleNcrs.length > 0 || alleKlantmeldingen.length > 0) {
        const secties = []
        if (alleNcrs.length > 0)
          secties.push({ titel: `Alle open NCRs (${alleNcrs.length})`, regels: alleNcrs.map(n => ({ kolom1: n.ncrId, kolom2: n.shortDescription ?? '', kolom3: n.status })) })
        if (alleKlantmeldingen.length > 0)
          secties.push({ titel: `Alle open klantmeldingen (${alleKlantmeldingen.length})`, regels: alleKlantmeldingen.map(k => ({ kolom1: k.ctrId, kolom2: k.klant ?? '', kolom3: k.status })) })

        if (secties.length > 0) {
          samenvatting.push(`${alleNcrs.length + alleKlantmeldingen.length} totaal open meldingen`)
          const pdf = await genereerRapportPdf('Kwaliteit overzicht', datumLabel, secties)
          bijlagen.push({ filename: `kwaliteit-${datumLabel.replace(/\//g, '-')}.pdf`, content: pdf })
        }
      }
    }

    if (bijlagen.length === 0) continue

    await sendMail(fastify.db, {
      to:      emp.email,
      subject: `MES Dagelijks overzicht — ${datumLabel}`,
      html: mailLayout('Dagelijks overzicht', `
        <p>Hallo ${emp.name},</p>
        <p>Je overzicht van vandaag (${datumLabel}):</p>
        <ul style="margin:12px 0;padding-left:20px;">
          ${samenvatting.map(s => `<li style="margin:4px 0;">${s}</li>`).join('')}
        </ul>
        <p style="color:#6b7280;font-size:13px;">Zie de bijgevoegde PDF-rapporten voor de details.</p>
      `),
      attachments: bijlagen,
    })
  }
}
