import { useState, useEffect, useCallback } from "react";
import { Swords, Play, Loader2 } from "lucide-react";
import type { CreatureData } from "../../sim/types";
import type { CharacterConfig } from "../../sim/character";
import { useSimRunner } from "./useSimRunner";
import { PriorityRotation, type RotationEntry } from "./PriorityRotation";
import { RotationBuilder } from "./RotationBuilder";
import { SimResultsPanel } from "./SimResultsPanel";

// Race/class constants
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

export function SimPage() {
  // Config state
  const [raceId, setRaceId] = useState(1);
  const [classId, setClassId] = useState(1);
  const [durationSec, setDurationSec] = useState(300);
  const [targetKey, setTargetKey] = useState("target_dummy");
  const [bossPresets, setBossPresets] = useState<Record<string, CreatureData>>(
    {},
  );
  const [rotationEntries, setRotationEntries] = useState<RotationEntry[]>([]);

  const { run, isRunning, error, result } = useSimRunner();

  // Load boss presets
  useEffect(() => {
    fetch("/api/v1/assets/boss-presets.json")
      .then((r) => r.json())
      .then(setBossPresets)
      .catch(() => {});
  }, []);

  // Reset rotation when class changes
  useEffect(() => {
    setRotationEntries([]);
  }, [classId]);

  // Ensure selected race supports selected class
  useEffect(() => {
    const race = RACES[raceId];
    if (race && !race.classes.includes(classId)) {
      // Pick first class this race supports
      setClassId(race.classes[0]);
    }
  }, [raceId, classId]);

  const handleRun = useCallback(() => {
    const target = bossPresets[targetKey];
    if (!target) return;
    if (rotationEntries.length === 0) return;

    const config: CharacterConfig = {
      race: raceId,
      classId,
      level: 60,
      gear: new Map(),
      talents: new Map(),
      buffs: [],
    };

    run({
      character: config,
      target,
      rotation: new PriorityRotation(rotationEntries),
      durationMs: durationSec * 1000,
      iterations: 1,
      spellIds: rotationEntries.map((e) => e.spellId),
    });
  }, [raceId, classId, durationSec, targetKey, bossPresets, rotationEntries, run]);

  const availableClasses = RACES[raceId]?.classes ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Swords className="h-6 w-6 text-zinc-400" />
        <h1 className="text-2xl font-bold text-zinc-100">DPS Simulator</h1>
        <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded">
          Alpha
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Configuration
            </h2>

            {/* Race */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Race</label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                value={raceId}
                onChange={(e) => setRaceId(Number(e.target.value))}
              >
                {Object.entries(RACES).map(([id, race]) => (
                  <option key={id} value={id}>
                    {race.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Class */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Class</label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                value={classId}
                onChange={(e) => setClassId(Number(e.target.value))}
              >
                {availableClasses.map((id) => (
                  <option key={id} value={id}>
                    {CLASSES[id]}
                  </option>
                ))}
              </select>
            </div>

            {/* Target */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                Target
              </label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                value={targetKey}
                onChange={(e) => setTargetKey(e.target.value)}
              >
                {Object.entries(bossPresets).map(([key, boss]) => (
                  <option key={key} value={key}>
                    {boss.name} (Lvl {boss.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
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

          {/* Rotation */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Rotation
            </h2>
            <RotationBuilder
              classId={classId}
              entries={rotationEntries}
              onChange={setRotationEntries}
            />
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning || rotationEntries.length === 0}
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

        {/* Results panel */}
        <div className="lg:col-span-2">
          {result ? (
            <SimResultsPanel result={result} />
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center text-zinc-500">
              <Swords className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Configure your character and rotation, then run the simulation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
