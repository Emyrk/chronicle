import type { ArmoryPlayer } from "./types";

/**
 * Mock armory data for development until the API is built.
 * TODO: Remove once /api/v1/armory endpoint exists.
 */
export const MOCK_PLAYER: ArmoryPlayer = {
  guid: "0x0000000000ABC123",
  realm_name: "Ambershire",
  name: "Grothak",
  class: "WARRIOR",
  race: "Orc",
  gender: 2,
  guild_name: "Warlords of Draenor",
  gear: [
    { item_id: 16963, slot: 1, name: "Helm of Wrath", quality: 4, icon: "inv_helmet_06", enchant_id: 2583 },
    { item_id: 18404, slot: 2, name: "Onyxia Tooth Pendant", quality: 4, icon: "inv_misc_gem_bloodstone_01" },
    { item_id: 16961, slot: 3, name: "Pauldrons of Wrath", quality: 4, icon: "inv_shoulder_29", enchant_id: 2715 },
    { item_id: 13340, slot: 16, name: "Cape of the Black Baron", quality: 3, icon: "inv_misc_cape_16", enchant_id: 849 },
    { item_id: 16966, slot: 5, name: "Breastplate of Wrath", quality: 4, icon: "inv_chest_plate16" },
    { item_id: 0, slot: 4, name: "", quality: 0, icon: "" },
    { item_id: 0, slot: 19, name: "", quality: 0, icon: "" },
    { item_id: 16959, slot: 9, name: "Bracelets of Wrath", quality: 4, icon: "inv_bracer_19" },
    { item_id: 16964, slot: 10, name: "Gauntlets of Wrath", quality: 4, icon: "inv_gauntlets_29", enchant_id: 2564 },
    { item_id: 16960, slot: 6, name: "Waistguard of Wrath", quality: 4, icon: "inv_belt_22" },
    { item_id: 16962, slot: 7, name: "Legplates of Wrath", quality: 4, icon: "inv_pants_04" },
    { item_id: 16965, slot: 8, name: "Sabatons of Wrath", quality: 4, icon: "inv_boots_plate_06" },
    { item_id: 19382, slot: 11, name: "Master Dragonslayer's Ring", quality: 4, icon: "inv_jewelry_ring_46" },
    { item_id: 17063, slot: 11, name: "Band of Accuria", quality: 4, icon: "inv_jewelry_ring_30" },
    { item_id: 19406, slot: 12, name: "Drake Fang Talisman", quality: 4, icon: "inv_jewelry_necklace_25" },
    { item_id: 11815, slot: 12, name: "Hand of Justice", quality: 3, icon: "inv_jewelry_talisman_07" },
    { item_id: 19364, slot: 21, name: "Ashkandi, Greatsword of the Brotherhood", quality: 4, icon: "inv_sword_50", enchant_id: 2646 },
    { item_id: 0, slot: 22, name: "", quality: 0, icon: "" },
    { item_id: 18713, slot: 15, name: "Rhok'delar, Longbow of the Ancient Keepers", quality: 4, icon: "inv_weapon_bow_11" },
  ],
  updated_at: "2025-12-15T10:30:00Z",
};
