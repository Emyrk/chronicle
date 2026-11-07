import { readPublicFile } from './public-files';
import type { ThemeFont, ThemeProps } from './types';

type FontVariant = { weight: ThemeFont['weight']; style?: ThemeFont['style'] };

// Latin TTF cuts from Fontsource, bundled in public/fonts/<id> (see the README
// there) so a render never waits on a font CDN. Satori needs TTF/OTF, not woff2.
export function loadFontsourceFamily(id: string, name: string, variants: FontVariant[]): Promise<ThemeFont[]> {
  return Promise.all(
    variants.map(async ({ weight, style = 'normal' }) => ({
      name,
      data: await readPublicFile(`fonts/${id}/latin-${weight}-${style}.ttf`),
      weight,
      style,
    }))
  );
}

// CJK and other full-width glyphs take roughly two Latin columns, so a
// 20-character Chinese title needs the same room as a 40-character English one.
export function visualLength(text: string): number {
  let length = 0;
  for (const char of text) {
    length += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(char)
      ? 1.8
      : 1;
  }
  return length;
}

// Picks the first size whose length budget fits, else the last (smallest) size.
export function fitFontSize(text: string, steps: Array<[maxLength: number, size: number]>): number {
  const length = visualLength(text);
  for (const [maxLength, size] of steps) {
    if (length <= maxLength) return size;
  }
  return steps[steps.length - 1][1];
}

// Perceived brightness of a `#rrggbb` colour, 0 (black) to 255 (white).
export function brightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114;
}

// FNV-1a, then mulberry32: tiny, stable across runtimes, good enough for
// picking shapes. The same text always gives the same sequence.
export function seededRandom(text: string): () => number {
  let seed = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 0x01000193);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function metaItems({ author, date, readingTime }: ThemeProps): string[] {
  return [author, date, readingTime].filter(Boolean);
}

// Satori needs explicit width/height on <img>; with them a failed load leaves an
// empty box instead of aborting the render.
export function Img({
  src,
  width,
  height,
  style,
}: {
  src: string;
  width: number;
  height: number;
  style?: React.CSSProperties;
}) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} width={width} height={height} style={{ width, height, objectFit: 'cover', ...style }} />;
}

// Full-canvas layer. Satori ignores the `inset` shorthand, so spell out the box.
export const FILL: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1200,
  height: 630,
  display: 'flex',
};

export function Cover({ src, style }: { src: string; style?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      src={src}
      width={1200}
      height={630}
      style={{
        ...FILL,
        objectFit: 'cover',
        objectPosition: 'center',
        ...style,
      }}
    />
  );
}
