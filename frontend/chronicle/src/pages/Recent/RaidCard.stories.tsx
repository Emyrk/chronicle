import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { RaidCard } from "./RaidCard";
import type { RecentInstance } from "@/api/typesGenerated";

// Note: Stories use actual loading screen images from /public/images/loadingscreens/
// Make sure those images exist when viewing in Storybook

const baseInstance: RecentInstance = {
  id: "12345678-1234-1234-1234-123456789012",
  slug: "molten-core-123",
  name: "Molten Core",
  realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
  realm_name: "Ambershire",
  uploader_id: "user-1",
  uploader_name: "Emyrk",
  guild_id: "guild-1234",
  guild_name: "Turtle Raiders",
  uploaded_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  first_encounter_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  player_count: 40,
  boss_count: 10,
  boss_kills: 10,
  duration_ms: 83 * 60 * 1000, // 1h 23m
  encounters: [
    { name: "Lucifron", boss: true, kill: true },
    { name: "Magmadar", boss: true, kill: true },
    { name: "Gehennas", boss: true, kill: true },
    { name: "Garr", boss: true, kill: true },
    { name: "Shazzrah", boss: true, kill: true },
    { name: "Baron Geddon", boss: true, kill: true },
    { name: "Sulfuron Harbinger", boss: true, kill: true },
    { name: "Golemagg", boss: true, kill: true },
    { name: "Majordomo Executus", boss: true, kill: true },
    { name: "Ragnaros", boss: true, kill: true },
  ],
};

const meta: Meta<typeof RaidCard> = {
  title: "pages/RecentRaids/RaidCard",
  component: RaidCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="w-[280px]">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Full clear of Molten Core - the ideal scenario!
 */
export const FullClear: Story = {
  args: {
    instance: baseInstance,
  },
};

/**
 * Partial clear with some wipes.
 */
export const PartialClear: Story = {
  args: {
    instance: {
      ...baseInstance,
      boss_kills: 7,
      encounters: [
        { name: "Lucifron", boss: true, kill: true },
        { name: "Magmadar", boss: true, kill: true },
        { name: "Gehennas", boss: true, kill: true },
        { name: "Garr", boss: true, kill: true },
        { name: "Shazzrah", boss: true, kill: true },
        { name: "Baron Geddon", boss: true, kill: true },
        { name: "Sulfuron Harbinger", boss: true, kill: true },
        { name: "Golemagg", boss: true, kill: false },
        { name: "Majordomo Executus", boss: true, kill: false },
        { name: "Ragnaros", boss: true, kill: false },
      ],
    },
  },
};

/**
 * Complete wipe - no bosses killed.
 */
export const CompleteWipe: Story = {
  args: {
    instance: {
      ...baseInstance,
      boss_kills: 0,
      duration_ms: 45 * 60 * 1000, // 45 minutes
      encounters: baseInstance.encounters?.map(e => ({ ...e, kill: false })),
    },
  },
};

/**
 * Onyxia's Lair - single boss raid.
 */
export const SingleBoss: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Onyxia's Lair",
      slug: "onyxias-lair-456",
      boss_count: 1,
      boss_kills: 1,
      duration_ms: 12 * 60 * 1000, // 12 minutes
      encounters: [{ name: "Onyxia", boss: true, kill: true }],
    },
  },
};

/**
 * Blackwing Lair full clear.
 */
export const BWLFullClear: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Blackwing Lair",
      slug: "blackwing-lair-789",
      boss_count: 8,
      boss_kills: 8,
      duration_ms: 58 * 60 * 1000, // 58 minutes
      encounters: [
        { name: "Razorgore", boss: true, kill: true },
        { name: "Vaelastrasz", boss: true, kill: true },
        { name: "Broodlord Lashlayer", boss: true, kill: true },
        { name: "Firemaw", boss: true, kill: true },
        { name: "Ebonroc", boss: true, kill: true },
        { name: "Flamegor", boss: true, kill: true },
        { name: "Chromaggus", boss: true, kill: true },
        { name: "Nefarian", boss: true, kill: true },
      ],
    },
  },
};

/**
 * Zul'Gurub - 20 player raid.
 */
export const ZulGurub: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Zul'Gurub",
      slug: "zulgurub-101",
      player_count: 20,
      boss_count: 10,
      boss_kills: 8,
      duration_ms: 105 * 60 * 1000, // 1h 45m
      encounters: [
        { name: "Jeklik", boss: true, kill: true },
        { name: "Venoxis", boss: true, kill: true },
        { name: "Mar'li", boss: true, kill: true },
        { name: "Mandokir", boss: true, kill: true },
        { name: "Thekal", boss: true, kill: true },
        { name: "Arlokk", boss: true, kill: true },
        { name: "Jin'do", boss: true, kill: true },
        { name: "Hakkar", boss: true, kill: true },
        { name: "Gahz'ranka", boss: true, kill: false },
        { name: "Edge of Madness", boss: true, kill: false },
      ],
    },
  },
};

/**
 * Naxxramas - lots of bosses!
 */
export const Naxxramas: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Naxxramas",
      slug: "naxxramas-202",
      boss_count: 15,
      boss_kills: 12,
      duration_ms: 4 * 60 * 60 * 1000, // 4 hours
      encounters: [
        { name: "Anub'Rekhan", boss: true, kill: true },
        { name: "Faerlina", boss: true, kill: true },
        { name: "Maexxna", boss: true, kill: true },
        { name: "Noth", boss: true, kill: true },
        { name: "Heigan", boss: true, kill: true },
        { name: "Loatheb", boss: true, kill: true },
        { name: "Razuvious", boss: true, kill: true },
        { name: "Gothik", boss: true, kill: true },
        { name: "Four Horsemen", boss: true, kill: true },
        { name: "Patchwerk", boss: true, kill: true },
        { name: "Grobbulus", boss: true, kill: true },
        { name: "Gluth", boss: true, kill: true },
        { name: "Thaddius", boss: true, kill: false },
        { name: "Sapphiron", boss: true, kill: false },
        { name: "Kel'Thuzad", boss: true, kill: false },
      ],
    },
  },
};

/**
 * 5-man dungeon - Stratholme.
 */
export const Dungeon: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Stratholme",
      slug: "stratholme-303",
      player_count: 5,
      boss_count: 5,
      boss_kills: 5,
      duration_ms: 45 * 60 * 1000, // 45 minutes
      encounters: [
        { name: "Hearthsinger Forresten", boss: true, kill: true },
        { name: "Timmy the Cruel", boss: true, kill: true },
        { name: "Commander Malor", boss: true, kill: true },
        { name: "Willey Hopebreaker", boss: true, kill: true },
        { name: "Baron Rivendare", boss: true, kill: true },
      ],
    },
  },
};

/**
 * Very recent upload - just now.
 */
export const JustUploaded: Story = {
  args: {
    instance: {
      ...baseInstance,
      uploaded_at: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
      first_encounter_time: new Date(Date.now() - 30 * 1000).toISOString(),
    },
  },
};

/**
 * Old upload - a week ago.
 */
export const WeekOld: Story = {
  args: {
    instance: {
      ...baseInstance,
      uploaded_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      first_encounter_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  },
};

/**
 * Long uploader name - tests truncation.
 */
export const LongUploaderName: Story = {
  args: {
    instance: {
      ...baseInstance,
      uploader_name: "TheGreatestRaidLeaderOnThisServer",
    },
  },
};

/**
 * No encounters data - just summary stats.
 */
export const NoEncounters: Story = {
  args: {
    instance: {
      ...baseInstance,
      encounters: undefined,
    },
  },
};

/**
 * No guild - shows just uploader name without guild prefix.
 */
export const NoGuild: Story = {
  args: {
    instance: {
      ...baseInstance,
      guild_id: undefined,
      guild_name: undefined,
    },
  },
};

/**
 * Long guild name - tests layout with very long guild names.
 */
export const LongGuildName: Story = {
  args: {
    instance: {
      ...baseInstance,
      guild_name: "Knights of the Eternal Flame",
    },
  },
};

/**
 * World Bosses - variable player count.
 */
export const WorldBosses: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "World Bosses",
      slug: "world-bosses-404",
      player_count: 52,
      boss_count: 4,
      boss_kills: 3,
      duration_ms: 2.5 * 60 * 60 * 1000, // 2.5 hours
      encounters: [
        { name: "Azuregos", boss: true, kill: true },
        { name: "Kazzak", boss: true, kill: true },
        { name: "Emeriss", boss: true, kill: true },
        { name: "Lethon", boss: true, kill: false },
      ],
    },
  },
};

/**
 * Speed run - very short duration.
 */
export const SpeedRun: Story = {
  args: {
    instance: {
      ...baseInstance,
      duration_ms: 22 * 60 * 1000, // 22 minutes
    },
  },
};

/**
 * Different realm - Tel'Abim.
 */
export const DifferentRealm: Story = {
  args: {
    instance: {
      ...baseInstance,
      realm_id: "f94d3103-1cd8-40e9-ad91-a2366de33354",
      realm_name: "Tel'Abim",
    },
  },
};

/**
 * Unknown instance - falls back to generic dungeon background.
 */
export const UnknownInstance: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Some Unknown Raid",
      slug: "unknown-raid-999",
    },
  },
};

/**
 * Missing image - shows solid color fallback when image fails to load.
 * (Simulated by using a non-existent image path)
 */
export const MissingImage: Story = {
  args: {
    instance: {
      ...baseInstance,
      name: "Broken Image Test", // Not in INSTANCE_BACKGROUNDS, will use default
      slug: "broken-test",
    },
  },
};


/**
 * Multiple uploads of the same run. Hover the numbered tabs to preview each upload.
 */
export const GroupedUploads: Story = {
  args: {
    instance: baseInstance,
    instances: [
      baseInstance,
      {
        ...baseInstance,
        id: "22345678-1234-1234-1234-123456789012",
        slug: "molten-core-duplicate-2",
        uploader_id: "user-2",
        uploader_name: "Steven",
        recorder_name: "Steven",
        boss_kills: 8,
        duration_ms: 76 * 60 * 1000,
        has_youtube_video: true,
      },
      {
        ...baseInstance,
        id: "32345678-1234-1234-1234-123456789012",
        slug: "molten-core-duplicate-3",
        uploader_id: "user-3",
        uploader_name: "Raidlogger",
        recorder_name: "Mira",
        player_count: 38,
        boss_kills: 6,
        duration_ms: 61 * 60 * 1000,
      },
    ],
  },
};

/**
 * Grid of multiple cards showing different instances - demonstrates the visual variety.
 */
export const GridPreview: StoryObj = {
  render: () => {
    const instances: RecentInstance[] = [
      { ...baseInstance, name: "Molten Core", boss_kills: 10 },
      { ...baseInstance, id: "2", name: "Blackwing Lair", boss_count: 8, boss_kills: 8, duration_ms: 58 * 60 * 1000 },
      { ...baseInstance, id: "3", name: "Naxxramas", boss_count: 15, boss_kills: 12, duration_ms: 4 * 60 * 60 * 1000 },
      { ...baseInstance, id: "4", name: "Zul'Gurub", player_count: 20, boss_count: 10, boss_kills: 10, duration_ms: 105 * 60 * 1000 },
      { ...baseInstance, id: "5", name: "Temple of Ahn'Qiraj", boss_count: 9, boss_kills: 7 },
      { ...baseInstance, id: "6", name: "Onyxia's Lair", boss_count: 1, boss_kills: 1, duration_ms: 12 * 60 * 1000 },
      { ...baseInstance, id: "7", name: "Stratholme", player_count: 5, boss_count: 5, boss_kills: 5, duration_ms: 45 * 60 * 1000 },
      { ...baseInstance, id: "8", name: "Scholomance", player_count: 5, boss_count: 6, boss_kills: 4, duration_ms: 52 * 60 * 1000 },
    ];
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
        {instances.map((inst) => (
          <RaidCard key={inst.id} instance={inst} />
        ))}
      </div>
    );
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
};

