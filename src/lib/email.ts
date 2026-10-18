import { Resend } from 'resend'

/**
 * Thin wrapper around Resend. Every call is a no-op (logged, not thrown)
 * until RESEND_API_KEY is set in the environment — same pattern as the
 * other optional integrations (Geoapify, LocationIQ) in this codebase, so
 * nothing breaks while we're waiting on the key.
 */

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'WEN Foods <no-reply@wenfoods.ng>'

let client: Resend | null = null
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

export async function sendEmail({
  to, subject, html,
}: { to: string; subject: string; html: string }): Promise<{ sent: boolean }> {
  const resend = getClient()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to, '—', subject)
    return { sent: false }
  }

  try {
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html })
    if (error) {
      console.error('[email] Resend rejected the send:', error.message)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] unexpected error sending to', to, err)
    return { sent: false }
  }
}
