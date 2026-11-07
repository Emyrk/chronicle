// Theme registry shared by the OG handler and the landing page. Rendering code
// lives in app/api/og/themes; this file stays tiny so it can be imported anywhere.

export const OG_THEMES = [
  {
    key: 'modern',
    label: 'Modern',
    description: 'Headline set straight on your cover image, like a magazine cover. The neutral default.',
  },
  {
    key: 'chronicle',
    label: 'Chronicle',
    description: 'Chronicle\'s dark card: a Libre Baskerville headline over an Inter byline, with a gold rule.',
  },
  {
    key: 'talents',
    label: 'Talent build',
    description: 'A talent calculator build: spec in class colour, the point split and a bar per tree.',
  },
  {
    key: 'character',
    label: 'Character',
    description: 'Armory character card: class emblem, level line, parse, item level and kills, and the best three bosses.',
  },
  {
    key: 'brand',
    label: 'Brand',
    description: 'Chronicle\'s wordmark, a tagline and up to two site counts. The fallback for every Chronicle card.',
  },
  {
    key: 'guild',
    label: 'Guild',
    description: 'A guild\'s logo or monogram, raid progression bars, best clear and average parse.',
  },
  {
    key: 'raid',
    label: 'Raid report',
    description: 'Chronicle raid report: guild, raid, bosses, clear time, avg parse, top damage and class composition.',
  },
  {
    key: 'parse',
    label: 'Boss parse',
    description: 'One player on one boss kill: the parse ring in its tier colour, DPS or HPS, kill time and rank; DPS and raid rank lead without a parse.',
  },
] as const;

export type OgThemeOption = (typeof OG_THEMES)[number];
export type OgThemeKey = OgThemeOption['key'];

export const DEFAULT_OG_THEME: OgThemeKey = 'modern';

const themeKeys = new Set<string>(OG_THEMES.map(theme => theme.key));

export function normalizeOgTheme(value: string | null | undefined): OgThemeKey {
  return value && themeKeys.has(value) ? (value as OgThemeKey) : DEFAULT_OG_THEME;
}
