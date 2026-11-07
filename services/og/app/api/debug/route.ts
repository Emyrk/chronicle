import { NextRequest, NextResponse } from 'next/server';
import { loadRemoteImage, reconstructImageUrl } from '@/app/lib/og-remote-image';

// Explains why an image param was accepted or rejected, without rendering.
export async function GET(request: NextRequest) {
  if (process.env.OG_ENABLE_DEBUG !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const describe = async (name: 'image' | 'icon' | 'avatar') => {
    if (!searchParams.has(name)) return null;
    const value = name === 'image' ? reconstructImageUrl(searchParams) : searchParams.get(name);
    const { url, host, dataUrl, rejection } = await loadRemoteImage(value);
    return { url, host, accepted: dataUrl !== null, rejection };
  };

  const [image, icon, avatar] = await Promise.all([describe('image'), describe('icon'), describe('avatar')]);

  return NextResponse.json(
    {
      image,
      icon,
      avatar,
      allParams: Object.fromEntries(searchParams.entries()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
