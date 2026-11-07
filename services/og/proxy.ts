import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(_request: NextRequest) {
  const apiOnlyEnabled = process.env.OG_API_ONLY === 'true';
  if (!apiOnlyEnabled) return NextResponse.next();

  return new NextResponse('Not Found', { status: 404 });
}

export const config = {
  matcher: '/((?!api(?:/|$)|_next(?:/|$)).*)',
};
