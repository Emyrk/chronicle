import type { OgThemeKey } from '@/app/lib/og-themes';
import { chronicleTheme } from './chronicle';
import { modernTheme } from './modern';
import { talentsTheme } from './talents';
import type { ThemeDefinition } from './types';

export const themes: Record<OgThemeKey, ThemeDefinition> = {
  modern: modernTheme,
  chronicle: chronicleTheme,
  talents: talentsTheme,
};
