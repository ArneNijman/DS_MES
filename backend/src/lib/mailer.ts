import nodemailer from 'nodemailer'
import type { FastifyInstance } from 'fastify'
import { smtpSettings } from '../db/schema.js'
import { eq } from 'drizzle-orm'

interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
}

let cachedConfig: SmtpConfig | null = null
let cacheExpiry = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function getSmtpConfig(db: FastifyInstance['db']): Promise<SmtpConfig | null> {
  if (cachedConfig && Date.now() < cacheExpiry) return cachedConfig

  const [row] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1)
  if (!row || !row.host) return null

  cachedConfig = {
    host:      row.host,
    port:      parseInt(row.port, 10) || 25,
    user:      row.user,
    password:  row.password,
    fromEmail: row.fromEmail,
    fromName:  row.fromName,
  }
  cacheExpiry = Date.now() + CACHE_TTL_MS
  return cachedConfig
}

export function invalidateSmtpCache() {
  cachedConfig = null
  cacheExpiry = 0
}

export interface MailAttachment {
  filename: string
  content: Buffer
}

export interface MailOptions {
  to: string | string[]
  subject: string
  html: string
  attachments?: MailAttachment[]
}

export async function sendMail(db: FastifyInstance['db'], opts: MailOptions): Promise<boolean> {
  const cfg = await getSmtpConfig(db)
  if (!cfg || !cfg.host) return false

  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: false,     // STARTTLS
    auth:   cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    tls:    { rejectUnauthorized: false },
  })

  try {
    await transporter.sendMail({
      from:        `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to:          Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject:     opts.subject,
      html:        opts.html,
      attachments: opts.attachments?.map(a => ({
        filename:    a.filename,
        content:     a.content,
        contentType: 'application/pdf' as const,
      })),
    })
    return true
  } catch (err) {
    console.error('[mailer] Verzending mislukt:', err)
    return false
  }
}

/** Haalt alle medewerkers op die email notificaties aan hebben en een email-adres bezitten. */
export async function getNotifiableEmployees(
  db: FastifyInstance['db'],
  filter?: { role?: string | string[]; ids?: string[] }
): Promise<{ id: string; name: string; email: string }[]> {
  const { employees } = await import('../db/schema.js')
  const { and, eq, inArray, isNotNull } = await import('drizzle-orm')

  const conditions = [
    isNotNull(employees.email),
    eq(employees.emailNotificaties, true),
  ]
  if (filter?.role) {
    const roles = Array.isArray(filter.role) ? filter.role : [filter.role]
    conditions.push(inArray(employees.role, roles))
  }
  if (filter?.ids) {
    conditions.push(inArray(employees.id, filter.ids))
  }

  const rows = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(and(...conditions as Parameters<typeof and>))

  return rows.filter(r => r.email) as { id: string; name: string; email: string }[]
}

/** HTML-basis voor alle emails */
export function mailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .header { background: #0d9488; color: #fff; padding: 20px 28px; }
  .header h1 { margin: 0; font-size: 18px; }
  .body { padding: 24px 28px; color: #374151; font-size: 14px; line-height: 1.6; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 14px; color: #0d9488; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; }
  .item { padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
  .item:last-child { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-left: 6px; }
  .badge-orange { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-teal { background: #ccfbf1; color: #134e4a; }
  .footer { background: #f9fafb; padding: 14px 28px; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head>
<body>
  <div class="wrap">
    <div class="header"><h1>Dutch Shape MES — ${title}</h1></div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">Dutch Shape MES &bull; Automatisch gegenereerde email &bull; Niet beantwoorden</div>
  </div>
</body></html>`
}
