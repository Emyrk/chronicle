import { useEffect, useState } from "react";
import type { RotationEntry } from "./PriorityRotation";

interface ClassSpell {
  id: number;
  name: string;
  spellDamageType: number;
}

interface RotationBuilderProps {
  classId: number;
  entries: RotationEntry[];
  onChange: (entries: RotationEntry[]) => void;
}

export function RotationBuilder({
  classId,
  entries,
  onChange,
}: RotationBuilderProps) {
  const [classSpells, setClassSpells] = useState<ClassSpell[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    fetch("/api/v1/assets/class-spells.json")
      .then((r) => r.json())
      .then((data: Record<string, ClassSpell[]>) => {
        const spells = data[String(classId)] ?? [];
        // Sort alphabetically, filter to damage spells (spellDamageType > 0 or all)
        setClassSpells(spells.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => setClassSpells([]))
      .finally(() => setLoading(false));
  }, [classId]);

  const addSpell = (spellId: number) => {
    if (entries.some((e) => e.spellId === spellId)) return;
    const spell = classSpells.find((s) => s.id === spellId);
    if (!spell) return;
    onChange([...entries, { spellId, name: spell.name }]);
  };

  const removeSpell = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...entries];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= entries.length - 1) return;
    const next = [...entries];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-zinc-300">
        Spell Priority (highest first)
      </label>

      {/* Current priority list */}
      {entries.length === 0 && (
        <p className="text-xs text-zinc-500">
          No spells in rotation. Add spells below.
        </p>
      )}
      <div className="space-y-1">
        {entries.map((entry, idx) => (
          <div
            key={entry.spellId}
            className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm"
          >
            <span className="text-zinc-500 w-5 text-right">{idx + 1}.</span>
            <span className="flex-1 text-zinc-200">{entry.name}</span>
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 px-1"
            >
              ↑
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx >= entries.length - 1}
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 px-1"
            >
              ↓
            </button>
            <button
              onClick={() => removeSpell(idx)}
              className="text-zinc-500 hover:text-red-400 px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add spell dropdown */}
      <select
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
        value=""
        onChange={(e) => addSpell(Number(e.target.value))}
        disabled={loading || classSpells.length === 0}
      >
        <option value="">
          {loading ? "Loading spells..." : "Add spell to rotation..."}
        </option>
        {classSpells
          .filter((s) => !entries.some((e) => e.spellId === s.id))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </div>
  );
}
