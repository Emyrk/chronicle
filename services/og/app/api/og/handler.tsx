import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { loadRemoteImage, reconstructImageUrl } from '@/app/lib/og-remote-image';
import { resolveOgRouteKeys } from '@/app/lib/og-route-keys';
import { normalizeOgTheme } from '@/app/lib/og-themes';
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

// Built from a string: SWC emits the line/paragraph separators of a regex
// literal as raw characters, which webpack then fails to parse.
const UNICODE_SPACES = new RegExp('[\\u2000-\\u200F\\u2028-\\u202F]', 'g');

// Sanitize text - replace unsupported characters with safe alternatives
function sanitizeText(text: string): string {
  return text
    .replace(/[⸺⸻—–]+|-{2,}/g, ' — ')
    .replace(/[""“”]/g, '"')
    .replace(/[''‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(UNICODE_SPACES, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function readText(searchParams: URLSearchParams, name: keyof typeof MAX_LENGTH, fallback = ''): string {
  const value = sanitizeText(searchParams.get(name) ?? '') || fallback;
  // Slice by code point so a cap never splits an emoji or surrogate pair.
  return Array.from(value).slice(0, MAX_LENGTH[name]).join('');
}

function readAccent(value: string | null): string | null {
  const hex = (value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.replace(/./g, digit => digit + digit).toLowerCase()}`;
  }
  return null;
}

export async function handleOgGet(request: NextRequest, routeKey: string): Promise<Response> {
  if (!routeKeys.has(routeKey)) {
    return new Response('Not Found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
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
