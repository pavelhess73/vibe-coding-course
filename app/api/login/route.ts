import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    const expectedPassword = process.env.APP_PASSWORD || 'Atom001@';

    if (!password || password !== expectedPassword) {
      return NextResponse.json(
        { success: false, error: 'Nesprávné přihlašovací heslo. Zkuste to znovu.' },
        { status: 401 }
      );
    }

    // Úspěšné přihlášení -> Nastavení cookie auth_token na 30 dní
    const response = NextResponse.json({ success: true });
    
    response.cookies.set('auth_token', expectedPassword, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 dní
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Chyba při zpracování: ${message}` },
      { status: 500 }
    );
  }
}
