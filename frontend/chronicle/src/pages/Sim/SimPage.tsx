import { useState, useEffect, useCallback, useRef } from "react";
import { Swords, Play, Loader2, UserSearch } from "lucide-react";
import type { CreatureData } from "../../sim/types";
import type { CharacterConfig } from "../../sim/character";
import type { SimItem, ArmoryPlayer } from "../../api/typesGenerated";
import { ApiDataProvider } from "../../sim/dataProvider";
import { useSimRunner } from "./useSimRunner";
import { SimResultsPanel } from "./SimResultsPanel";
import { SimEventsProvider } from "./SimEventsProvider";
import { SimPanelGrid } from "./SimPanelGrid";

const RACES: Record<number, { name: string; classes: number[] }> = {
  1: { name: "Human", classes: [1, 2, 4, 5, 8, 9] },
  2: { name: "Orc", classes: [1, 3, 4, 7, 9] },
  3: { name: "Dwarf", classes: [1, 2, 3, 4, 5] },
  4: { name: "Night Elf", classes: [1, 3, 4, 5, 11] },
  5: { name: "Undead", classes: [1, 4, 5, 8, 9] },
  6: { name: "Tauren", classes: [1, 3, 7, 11] },
  7: { name: "Gnome", classes: [1, 4, 8, 9] },
  8: { name: "Troll", classes: [1, 3, 4, 5, 7, 8] },
};

const CLASSES: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  11: "Druid",
};

const CLASS_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(CLASSES).map(([id, name]) => [name, Number(id)]),
);

const RACE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(RACES).map(([id, r]) => [r.name, Number(id)]),
);

const SLOT_NAMES: Record<number, string> = {
  0: "Head", 1: "Neck", 2: "Shoulder", 3: "Shirt", 4: "Chest",
  5: "Waist", 6: "Legs", 7: "Feet", 8: "Wrist", 9: "Hands",
  10: "Ring 1", 11: "Ring 2", 12: "Trinket 1", 13: "Trinket 2",
  14: "Back", 15: "Main Hand", 16: "Off Hand", 17: "Ranged", 18: "Tabard",
};

type Tab = "config" | "results";

export function SimPage() {
  const [tab, setTab] = useState<Tab>("config");
  const [raceId, setRaceId] = useState(1);
  const [classId, setClassId] = useState(1);
  const [durationSec, setDurationSec] = useState(300);
  const [targetKey, setTargetKey] = useState("target_dummy");
  const [bossPresets, setBossPresets] = useState<Record<string, CreatureData>>({});

  // Armory import
  const [armoryRealm, setArmoryRealm] = useState("Ambershire");
  const [armoryInput, setArmoryInput] = useState("");
  const [armoryLoading, setArmoryLoading] = useState(false);
  const [armoryError, setArmoryError] = useState<string | null>(null);
  const [armoryPlayer, setArmoryPlayer] = useState<ArmoryPlayer | null>(null);
  const [gear, setGear] = useState<Map<number, SimItem>>(new Map());
  const providerRef = useRef(new ApiDataProvider());

  const { run, isRunning, error, result } = useSimRunner();

  useEffect(() => {
    fetch("/api/v1/assets/boss-presets.json")
      .then((r) => r.json())
      .then(setBossPresets)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const race = RACES[raceId];
    if (race && !race.classes.includes(classId)) {
      setClassId(race.classes[0]);
    }
  }, [raceId, classId]);

  // Auto-switch to results tab after sim completes
  useEffect(() => {
    if (result) setTab("results");
  }, [result]);

  const handleLoadArmory = useCallback(async () => {
    const input = armoryInput.trim();
    if (!input) return;

    setArmoryLoading(true);
    setArmoryError(null);

    try {
      const name = input;
      const res = await fetch(
        `/api/v1/armory/${encodeURIComponent(armoryRealm)}/${encodeURIComponent(name)}`,
      );
      if (!res.ok) {
        throw new Error(res.status === 404 ? `Player "${name}" not found` : `Failed to load (${res.status})`);
      }
      const player: ArmoryPlayer = await res.json();
      setArmoryPlayer(player);

      const rid = RACE_NAME_TO_ID[player.race];
      if (rid) setRaceId(rid);
      const cid = CLASS_NAME_TO_ID[player.class];
      if (cid) setClassId(cid);

      const provider = providerRef.current;
      const loadedGear = new Map<number, SimItem>();
      const promises = player.gear.map(async (slot, idx) => {
        if (!slot.item_id || slot.item_id === 0) return;
        const item = await provider.getItem(slot.item_id);
        if (item) loadedGear.set(idx, item);
      });
      await Promise.all(promises);
      setGear(loadedGear);
    } catch (e) {
      setArmoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setArmoryLoading(false);
    }
  }, [armoryInput, armoryRealm]);

  const handleRun = useCallback(() => {
    const target = bossPresets[targetKey];
    if (!target) return;

    const config: CharacterConfig = {
      race: raceId,
      classId,
      level: 60,
      gear,
      talents: new Map(),
      buffs: [],
    };

    run({
      character: config,
      target,
      rotation: null,
      durationMs: durationSec * 1000,
      iterations: 1,
      spellIds: [],
    });
  }, [raceId, classId, durationSec, targetKey, bossPresets, gear, run]);

  const availableClasses = RACES[raceId]?.classes ?? [];
  const gearCount = gear.size;
  const targetName = bossPresets[targetKey]?.name ?? "Target Dummy";

  return (
    <div className="px-4 py-6 w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Swords className="h-6 w-6 text-zinc-400" />
        <h1 className="text-2xl font-bold text-zinc-100">DPS Simulator</h1>
        <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded">
          Alpha
        </span>

        {/* Tabs */}
        <div className="ml-auto flex gap-1 rounded-lg bg-zinc-800/50 p-1">
          <button
            onClick={() => setTab("config")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              tab === "config"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Config
          </button>
          <button
            onClick={() => setTab("results")}
            disabled={!result}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              tab === "results"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            Results
          </button>
        </div>
      </div>

      {/* Config Tab */}
      {tab === "config" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
          <div className="lg:col-span-1 space-y-6">
            {/* Armory Import */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Load from Armory
              </h2>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                value={armoryRealm}
                onChange={(e) => setArmoryRealm(e.target.value)}
              >
                {["Ambershire", "Tel'Abim", "Nordanaar", "South Seas", "Gehennas", "Ravenstorm", "Karazhan", "Blood Ring"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Character name"
                  value={armoryInput}
                  onChange={(e) => setArmoryInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLoadArmory()}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600"
                />
                <button
                  onClick={handleLoadArmory}
                  disabled={armoryLoading || !armoryInput.trim()}
                  className="rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1.5 text-sm text-zinc-300"
                >
                  {armoryLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserSearch className="h-4 w-4" />
                  )}
                </button>
              </div>
              {armoryError && (
                <p className="text-xs text-red-400">{armoryError}</p>
              )}
              {armoryPlayer && (
                <div className="text-xs text-zinc-400">
                  Loaded <span className="text-zinc-200 font-medium">{armoryPlayer.name}</span>
                  {" · "}Lvl {armoryPlayer.level} {armoryPlayer.race} {armoryPlayer.class}
                  {" · "}{gearCount} items
                </div>
              )}
            </div>

            {/* Configuration */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Configuration
              </h2>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Race</label>
                <select
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                  value={raceId}
                  onChange={(e) => setRaceId(Number(e.target.value))}
                >
                  {Object.entries(RACES).map(([id, race]) => (
                    <option key={id} value={id}>{race.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Class</label>
                <select
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                  value={classId}
                  onChange={(e) => setClassId(Number(e.target.value))}
                >
                  {availableClasses.map((id) => (
                    <option key={id} value={id}>{CLASSES[id]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Target</label>
                <select
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                  value={targetKey}
                  onChange={(e) => setTargetKey(e.target.value)}
                >
                  {Object.entries(bossPresets).map(([key, boss]) => (
                    <option key={key} value={key}>{boss.name} (Lvl {boss.level})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Fight Duration: {durationSec}s
                </label>
                <input
                  type="range"
                  min={30}
                  max={600}
                  step={10}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Gear summary */}
            {gearCount > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Gear ({gearCount} items)
                </h2>
                <div className="space-y-0.5 text-xs">
                  {[...gear.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([slot, item]) => (
                      <div key={slot} className="flex justify-between text-zinc-400">
                        <span className="text-zinc-500">{SLOT_NAMES[slot] ?? `Slot ${slot}`}</span>
                        <span className="text-zinc-300 truncate ml-2">{item.name}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Simulating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Simulation
                </>
              )}
            </button>

            {error && (
              <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Right: DPS Summary */}
          <div className="lg:col-span-2">
            {result ? (
              <SimResultsPanel result={result} />
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center text-zinc-500">
                <Swords className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Load a character from the armory or configure manually, then run.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Tab */}
      {tab === "results" && result && (
        <SimEventsProvider streams={result.streams}>
          <SimPanelGrid
            playerName={armoryPlayer?.name ?? "Simulated Player"}
            classId={classId}
            raceId={raceId}
            targetName={targetName}
            durationMs={result.durationMs}
            startTimestamp={result.startTimestamp}
          />
        </SimEventsProvider>
      )}
    </div>
  );
}
