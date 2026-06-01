import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { smtpSettings } from '../../db/schema.js'
import { sendMail, invalidateSmtpCache, mailLayout } from '../../lib/mailer.js'

export default async function smtpRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── GET instellingen ──────────────────────────────────────────────────────

  fastify.get('/admin/smtp', auth, async () => {
    const [row] = await fastify.db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
    if (!row) return {
      host: '', port: '25', user: '', password: '',
      fromEmail: 'mes@dutch-shape.nl', fromName: 'Dutch Shape MES',
      reminderInterval: 'dagelijks',
    }
    return {
      host:             row.host,
      port:             row.port,
      user:             row.user,
      password:         row.password ? '••••••••' : '',
      fromEmail:        row.fromEmail,
      fromName:         row.fromName,
      reminderInterval: row.reminderInterval,
    }
  })

  // ── PUT instellingen opslaan ──────────────────────────────────────────────

  fastify.put('/admin/smtp', auth, async (req, reply) => {
    const body = req.body as {
      host: string; port: string; user?: string; password?: string
      fromEmail: string; fromName: string; reminderInterval: string
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
        reminderInterval: body.reminderInterval,
        updatedAt:        new Date(),
      })
      .onConflictDoUpdate({
        target: smtpSettings.id,
        set: {
          host:             body.host.trim(),
          port:             body.port.trim(),
          user:             body.user?.trim() ?? '',
          password,
          fromEmail:        body.fromEmail.trim(),
          fromName:         body.fromName.trim(),
          reminderInterval: body.reminderInterval,
          updatedAt:        new Date(),
        },
      })

    invalidateSmtpCache()
    return { ok: true }
  })

  // ── POST test email ───────────────────────────────────────────────────────

  fastify.post('/admin/smtp/test', auth, async (req, reply) => {
    const { to } = req.body as { to: string }
    if (!to) return reply.status(400).send({ error: 'Geen ontvanger opgegeven' })

    const sent = await sendMail(fastify.db, {
      to,
      subject: 'Dutch Shape MES — Test email',
      html: mailLayout('Test email', `
        <p>Dit is een testmail vanuit het Dutch Shape MES systeem.</p>
        <p>Als je deze email ontvangt, zijn de SMTP-instellingen correct geconfigureerd.</p>
      `),
    })

    if (!sent) return reply.status(500).send({ error: 'Verzending mislukt — controleer de SMTP-instellingen' })
    return { ok: true }
  })
}
