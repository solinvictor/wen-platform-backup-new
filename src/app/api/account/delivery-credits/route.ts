import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns the signed-in buyer's available delivery credit (signup bonus +
 * market-day cashback, summed across every buyers row tied to this account,
 * unexpired only) AND their general wallet balance (also summed account-
 * wide — see get_available_wallet_balance). Used by checkout (to preview/
 * apply both at checkout) and the account page's wallet tab.
 *
 * Reads via the admin client rather than letting the browser call these
 * RPCs directly — both are locked down to service_role only, same as every
 * other credit function in this feature.
 */
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ available: 0, walletBalance: 0 })
  }

  const supabase = createAdminClient()
  const [creditRes, walletRes] = await Promise.all([
    supabase.rpc('get_available_delivery_credit', { p_user_id: user.id }),
    supabase.rpc('get_available_wallet_balance', { p_user_id: user.id }),
  ])

  if (creditRes.error) {
    console.error('[delivery-credits] get_available_delivery_credit failed:', creditRes.error.message)
  }
  if (walletRes.error) {
    console.error('[delivery-credits] get_available_wallet_balance failed:', walletRes.error.message)
  }

  return NextResponse.json({
    available:     creditRes.error ? 0 : Number(creditRes.data ?? 0),
    walletBalance: walletRes.error ? 0 : Number(walletRes.data ?? 0),
  })
}
