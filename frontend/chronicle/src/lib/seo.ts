const SEO_PRODUCT_NAMES = [
  ["wow-forever", "WoW Forever"],
  ["kronos", "Kronos"],
  ["chromiecraft", "ChromieCraft"],
  ["vanillaplus", "VanillaPlus"],
  ["octowow", "OctoWoW"],
  ["capybara", "CapybaraCraft"],
] as const;

export function seoProductName(flavor: readonly string[] | undefined): string {
  if (!flavor) return "";

  return SEO_PRODUCT_NAMES.find(([tag]) => flavor.includes(tag))?.[1] ?? "";
}
