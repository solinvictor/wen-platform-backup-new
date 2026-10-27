import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return response
  }

  const path = request.nextUrl.pathname

  // ── /checkout + /account — require login ─────────────────────────────────
  const needsAuth = path.startsWith('/checkout') || path.startsWith('/account')
  if (needsAuth && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // ── /admin/* — require admin role ─────────────────────────────────────────
  const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login'
  if (isAdminRoute && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // ── /rider/* — require rider role ─────────────────────────────────────────
  const isRiderRoute = path.startsWith('/rider') && path !== '/rider/login'
  if (isRiderRoute && !user) {
    return NextResponse.redirect(new URL('/rider/login', request.url))
  }
  if (isRiderRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'rider') {
      return NextResponse.redirect(new URL('/rider/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/rider/:path*', '/account/:path*', '/account', '/checkout'],
}
