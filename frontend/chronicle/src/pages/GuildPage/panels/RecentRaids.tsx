import { Calendar, Clock, Users } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RecentRaidsConfig {
  limit: number;
  showDate: boolean;
}

// Stubbed fake data
const FAKE_RAIDS = [
  { id: "1", name: "Molten Core", date: "2024-01-15", duration: "2h 15m", players: 40 },
  { id: "2", name: "Blackwing Lair", date: "2024-01-14", duration: "1h 45m", players: 40 },
  { id: "3", name: "Onyxia's Lair", date: "2024-01-13", duration: "25m", players: 40 },
  { id: "4", name: "Molten Core", date: "2024-01-12", duration: "2h 30m", players: 38 },
  { id: "5", name: "Zul'Gurub", date: "2024-01-11", duration: "1h 20m", players: 20 },
];

function RecentRaidsContent({ config }: GuildPanelRenderProps<RecentRaidsConfig>) {
  const raids = FAKE_RAIDS.slice(0, config.limit || 5);

  return (
    <div className="space-y-2">
      {raids.map((raid) => (
        <div
          key={raid.id}
          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex-1">
            <div className="font-medium text-sm">{raid.name}</div>
            {config.showDate && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {raid.date}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {raid.duration}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {raid.players}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const RecentRaidsPanel: GuildPanelDefinition<RecentRaidsConfig> = {
  type: "recent_raids",
  label: "Recent Raids",
  icon: <Calendar className="h-4 w-4" />,
  description: "Shows recent raid instances for the guild",
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 6 },
  configSchema: [
    {
      name: "limit",
      label: "Number of raids to show",
      type: "number",
      defaultValue: 5,
    },
    {
      name: "showDate",
      label: "Show raid date",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    limit: 5,
    showDate: true,
  },
  render: (props) => <RecentRaidsContent {...props} />,
};
