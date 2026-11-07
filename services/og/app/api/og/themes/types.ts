// What the handler prepares for a card beyond its query params (which cards
// read from ThemeContext). Only the guild card uses these today.
export interface ThemeProps {
  // Validated `#rrggbb`, or null to use the theme's own accent.
  accent: string | null;
  // The caller's `icon`, already fetched through the SSRF checks and inlined
  // as a data URL; null when absent or rejected so themes can lay out without it.
  iconSrc: string | null;
}

export interface ThemeContext {
  searchParams: URLSearchParams;
}

export interface ThemeFont {
  name: string;
  data: ArrayBuffer | Buffer;
  style: 'normal' | 'italic';
  weight: 300 | 400 | 500 | 600 | 700 | 800 | 900;
}

export interface ThemeDefinition {
  loadFonts: (context: ThemeContext) => Promise<ThemeFont[]>;
  // Async when the theme draws on bundled images (see public-files.ts).
  render: (props: ThemeProps, context: ThemeContext) => React.ReactElement | Promise<React.ReactElement>;
  fontFamily: string;
}
