import { BarChart3, Skull, Clock, Users } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface StatsConfig {
  showTotalKills: boolean;
  showRaidTime: boolean;
  showMembers: boolean;
}

// Stubbed fake data
const FAKE_STATS = {
  totalBossKills: 247,
  totalRaidTime: "156h 32m",
  uniqueMembers: 52,
  raidsCompleted: 34,
  averageRaidDuration: "2h 15m",
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function StatsContent({ config }: GuildPanelRenderProps<StatsConfig>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {config.showTotalKills && (
        <StatCard
          icon={<Skull className="h-5 w-5" />}
          label="Boss Kills"
          value={FAKE_STATS.totalBossKills}
        />
      )}
      {config.showRaidTime && (
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Total Raid Time"
          value={FAKE_STATS.totalRaidTime}
        />
      )}
      {config.showMembers && (
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Unique Raiders"
          value={FAKE_STATS.uniqueMembers}
        />
      )}
      <StatCard
        icon={<BarChart3 className="h-5 w-5" />}
        label="Raids Completed"
        value={FAKE_STATS.raidsCompleted}
      />
    </div>
  );
}

export const StatsPanel: GuildPanelDefinition<StatsConfig> = {
  type: "stats",
  label: "Guild Stats",
  icon: <BarChart3 className="h-4 w-4" />,
  description: "Shows aggregate statistics for the guild",
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 3 },
  configSchema: [
    {
      name: "showTotalKills",
      label: "Show total boss kills",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showRaidTime",
      label: "Show total raid time",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showMembers",
      label: "Show unique members",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    showTotalKills: true,
    showRaidTime: true,
    showMembers: true,
  },
  render: (props) => <StatsContent {...props} />,
};
