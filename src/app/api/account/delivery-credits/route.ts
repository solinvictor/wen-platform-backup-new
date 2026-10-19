import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns the signed-in buyer's available delivery credit (signup bonus +
 * market-day cashback, summed across every buyers row tied to this account,
 * unexpired only). Used by checkout (to preview/apply the discount) and the
 * account page's wallet tab (to show the balance).
 *
 * Reads via the admin client rather than letting the browser call
 * get_available_delivery_credit() directly — that RPC is locked down to
 * service_role only, same as every other credit function in this feature.
 */
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ available: 0 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_available_delivery_credit', { p_user_id: user.id })
  if (error) {
    console.error('[delivery-credits] lookup failed:', error.message)
    return NextResponse.json({ available: 0 })
  }

  return NextResponse.json({ available: Number(data ?? 0) })
}
