// Theme registry shared by the OG handler and the landing page. Rendering code
// lives in app/api/og/themes; this file stays tiny so it can be imported anywhere.

export const OG_THEMES = [
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
    description: 'Chronicle raid report: guild, raid, bosses, clear time, kill-time parses, top damage and healing, and class composition.',
  },
  {
    key: 'parse',
    label: 'Boss share',
    description: 'One boss kill: kill time and the fight\'s top damage and healing. A preserved player-parse design draws when a score is given.',
  },
  {
    key: 'clear',
    label: 'Clear time',
    description: 'A qualified fast clear: the timer, realm rank or Top N%, the record it broke and per-boss splits.',
  },
] as const;

export type OgThemeOption = (typeof OG_THEMES)[number];
export type OgThemeKey = OgThemeOption['key'];

// Unknown or missing template names draw the brand card, like every fallback.
export const DEFAULT_OG_THEME: OgThemeKey = 'brand';

const themeKeys = new Set<string>(OG_THEMES.map(theme => theme.key));

export function normalizeOgTheme(value: string | null | undefined): OgThemeKey {
  return value && themeKeys.has(value) ? (value as OgThemeKey) : DEFAULT_OG_THEME;
}
