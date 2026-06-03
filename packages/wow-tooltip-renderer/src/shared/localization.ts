import type { I18nText } from "../types.js";

export const LOCALES = [
  { index: "0", code: "enUS", label: "English" },
  { index: "1", code: "koKR", label: "한국어" },
  { index: "2", code: "frFR", label: "Français" },
  { index: "3", code: "deDE", label: "Deutsch" },
  { index: "4", code: "zhCN", label: "简体中文" },
  { index: "5", code: "zhTW", label: "繁體中文" },
  { index: "6", code: "esES", label: "Español (EU)" },
  { index: "7", code: "esMX", label: "Español (MX)" },
  { index: "8", code: "ruRU", label: "Русский" },
  { index: "9", code: "jaJP", label: "日本語" },
  { index: "10", code: "ptPT", label: "Português" },
  { index: "11", code: "itIT", label: "Italiano" },
] as const;

export type LocaleIndex = (typeof LOCALES)[number]["index"];

/** Return the English (enUS, index "0") text, or empty string. */
export function getEnglishText(text: I18nText | undefined): string {
  if (!text) return "";
  return text["0"] || "";
}

/** Return localized text for the given locale, falling back to enUS. */
export function getLocalizedText(
  text: I18nText | undefined,
  locale: LocaleIndex,
): string {
  if (!text) return "";
  return text[locale] || text["0"] || "";
}
