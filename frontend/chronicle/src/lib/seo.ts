const SEO_PRODUCT_NAMES = [
  ["wow-forever", "WoW Forever"],
  ["kronos", "Kronos"],
  ["chromiecraft", "ChromieCraft"],
  ["warmane", "Warmane"],
  ["epoch", "Epoch Reborn"],
  ["vanillaplus", "VanillaPlus"],
  ["octowow", "OctoWoW"],
  ["capybara", "CapybaraCraft"],
  ["ravencraft", "Ravencraft"],
  ["sunreach", "Sun Reach"],
  ["faebright", "Faebright"],
  ["crusader-storm", "Crusader Storm"],
  ["lunatic", "Level One Lunatics"],
] as const;

export function seoProductName(flavor: readonly string[] | undefined): string {
  if (!flavor) return "";

  return SEO_PRODUCT_NAMES.find(([tag]) => flavor.includes(tag))?.[1] ?? "";
}
