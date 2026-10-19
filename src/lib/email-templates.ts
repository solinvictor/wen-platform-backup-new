// Plain inline-styled HTML — no component library, so these render
// correctly in every mail client without a build step.

const PEPPER = '#c2410c'
const SOIL = '#2b2420'

function wrapper(bodyHtml: string) {
  return `
    <div style="background:#eef1f4;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
        <div style="background:${SOIL};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">WEN</span>
        </div>
        <div style="padding:28px;">
          ${bodyHtml}
        </div>
      </div>
      <p style="text-align:center;color:#8a8278;font-size:12px;margin-top:20px;">
        WEN Foods · Farm to market, Makurdi
      </p>
    </div>
  `
}

export function welcomeEmail({ name, referralCode }: { name: string; referralCode?: string | null }) {
  const firstName = name.trim().split(' ')[0] || 'there'
  const html = wrapper(`
    <h1 style="color:${SOIL};font-size:22px;margin:0 0 12px;">Welcome to WEN, ${firstName} 🌾</h1>
    <p style="color:#5c554c;font-size:14.5px;line-height:1.6;margin:0 0 16px;">
      Your account is confirmed. WEN brings fresh produce straight from farmers to your door —
      browse the store, and look out for <strong>Market Day</strong> every Wednesday and Saturday for
      an extra discount on your basket.
    </p>
    ${referralCode ? `
      <div style="background:#f7f2ea;border-radius:12px;padding:16px 18px;margin:0 0 16px;">
        <p style="color:#8a8278;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 6px;">Your referral code</p>
        <p style="color:${SOIL};font-size:18px;font-weight:700;letter-spacing:0.04em;margin:0;">${referralCode}</p>
        <p style="color:#8a8278;font-size:12.5px;margin:8px 0 0;">Share it — when someone orders using your code, you earn a reward in your WEN wallet.</p>
      </div>
    ` : ''}
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://wenfoods.ng'}/store"
       style="display:inline-block;background:${PEPPER};color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;padding:13px 24px;border-radius:14px;">
      Start shopping
    </a>
  `)

  return {
    subject: 'Welcome to WEN — your account is ready',
    html,
  }
}

function naira(n: number) {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function orderReceiptEmail({
  orderRef, productSummary, amountTotal, deliveryFee,
  deliveryCreditApplied, walletAmountApplied, expectedDeliveryDate,
}: {
  orderRef: string
  productSummary: string
  amountTotal: number
  deliveryFee: number | null
  deliveryCreditApplied?: number
  walletAmountApplied?: number
  expectedDeliveryDate?: string | null
}) {
  const rows: Array<[string, string]> = []
  if (deliveryFee != null) rows.push(['Delivery fee', naira(deliveryFee)])
  if (deliveryCreditApplied) rows.push(['Delivery credit applied', `− ${naira(deliveryCreditApplied)}`])
  if (walletAmountApplied) rows.push(['Wallet applied', `− ${naira(walletAmountApplied)}`])

  const html = wrapper(`
    <h1 style="color:${SOIL};font-size:22px;margin:0 0 4px;">Payment received ✅</h1>
    <p style="color:#8a8278;font-size:13px;margin:0 0 20px;">Order <strong style="color:${SOIL};">${orderRef}</strong></p>

    <div style="background:#f7f2ea;border-radius:12px;padding:18px 20px;margin:0 0 18px;">
      <p style="color:#8a8278;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 8px;">Items</p>
      <p style="color:${SOIL};font-size:14px;line-height:1.5;margin:0;">${productSummary}</p>
    </div>

    ${rows.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin:0 0 10px;">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="color:#8a8278;font-size:13px;padding:4px 0;">${label}</td>
            <td style="color:${SOIL};font-size:13px;padding:4px 0;text-align:right;">${value}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}

    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5ded2;margin:8px 0 18px;">
      <tr>
        <td style="color:${SOIL};font-size:16px;font-weight:700;padding:10px 0 0;">Amount paid</td>
        <td style="color:${SOIL};font-size:16px;font-weight:700;padding:10px 0 0;text-align:right;">${naira(amountTotal)}</td>
      </tr>
    </table>

    <p style="color:#5c554c;font-size:13.5px;line-height:1.6;margin:0 0 4px;">
      We'll call within 2 hours to arrange delivery${expectedDeliveryDate ? ` — expected around <strong>${new Date(expectedDeliveryDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>` : ''}.
    </p>
  `)

  return {
    subject: `Receipt — order ${orderRef}`,
    html,
  }
}
