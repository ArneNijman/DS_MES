/**
 * Stuurt een request naar de eerste beschikbare CNC-agent.
 *
 * CNC_AGENT_URL kan meerdere agents bevatten, komma-gescheiden:
 *   http://pc1:3099,http://pc2:3099
 *
 * De agents worden één voor één geprobeerd met een korte verbindingstimeout.
 * De eerste die reageert wordt gebruikt — ook als de HTTP-status een fout is
 * (die fout wordt dan doorgestuurd naar de aanroeper).
 */
export async function callAgent(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const urls = (process.env.CNC_AGENT_URL ?? 'http://host.docker.internal:3099')
    .split(',')
    .map(u => u.trim().replace(/\/$/, ''))
    .filter(Boolean)

  let lastError: Error = new Error('Geen CNC-agent geconfigureerd')

  for (const base of urls) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      return res  // eerste die reageert — foutstatussen worden door aanroeper afgehandeld
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError
}
