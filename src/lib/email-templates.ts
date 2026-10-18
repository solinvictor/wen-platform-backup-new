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
      browse the store, and look out for <strong>Market Day</strong> every Tuesday and Friday for
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
