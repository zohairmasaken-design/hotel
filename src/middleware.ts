import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Use getSession() instead of getUser() for performance in middleware
  // to avoid network requests on every single route match.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user;

  // If user is signed in and the current path is /login redirect the user to /
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // NOTE: We don't force redirect unauthenticated users to /login here anymore.
  // This prevents the "Server-side Redirect Lag" when sessions are desynced.
  // The Client-side hooks (useUserRole) and RoleGate will handle access control.

  return response
}

export const config = {
  matcher: ['/', '/login', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
