import { NextRequest, NextResponse } from 'next/server';
import { loadRemoteImage } from '@/app/lib/og-remote-image';

// Explains why the icon param was accepted or rejected, without rendering.
export async function GET(request: NextRequest) {
  if (process.env.OG_ENABLE_DEBUG !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  let icon = null;
  if (searchParams.has('icon')) {
    const { url, host, dataUrl, rejection } = await loadRemoteImage(searchParams.get('icon'));
    icon = { url, host, accepted: dataUrl !== null, rejection };
  }

  return NextResponse.json(
    {
      icon,
      allParams: Object.fromEntries(searchParams.entries()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
