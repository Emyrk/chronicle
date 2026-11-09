import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { loadRemoteImage } from '@/app/lib/og-remote-image';
import { resolveOgRouteKeys } from '@/app/lib/og-route-keys';
import { normalizeOgTheme } from '@/app/lib/og-themes';
import { verifyOgSignature } from '@/app/lib/og-signature';
import { themes } from './themes';
import { measureOgRender } from '@/app/lib/og-metrics';

const routeKeys = resolveOgRouteKeys();

function readAccent(value: string | null): string | null {
  const hex = (value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.replace(/./g, digit => digit + digit).toLowerCase()}`;
  }
  return null;
}

// The brand card draws its own defaults, so it needs no other params.
function fallbackParams(): URLSearchParams {
  return new URLSearchParams({ template: 'brand' });
}

export async function handleOgGet(request: NextRequest, routeKey: string): Promise<Response> {
  if (!routeKeys.has(routeKey)) {
    return new Response('Not Found', { status: 404 });
  }

  // With OG_SIGNING_KEY set, an unsigned or forged URL draws the fallback card
  // and none of its params: no caller text, no remote image fetches.
  const requestParams = new URL(request.url).searchParams;
  const signatureValid = verifyOgSignature(requestParams);
  const searchParams = signatureValid ? requestParams : fallbackParams();
  const themeContext = { searchParams };

  // `template` is an alias for `theme`; `theme` wins when both are given.
  const themeName = normalizeOgTheme(searchParams.get('theme') ?? searchParams.get('template'));
  const theme = themes[themeName];

  return measureOgRender(themeName, async () => {
    // Cards load their own fonts, CJK name fallbacks included (loadNameFonts).
    // `icon` (the guild logo) is the only remote image a card draws.
    const [fonts, icon] = await Promise.all([theme.loadFonts(themeContext), loadRemoteImage(searchParams.get('icon'))]);

    const props = {
      accent: readAccent(searchParams.get('accent')),
      iconSrc: icon.dataUrl,
    };

    console.info(
      'og.request',
      JSON.stringify({
        routeKey,
        userAgent: request.headers.get('user-agent') || '',
        theme: themeName,
        signatureValid,
        iconHost: icon.host,
        iconRejection: searchParams.has('icon') ? icon.rejection : null,
        urlLength: request.url.length,
      })
    );

    return new ImageResponse(await theme.render(props, themeContext), {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        // Replaces next/og's default, which tells caches to revalidate every time.
        'cache-control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  }, request.signal);
}
