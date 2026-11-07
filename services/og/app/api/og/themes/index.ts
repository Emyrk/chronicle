import type { OgThemeKey } from '@/app/lib/og-themes';
import { brandTheme } from './brand';
import { characterTheme } from './character';
import { clearTheme } from './clear';
import { guildTheme } from './guild';
import { parseTheme } from './parse';
import { talentsTheme } from './talents';
import { raidTheme } from './raid';
import type { ThemeDefinition } from './types';

export const themes: Record<OgThemeKey, ThemeDefinition> = {
  talents: talentsTheme,
  brand: brandTheme,
  character: characterTheme,
  guild: guildTheme,
  raid: raidTheme,
  parse: parseTheme,
  clear: clearTheme,
};
