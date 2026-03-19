import { useState, useCallback, useRef } from "react";
import { Engine } from "../../sim/engine";
import { finalizeResults } from "../../sim/results";
import type { SimResults } from "../../sim/results";
import type { SpellData, CreatureData, PlayerBaseStats } from "../../sim/types";
import { ApiDataProvider } from "../../sim/dataProvider";
import type { CharacterConfig } from "../../sim/character";
import type { Rotation } from "../../sim/engine";
import { collectSimSteps } from "../../sim/panelBridge";
import type { StepResult } from "../../sim/engine";

export interface SimRunConfig {
  character: CharacterConfig;
  target: CreatureData;
  rotation: Rotation;
  durationMs: number;
  iterations: number;
  spellIds: number[]; // spells to preload
}

export interface SimRunResult {
  results: SimResults;
  steps: StepResult[];
  spells: Map<number, SpellData>;
  durationMs: number;
}

export function useSimRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimRunResult | null>(null);
  const providerRef = useRef(new ApiDataProvider());

  const run = useCallback(async (config: SimRunConfig) => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const provider = providerRef.current;

      // Load base stats
      const baseStats: PlayerBaseStats | null = await provider.getPlayerBaseStats(
        config.character.race,
        config.character.classId,
      );

      // Load all spells used in rotation
      const spells = new Map<number, SpellData>();
      for (const id of config.spellIds) {
        const spell = await provider.getSpell(id);
        if (spell) spells.set(id, spell);
      }

      // Create and configure engine
      const engine = new Engine(
        config.character,
        config.target,
        baseStats,
        spells,
      );
      engine.setRotation(config.rotation);
      engine.setSeed(Date.now());

      // Single pass: collect steps, then finalize results
      engine.reset();
      const steps = collectSimSteps(engine, config.durationMs);
      const engineResults = engine.getResults();
      engineResults.durationMs = config.durationMs;
      finalizeResults(engineResults);

      setResult({
        results: engineResults,
        steps,
        spells,
        durationMs: config.durationMs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { run, isRunning, error, result };
}
