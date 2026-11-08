import { readPublicFile } from './public-files';
import type { ThemeFont } from './types';

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
