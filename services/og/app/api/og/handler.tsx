import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { loadRemoteImage, reconstructImageUrl } from '@/app/lib/og-remote-image';
import { resolveOgRouteKeys } from '@/app/lib/og-route-keys';
import { DEFAULT_OG_THEME, normalizeOgTheme } from '@/app/lib/og-themes';
import { verifyOgSignature } from '@/app/lib/og-signature';
import { capText, sanitizeText } from '@/app/lib/og-text';
import { themes } from './themes';
import { loadCjkFonts } from './themes/cjk-fonts';

const routeKeys = resolveOgRouteKeys();

// Themes clamp text visually; these caps only bound the work one request can ask for.
const MAX_LENGTH = {
  title: 200,
  site: 80,
  excerpt: 300,
  author: 80,
  date: 40,
  tag: 40,
  reading: 40,
} as const;

function readText(searchParams: URLSearchParams, name: keyof typeof MAX_LENGTH, fallback = ''): string {
  return capText(sanitizeText(searchParams.get(name) ?? '') || fallback, MAX_LENGTH[name]);
}

function readAccent(value: string | null): string | null {
  const hex = (value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.replace(/./g, digit => digit + digit).toLowerCase()}`;
  }
  return null;
}

// Until the `brand` card exists, the fallback is the default template.
function fallbackParams(): URLSearchParams {
  return new URLSearchParams({ template: DEFAULT_OG_THEME, title: 'Chronicle', site: 'Chronicle' });
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

  const text = {
    title: readText(searchParams, 'title', 'Untitled'),
    site: readText(searchParams, 'site', 'Blog'),
    excerpt: readText(searchParams, 'excerpt'),
    author: readText(searchParams, 'author'),
    date: readText(searchParams, 'date'),
    tag: readText(searchParams, 'tag'),
    readingTime: readText(searchParams, 'reading'),
  };

  const [fonts, cjkFonts, background, icon, avatar] = await Promise.all([
    theme.loadFonts(themeContext),
    theme.coversCjk?.(themeContext) ? [] : loadCjkFonts(Object.values(text).join('')),
    loadRemoteImage(searchParams.has('image') ? reconstructImageUrl(searchParams) : null),
    loadRemoteImage(searchParams.get('icon')),
    loadRemoteImage(searchParams.get('avatar')),
  ]);

  const props = {
    ...text,
    accent: readAccent(searchParams.get('accent')),
    imageSrc: background.dataUrl,
    iconSrc: icon.dataUrl,
    avatarSrc: avatar.dataUrl,
  };

  console.info(
    'og.request',
    JSON.stringify({
      routeKey,
      userAgent: request.headers.get('user-agent') || '',
      theme: themeName,
      signatureValid,
      title: props.title.slice(0, 80),
      site: props.site.slice(0, 80),
      imageHost: background.host,
      imageRejection: searchParams.has('image') ? background.rejection : null,
      iconRejection: searchParams.has('icon') ? icon.rejection : null,
      avatarRejection: searchParams.has('avatar') ? avatar.rejection : null,
      urlLength: request.url.length,
    })
  );

  return new ImageResponse(await theme.render(props, themeContext), {
    width: 1200,
    height: 630,
    fonts: [...fonts, ...cjkFonts],
    headers: {
      // Replaces next/og's default, which tells caches to revalidate every time.
      'cache-control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
