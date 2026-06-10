import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { smtpSettings } from '../../db/schema.js'
import { sendMail, invalidateSmtpCache, mailLayout } from '../../lib/mailer.js'
import nodemailer from 'nodemailer'

function smtpFoutmelding(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string }
  const code    = e.code ?? ''
  const resCode = e.responseCode ?? 0
  const msg     = (e.message ?? '').toLowerCase()

  if (code === 'ETIMEDOUT' || code === 'ESOCKET')
    return `Verbinding time-out — poort ${resCode || ''} wordt waarschijnlijk geblokkeerd door een firewall. Controleer of poort open staat op de mailserver.`
  if (code === 'ECONNREFUSED')
    return `Verbinding geweigerd (ECONNREFUSED) — de mailserver is niet bereikbaar op dit adres en deze poort. Controleer het serveradres en de poort.`
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return `Hostnaam niet gevonden — '${e.message?.match(/getaddrinfo.*? ([\S]+)/)?.[1] ?? 'onbekend'}' bestaat niet of is niet bereikbaar. Controleer het serveradres.`
  if (code === 'EAUTH' || resCode === 535 || msg.includes('authentication'))
    return `Authenticatie mislukt — gebruikersnaam of wachtwoord is onjuist.`
  if (resCode === 530 || msg.includes('starttls'))
    return `De server vereist STARTTLS maar de verbinding kon niet worden beveiligd.`
  if (msg.includes('self signed') || msg.includes('certificate'))
    return `TLS-certificaatfout — het certificaat van de mailserver is niet vertrouwd.`

  return `Verzending mislukt: ${e.message ?? 'onbekende fout'}`
}

export default async function smtpRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── GET instellingen ──────────────────────────────────────────────────────

  fastify.get('/admin/smtp', auth, async () => {
    const [row] = await fastify.db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
    if (!row) return {
      host: '', port: '25', user: '', password: '',
      fromEmail: 'mes@dutch-shape.nl', fromName: 'Dutch Shape MES',
      reminderInterval: 'dagelijks',
      intervalTaken: 'dagelijks', intervalNcr: 'dagelijks',
      intervalOnderhoud: 'wekelijks', intervalKalibratie: 'wekelijks', intervalKwaliteit: 'dagelijks',
    }
    return {
      host:               row.host,
      port:               row.port,
      user:               row.user,
      password:           row.password ? '••••••••' : '',
      fromEmail:          row.fromEmail,
      fromName:           row.fromName,
      reminderInterval:   row.reminderInterval,
      intervalTaken:      row.intervalTaken,
      intervalNcr:        row.intervalNcr,
      intervalOnderhoud:  row.intervalOnderhoud,
      intervalKalibratie: row.intervalKalibratie,
      intervalKwaliteit:  row.intervalKwaliteit,
    }
  })

  // ── PUT instellingen opslaan ──────────────────────────────────────────────

  fastify.put('/admin/smtp', auth, async (req, reply) => {
    const body = req.body as {
      host: string; port: string; user?: string; password?: string
      fromEmail: string; fromName: string; reminderInterval: string
      intervalTaken: string; intervalNcr: string
      intervalOnderhoud: string; intervalKalibratie: string; intervalKwaliteit: string
    }

    const [existing] = await fastify.db.select({ password: smtpSettings.password })
      .from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)

    // Behoud bestaand wachtwoord als het gemaskeerd terugkomt
    const password = (body.password && body.password !== '••••••••')
      ? body.password
      : (existing?.password ?? '')

    await fastify.db
      .insert(smtpSettings)
      .values({
        id: 1,
        host:             body.host.trim(),
        port:             body.port.trim(),
        user:             body.user?.trim() ?? '',
        password,
        fromEmail:        body.fromEmail.trim(),
        fromName:         body.fromName.trim(),
        reminderInterval:   body.reminderInterval,
        intervalTaken:      body.intervalTaken ?? 'dagelijks',
        intervalNcr:        body.intervalNcr ?? 'dagelijks',
        intervalOnderhoud:  body.intervalOnderhoud ?? 'wekelijks',
        intervalKalibratie: body.intervalKalibratie ?? 'wekelijks',
        intervalKwaliteit:  body.intervalKwaliteit ?? 'dagelijks',
        updatedAt:          new Date(),
      })
      .onConflictDoUpdate({
        target: smtpSettings.id,
        set: {
          host:               body.host.trim(),
          port:               body.port.trim(),
          user:               body.user?.trim() ?? '',
          password,
          fromEmail:          body.fromEmail.trim(),
          fromName:           body.fromName.trim(),
          reminderInterval:   body.reminderInterval,
          intervalTaken:      body.intervalTaken ?? 'dagelijks',
          intervalNcr:        body.intervalNcr ?? 'dagelijks',
          intervalOnderhoud:  body.intervalOnderhoud ?? 'wekelijks',
          intervalKalibratie: body.intervalKalibratie ?? 'wekelijks',
          intervalKwaliteit:  body.intervalKwaliteit ?? 'dagelijks',
          updatedAt:          new Date(),
        },
      })

    invalidateSmtpCache()
    return { ok: true }
  })

  // ── POST test email ───────────────────────────────────────────────────────

  fastify.post('/admin/smtp/test', auth, async (req, reply) => {
    const { to } = req.body as { to: string }
    if (!to) return reply.status(400).send({ error: 'Geen ontvanger opgegeven' })

    const [row] = await fastify.db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
    if (!row?.host) return reply.status(400).send({ error: 'SMTP is nog niet geconfigureerd.' })

    const transporter = nodemailer.createTransport({
      host:   row.host,
      port:   parseInt(row.port, 10) || 25,
      secure: false,
      auth:   row.user ? { user: row.user, pass: row.password } : undefined,
      tls:    { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout:   8000,
    })

    // Stap 1: verbinding + authenticatie testen
    try {
      await transporter.verify()
    } catch (err) {
      return reply.status(500).send({ error: smtpFoutmelding(err) })
    }

    // Stap 2: daadwerkelijk versturen
    try {
      await transporter.sendMail({
        from:    `"${row.fromName}" <${row.fromEmail}>`,
        to,
        subject: 'Dutch Shape MES — Test email',
        html:    mailLayout('Test email', `
          <p>Dit is een testmail vanuit het Dutch Shape MES systeem.</p>
          <p>Als je deze email ontvangt, zijn de SMTP-instellingen correct geconfigureerd.</p>
        `),
      })
    } catch (err) {
      return reply.status(500).send({ error: smtpFoutmelding(err) })
    }

    return { ok: true }
  })
}
