import { Trophy, CheckCircle, XCircle } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface ProgressConfig {
  instance: string;
}

// Stubbed fake data
const FAKE_PROGRESS: Record<string, { name: string; bosses: { name: string; killed: boolean }[] }> = {
  mc: {
    name: "Molten Core",
    bosses: [
      { name: "Lucifron", killed: true },
      { name: "Magmadar", killed: true },
      { name: "Gehennas", killed: true },
      { name: "Garr", killed: true },
      { name: "Baron Geddon", killed: true },
      { name: "Shazzrah", killed: true },
      { name: "Sulfuron Harbinger", killed: true },
      { name: "Golemagg", killed: true },
      { name: "Majordomo Executus", killed: true },
      { name: "Ragnaros", killed: true },
    ],
  },
  bwl: {
    name: "Blackwing Lair",
    bosses: [
      { name: "Razorgore", killed: true },
      { name: "Vaelastrasz", killed: true },
      { name: "Broodlord Lashlayer", killed: true },
      { name: "Firemaw", killed: true },
      { name: "Ebonroc", killed: true },
      { name: "Flamegor", killed: true },
      { name: "Chromaggus", killed: false },
      { name: "Nefarian", killed: false },
    ],
  },
  aq40: {
    name: "Temple of Ahn'Qiraj",
    bosses: [
      { name: "The Prophet Skeram", killed: true },
      { name: "Bug Trio", killed: true },
      { name: "Battleguard Sartura", killed: true },
      { name: "Fankriss the Unyielding", killed: false },
      { name: "Viscidus", killed: false },
      { name: "Princess Huhuran", killed: false },
      { name: "Twin Emperors", killed: false },
      { name: "Ouro", killed: false },
      { name: "C'Thun", killed: false },
    ],
  },
};

function ProgressContent({ config }: GuildPanelRenderProps<ProgressConfig>) {
  const instance = FAKE_PROGRESS[config.instance || "mc"];
  const killed = instance.bosses.filter((b) => b.killed).length;
  const total = instance.bosses.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{instance.name}</span>
        <span className="text-sm text-muted-foreground">
          {killed}/{total}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${(killed / total) * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {instance.bosses.map((boss) => (
          <div
            key={boss.name}
            className="flex items-center gap-2 text-xs py-1"
          >
            {boss.killed ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={boss.killed ? "text-foreground" : "text-muted-foreground"}>
              {boss.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ProgressPanel: GuildPanelDefinition<ProgressConfig> = {
  type: "progress",
  label: "Raid Progress",
  icon: <Trophy className="h-4 w-4" />,
  description: "Shows boss kill progress for an instance",
  defaultSize: { w: 12, h: 2 },
  minSize: { w: 6, h: 2 },
  maxSize: { w: 12, h: 4 },
  configSchema: [
    {
      name: "instance",
      label: "Instance",
      type: "select",
      options: [
        { value: "mc", label: "Molten Core" },
        { value: "bwl", label: "Blackwing Lair" },
        { value: "aq40", label: "Temple of Ahn'Qiraj" },
      ],
      defaultValue: "mc",
    },
  ],
  defaultConfig: {
    instance: "mc",
  },
  render: (props) => <ProgressContent {...props} />,
};
