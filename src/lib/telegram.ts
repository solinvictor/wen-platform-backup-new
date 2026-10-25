/**
 * Thin wrapper around the Telegram Bot API, used for internal ops alerts
 * (new paid orders) — never anything buyer-facing. Same safe-no-op pattern
 * as lib/email.ts: silently skips (logged, not thrown) until the env vars
 * are set, so nothing breaks while waiting on setup.
 *
 * Setup (one-time):
 *  1. In Telegram, message @BotFather -> /newbot -> follow the prompts.
 *     BotFather gives you a token like 123456789:AAho9m...
 *  2. Message your new bot anything (it won't reply yet — that's fine).
 *  3. Open https://api.telegram.org/bot<TOKEN>/getUpdates in a browser —
 *     find "chat":{"id": ...} in the JSON. That number is your chat id.
 *  4. Repeat steps 2-3 for everyone who should get alerts (e.g. Dr. Pick).
 *  5. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS (comma-separated chat
 *     ids) in the environment.
 */

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
  return { token, chatIds }
}

export async function sendTelegramAlert(text: string): Promise<{ sent: boolean }> {
  const { token, chatIds } = getConfig()
  if (!token || chatIds.length === 0) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_IDS not set — skipping alert')
    return { sent: false }
  }

  let anySent = false
  await Promise.all(chatIds.map(async chatId => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[telegram] send failed for chat', chatId, res.status, body)
        return
      }
      anySent = true
    } catch (err) {
      console.error('[telegram] unexpected error sending to chat', chatId, err)
    }
  }))

  return { sent: anySent }
}

export function newOrderAlertText(order: {
  orderRef: string
  productSummary: string
  amountTotal: number
  deliveryFee?: number | null
  isMarketDay?: boolean
  expectedDeliveryDate?: string | null
  buyerName?: string | null
  buyerPhone?: string | null
  location?: string | null
}): string {
  const fmt = (n: number) => '₦' + n.toLocaleString('en-NG')
  const lines = [
    `🛒 <b>New paid order — ${esc(order.orderRef)}</b>`,
    '',
    esc(order.productSummary),
    '',
    `Total: <b>${fmt(order.amountTotal)}</b>`,
  ]
  if (order.deliveryFee != null) lines.push(`Delivery fee: ${fmt(order.deliveryFee)}`)
  if (order.isMarketDay) lines.push(`📅 Market Day order${order.expectedDeliveryDate ? ` — delivery ${order.expectedDeliveryDate}` : ''}`)
  if (order.buyerName) lines.push(`Buyer: ${esc(order.buyerName)}`)
  if (order.buyerPhone) lines.push(`Phone: ${esc(order.buyerPhone)}`)
  if (order.location) lines.push(`Address: ${esc(order.location)}`)
  return lines.join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
