/** Frozen examples rendered from services/og's released preview fixtures, not live player records. */
export const SHARE_IMAGE_EXAMPLES = [
  {
    id: "raid-report",
    title: "The whole night, at a glance.",
    caption: "Boss progress, duration and the fight against the clock.",
    alt: "Naxxramas raid report: 13 of 15 bosses, 2:28:44 duration and an average kill-time parse of 84.",
  },
  {
    id: "clear-percentile",
    title: "A fast clear deserves the spotlight.",
    caption: "Qualifying runs with a clear-time parse of 90+ get a fast-clear card.",
    alt: "Molten Core fast-clear card with a 1:01:52 clear and a 93 time parse.",
  },
  {
    id: "parse-unranked",
    title: "One boss. One shared victory.",
    caption: "Kill time, top DPS and top HPS. Not a selected player's parse.",
    alt: "Nefarian boss-kill card showing a 5:26 kill, Ravenshield at 1,102 DPS and Aeloria at 964 HPS.",
  },
  {
    id: "guild-progression",
    title: "Introduce your guild with its progress.",
    caption: "Logged boss kills tell the story. No roster or aggregate player score.",
    alt: "No Quarter guild card showing progression through Molten Core, Blackwing Lair, Ahn'Qiraj and Naxxramas.",
  },
  {
    id: "character-history",
    title: "Put a character behind the name.",
    caption: "Armory previews show character history, not performance rankings.",
    alt: "Aeloria's Holy Priest character-history card with gear level and 14 logs seen.",
  },
  {
    id: "talents-build",
    title: "Start the build discussion before the click.",
    caption: "Share the build URL to show its class, spec and points per tree.",
    alt: "Fire Mage talent-build card with a 10 / 32 / 0 point distribution.",
  },
] as const;

export const SHARE_IMAGES_SCENE_FRAMES = 210;
export const SHARE_IMAGES_BOOKEND_FRAMES = 150;
export const SHARE_IMAGES_DURATION = SHARE_IMAGES_BOOKEND_FRAMES * 2 + SHARE_IMAGE_EXAMPLES.length * SHARE_IMAGES_SCENE_FRAMES;
export const shareImagePath = (id: string) => `/c/images/blog/share-images/${id}.png`;
