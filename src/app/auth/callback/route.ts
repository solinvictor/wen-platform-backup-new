import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { welcomeEmail } from '@/lib/email-templates'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/store'

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Fires on both signup confirmation and password-reset links (both
      // hit this same callback) — welcome_email_sent_at makes it a true
      // one-time send regardless of which flow triggered it.
      if (user) await sendWelcomeEmailOnce(user.id, user.email ?? '', user.user_metadata?.full_name ?? '')
      return response
    }
  }

  // Code missing or exchange failed — send to login with error param
  return NextResponse.redirect(`${origin}/login?error=auth`)
}

async function sendWelcomeEmailOnce(userId: string, email: string, fullName: string) {
  if (!email) return
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('welcome_email_sent_at')
      .eq('id', userId)
      .single()

    if (!profile || profile.welcome_email_sent_at) return // already sent, or no profile row yet

    const { data: buyer } = await admin
      .from('buyers')
      .select('referral_code')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { subject, html } = welcomeEmail({ name: fullName, referralCode: buyer?.referral_code ?? null })
    const { sent } = await sendEmail({ to: email, subject, html })

    if (sent) {
      await admin.from('profiles').update({ welcome_email_sent_at: new Date().toISOString() }).eq('id', userId)
    }
  } catch (err) {
    // Never block the auth redirect over an email failure.
    console.error('[auth/callback] welcome email failed:', err)
  }
}
