import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware pro zabezpečení aplikace heslem z APP_PASSWORD.
 * Vyjímá statické soubory, PWA manifest, ikony a přihlašovací endpoint.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const expectedPassword = process.env.APP_PASSWORD || 'Atom001@';
  const authToken = request.cookies.get('auth_token')?.value;

  // 1. Výjimka pro statické soubory, ikony, PWA manifest a login API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.webmanifest')
  ) {
    return NextResponse.next();
  }

  const isAuthenticated = authToken === expectedPassword;

  // 2. Stránka /login: Pokud je uživatel již přihlášen, přesměrujeme ho na /
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 3. Chráněné stránky: Pokud chybí platný auth token, přesměrovat na /login
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Vynechá všechny statické soubory Next.js, manifest a ikony
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
};
