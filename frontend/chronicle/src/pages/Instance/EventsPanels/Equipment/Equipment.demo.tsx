/** Deterministic Equipment panel harness for explainer videos. */
import { ChevronDown, ExternalLink, HelpCircle, MoreVertical, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

const PLAYERS = [
  { name: "Frostweaver", className: "Mage", race: "Gnome", build: "31/0/20", guild: "Example Raid" },
  { name: "Steelbreaker", className: "Warrior", race: "Human", build: "31/20/0", guild: "Example Raid" },
  { name: "Lightmourn", className: "Paladin", race: "High Elf", build: "32/19/0", guild: "Example Raid" },
] as const;

const GEAR = [
  ["Head", "Netherwind Crown", "inv_crown_01", "epic", "+8 Spell Power"],
  ["Neck", "Choker of the Fire Lord", "inv_jewelry_necklace_04", "epic", ""],
  ["Shoulder", "Netherwind Mantle", "inv_shoulder_02", "epic", "+5 Fire Resistance"],
  ["Back", "Cloak of Consumption", "inv_misc_cape_20", "rare", "+5 All Resistances"],
  ["Chest", "Robe of Volatile Power", "inv_chest_cloth_18", "epic", "+100 Health"],
  ["Wrist", "Arcane Accuracy", "inv_bracer_09", "rare", "+7 Intellect"],
  ["Hands", "Netherwind Gloves", "inv_gauntlets_16", "epic", "+20 Frost Damage"],
  ["Waist", "Mana Igniting Cord", "inv_belt_08", "epic", ""],
  ["Legs", "Netherwind Pants", "inv_pants_08", "epic", "+8 Spell Power"],
  ["Feet", "Snowblind Shoes", "inv_boots_cloth_03", "rare", "+7 Stamina"],
  ["Finger", "Band of Forced Concentration", "inv_jewelry_ring_34", "epic", ""],
  ["Trinket", "Talisman of Ephemeral Power", "inv_misc_stonetablet_11", "epic", ""],
  ["Main Hand", "Azuresong Mageblade", "inv_sword_39", "epic", "+30 Spell Power"],
  ["Off Hand", "Tome of the Ice Lord", "inv_misc_book_06", "rare", ""],
] as const;

const QUALITY: Record<string, string> = {
  epic: "border-purple-500 text-purple-400",
  rare: "border-blue-500 text-blue-400",
};

export function EquipmentDemo({
  playerIndex = 0,
  tab = "gear",
  dropdownOpen = false,
  search = "",
}: {
  playerIndex?: number;
  tab?: "gear" | "talents";
  dropdownOpen?: boolean;
  search?: string;
}) {
  const player = PLAYERS[playerIndex] ?? PLAYERS[0];
  const shownPlayers = PLAYERS.filter((candidate) =>
    candidate.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Shirt className="h-4 w-4" />
        <span className="text-sm font-medium">Equipment</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="flex items-center gap-2">
          <div className="relative" data-demo-player-selector>
            <div
              className="flex min-w-[132px] items-center rounded border border-border bg-background px-2 py-1 text-sm"
              data-demo-player-button
            >
              <span style={{ color: `var(--color-class-${player.className.toLowerCase()})` }}>{player.name}</span>
              <span className="ml-auto text-2xs text-muted-foreground">▾</span>
            </div>
            {dropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-0.5 min-w-[178px] rounded border border-border bg-background p-1 shadow-lg" data-demo-player-menu>
                <div className="mb-1 flex h-7 items-center rounded border border-primary px-2 text-xs" data-demo-player-search>
                  {search || <span className="text-muted-foreground">Search...</span>}
                  <span className="ml-px h-3.5 w-px bg-foreground" />
                </div>
                {shownPlayers.map((candidate) => (
                  <div
                    key={candidate.name}
                    className={cn("rounded px-2 py-1 text-sm", candidate.name === player.name && "bg-accent")}
                    style={{ color: `var(--color-class-${candidate.className.toLowerCase()})` }}
                    data-demo-player-option={candidate.name}
                  >
                    {candidate.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
            {player.className} · {player.race} · Level 60 · {player.build} · &lt;{player.guild}&gt;
            <ExternalLink className="h-3 w-3 text-blue-400" />
          </span>
        </div>

        <div className="mt-1 flex gap-1 border-b border-border" data-demo-tabs>
          {(["gear", "talents"] as const).map((value) => (
            <span
              key={value}
              className={cn(
                "border-b px-2 py-1 text-2xs font-medium capitalize",
                tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground",
              )}
            >
              {value}
            </span>
          ))}
        </div>

        {tab === "gear" ? (
          <div className="mt-1 grid grid-cols-2 gap-x-4" data-demo-gear-grid>
            {GEAR.map(([slot, name, icon, quality, enchant]) => (
              <div
                key={`${slot}-${name}`}
                className="flex min-w-0 items-center gap-1.5 py-0.5"
                data-demo-gear-row={slot}
              >
                <div className={cn("grid h-6 w-6 shrink-0 place-items-center rounded border bg-zinc-900", QUALITY[quality])}>
                  <Shirt className="h-3.5 w-3.5 text-zinc-300" aria-label={icon} />
                </div>
                <div className="min-w-0">
                  <div className={cn("truncate text-2xs leading-tight", QUALITY[quality].split(" ")[1])}>{name}</div>
                  {enchant && <div className="truncate text-2xs leading-tight text-quality-uncommon" data-demo-enchant={slot}>{enchant}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative mt-2 h-[320px] overflow-hidden rounded border border-border bg-zinc-950/70 p-3" data-demo-talents>
            <div className="flex justify-end text-xs text-muted-foreground" data-demo-talent-builder>Open in talent builder <ExternalLink className="ml-1 h-3 w-3" /></div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {["Arcane 31", "Fire 0", "Frost 20"].map((tree, treeIndex) => (
                <div key={tree} className="rounded border border-zinc-700 bg-zinc-900/80 p-2" data-demo-talent-tree={treeIndex}>
                  <div className="mb-2 text-center text-xs font-semibold text-amber-100">{tree}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }, (_, index) => {
                      const active = treeIndex !== 1 && index < (treeIndex === 0 ? 8 : 5);
                      return <div key={index} className={cn("relative h-10 rounded border", active ? "border-yellow-500 bg-blue-900/70" : "border-zinc-700 bg-zinc-950")}>
                        {active && <span className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1 text-[9px] text-yellow-300">{index % 3 === 0 ? "5/5" : "1/1"}</span>}
                      </div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>3 combatant snapshots · example data</span>
        <span className="ml-auto text-chart-1">1ms</span>
      </footer>
    </section>
  );
}
