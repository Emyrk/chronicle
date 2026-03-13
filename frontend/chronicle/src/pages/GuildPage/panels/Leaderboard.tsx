import { Medal, Swords, Heart, Zap } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface LeaderboardConfig {
  metric: "dps" | "hps" | "damage";
  limit: number;
}

// Stubbed fake data
const FAKE_LEADERBOARD = {
  dps: [
    { rank: 1, name: "Fireball", class: "Mage", value: "1,245 DPS", spec: "Fire" },
    { rank: 2, name: "Shadowmeld", class: "Rogue", value: "1,180 DPS", spec: "Combat" },
    { rank: 3, name: "Arrowstorm", class: "Hunter", value: "1,122 DPS", spec: "Marksmanship" },
    { rank: 4, name: "Soulreaper", class: "Warlock", value: "1,089 DPS", spec: "Destruction" },
    { rank: 5, name: "Thunderfury", class: "Warrior", value: "987 DPS", spec: "Fury" },
  ],
  hps: [
    { rank: 1, name: "Healbot", class: "Priest", value: "845 HPS", spec: "Holy" },
    { rank: 2, name: "Natureboi", class: "Druid", value: "812 HPS", spec: "Restoration" },
    { rank: 3, name: "Holylight", class: "Paladin", value: "756 HPS", spec: "Holy" },
    { rank: 4, name: "Chainheals", class: "Shaman", value: "698 HPS", spec: "Restoration" },
    { rank: 5, name: "Shadowpriest", class: "Priest", value: "234 HPS", spec: "Shadow" },
  ],
  damage: [
    { rank: 1, name: "Fireball", class: "Mage", value: "2.4M", spec: "Fire" },
    { rank: 2, name: "Shadowmeld", class: "Rogue", value: "2.2M", spec: "Combat" },
    { rank: 3, name: "Arrowstorm", class: "Hunter", value: "2.1M", spec: "Marksmanship" },
    { rank: 4, name: "Soulreaper", class: "Warlock", value: "1.9M", spec: "Destruction" },
    { rank: 5, name: "Thunderfury", class: "Warrior", value: "1.8M", spec: "Fury" },
  ],
};

const CLASS_COLORS: Record<string, string> = {
  Warrior: "text-class-warrior",
  Priest: "text-class-priest",
  Rogue: "text-class-rogue",
  Mage: "text-class-mage",
  Druid: "text-class-druid",
  Hunter: "text-class-hunter",
  Warlock: "text-class-warlock",
  Paladin: "text-class-paladin",
  Shaman: "text-class-shaman",
};

const RANK_STYLES = {
  1: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  2: "bg-gray-400/20 text-gray-300 border-gray-400/30",
  3: "bg-orange-600/20 text-orange-400 border-orange-600/30",
};

const METRIC_ICONS = {
  dps: <Swords className="h-4 w-4" />,
  hps: <Heart className="h-4 w-4" />,
  damage: <Zap className="h-4 w-4" />,
};

const METRIC_LABELS = {
  dps: "Top DPS",
  hps: "Top Healers",
  damage: "Total Damage",
};

function LeaderboardContent({ config }: GuildPanelRenderProps<LeaderboardConfig>) {
  const data = FAKE_LEADERBOARD[config.metric || "dps"].slice(0, config.limit || 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
        {METRIC_ICONS[config.metric || "dps"]}
        {METRIC_LABELS[config.metric || "dps"]}
      </div>
      {data.map((entry) => (
        <div
          key={entry.rank}
          className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
              RANK_STYLES[entry.rank as keyof typeof RANK_STYLES] || "bg-muted text-muted-foreground border-muted"
            }`}
          >
            {entry.rank}
          </div>
          <div className="flex-1">
            <span className={`font-medium text-sm ${CLASS_COLORS[entry.class]}`}>
              {entry.name}
            </span>
            <span className="text-xs text-muted-foreground ml-2">{entry.spec}</span>
          </div>
          <span className="text-sm font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export const LeaderboardPanel: GuildPanelDefinition<LeaderboardConfig> = {
  type: "leaderboard",
  label: "Leaderboard",
  icon: <Medal className="h-4 w-4" />,
  description: "Top performers in the guild",
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 6 },
  configSchema: [
    {
      name: "metric",
      label: "Metric",
      type: "select",
      options: [
        { value: "dps", label: "DPS" },
        { value: "hps", label: "HPS" },
        { value: "damage", label: "Total Damage" },
      ],
      defaultValue: "dps",
    },
    {
      name: "limit",
      label: "Number of entries",
      type: "number",
      defaultValue: 5,
    },
  ],
  defaultConfig: {
    metric: "dps",
    limit: 5,
  },
  render: (props) => <LeaderboardContent {...props} />,
};
