import { Users, Shield, Sword, Heart } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RosterConfig {
  showClass: boolean;
  showRole: boolean;
}

// Stubbed fake data
const FAKE_ROSTER = [
  { id: "1", name: "Thunderfury", class: "Warrior", role: "Tank", spec: "Protection" },
  { id: "2", name: "Healbot", class: "Priest", role: "Healer", spec: "Holy" },
  { id: "3", name: "Shadowmeld", class: "Rogue", role: "DPS", spec: "Combat" },
  { id: "4", name: "Fireball", class: "Mage", role: "DPS", spec: "Fire" },
  { id: "5", name: "Natureboi", class: "Druid", role: "Healer", spec: "Restoration" },
  { id: "6", name: "Arrowstorm", class: "Hunter", role: "DPS", spec: "Marksmanship" },
  { id: "7", name: "Soulreaper", class: "Warlock", role: "DPS", spec: "Destruction" },
  { id: "8", name: "Holylight", class: "Paladin", role: "Healer", spec: "Holy" },
];

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

const ROLE_ICONS = {
  Tank: <Shield className="h-3 w-3" />,
  Healer: <Heart className="h-3 w-3" />,
  DPS: <Sword className="h-3 w-3" />,
};

function RosterContent({ config }: GuildPanelRenderProps<RosterConfig>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FAKE_ROSTER.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
        >
          {config.showRole && (
            <span className="text-muted-foreground">
              {ROLE_ICONS[player.role as keyof typeof ROLE_ICONS]}
            </span>
          )}
          <span className={`font-medium text-sm ${config.showClass ? CLASS_COLORS[player.class] : ""}`}>
            {player.name}
          </span>
          {config.showClass && (
            <span className="text-xs text-muted-foreground ml-auto">{player.spec}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export const RosterPanel: GuildPanelDefinition<RosterConfig> = {
  type: "roster",
  label: "Guild Roster",
  icon: <Users className="h-4 w-4" />,
  description: "Shows guild members from raid logs",
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 6 },
  configSchema: [
    {
      name: "showClass",
      label: "Show class colors",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showRole",
      label: "Show role icon",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    showClass: true,
    showRole: true,
  },
  render: (props) => <RosterContent {...props} />,
};
