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
] as const;

export type OgThemeOption = (typeof OG_THEMES)[number];
export type OgThemeKey = OgThemeOption['key'];

export const DEFAULT_OG_THEME: OgThemeKey = 'modern';

const themeKeys = new Set<string>(OG_THEMES.map(theme => theme.key));

export function normalizeOgTheme(value: string | null | undefined): OgThemeKey {
  return value && themeKeys.has(value) ? (value as OgThemeKey) : DEFAULT_OG_THEME;
}
