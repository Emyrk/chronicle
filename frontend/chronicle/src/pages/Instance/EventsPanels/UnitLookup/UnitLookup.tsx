/**
 * Unit Lookup panel – displays all known units, merging static instance
 * data with temporal unit_classification events.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { unitLookupProcessor, type UnitLookupResult, type UnitEntry } from "./unitLookup.processor";

const UNIT_TYPE_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Player",
  2: "Creature",
  3: "Object",
  4: "Vehicle",
};

const AFFILIATION_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Unknown", color: "text-muted-foreground" },
  1: { label: "Friendly", color: "text-green-400" },
  2: { label: "Hostile", color: "text-red-400" },
  3: { label: "Neutral", color: "text-yellow-400" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createUnitLookupPanel(): PanelDefinition<UnitLookupResult, any> {
  return {
    ...unitLookupProcessor,
    label: "Unit Lookup",
    icon: <Search className="h-4 w-4" />,
    supportsPerSecond: false,

    render: (props: PanelRenderProps<UnitLookupResult>) => (
      <UnitLookupContent {...props} />
    ),
  };
}

function UnitLookupContent({ result, context }: PanelRenderProps<UnitLookupResult>) {
  const [search, setSearch] = useState("");
  const searchLower = search.toLowerCase();

  // Merge static units with classification data.
  // No useMemo — processEvent mutates the classifications Map in-place and
  // shallowClone only creates a new top-level result object, so the Map ref
  // is stable across ticks. Computing on every render is cheap (small collections).
  const map = new Map<string, UnitEntry>();
  const staticUnits = context.instance.units;
  for (const [guid, unit] of Object.entries(staticUnits ?? {})) {
    map.set(guid, {
      guid,
      name: unit.name,
      entry: unit.entry,
      owner: unit.owner?.toString() ?? null,
      controller: null,
      controllerSpellId: 0,
      unitType: 0,
      affiliation: 0,
    });
  }
  for (const [guid, entry] of result.classifications) {
    map.set(guid, entry);
  }
  const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = searchLower
    ? merged.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.guid.toLowerCase().includes(searchLower) ||
          u.entry.toString().includes(searchLower),
      )
    : merged;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search units…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-7 pr-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Count */}
      <div className="text-xs text-muted-foreground shrink-0">
        {filtered.length} / {merged.length} units
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto styled-scrollbar">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 px-1 font-medium">Name</th>
              <th className="py-1 px-1 font-medium">Entry</th>
              <th className="py-1 px-1 font-medium">Type</th>
              <th className="py-1 px-1 font-medium">Affil.</th>
              <th className="py-1 px-1 font-medium">Owner</th>
              <th className="py-1 px-1 font-medium">Controller</th>
              <th className="py-1 px-1 font-medium">GUID</th>
            </tr>
          </thead>
          <tbody key={result.version}>
            {filtered.map((unit) => (
              <UnitRow key={unit.guid} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitRow({ unit }: { unit: UnitEntry }) {
  const aff = AFFILIATION_LABELS[unit.affiliation] ?? AFFILIATION_LABELS[0];
  const isPossessed = unit.controller !== null;

  return (
    <tr
      className={`border-b border-border/50 hover:bg-muted/30 ${isPossessed ? "bg-purple-500/10" : ""}`}
    >
      <td className="py-0.5 px-1 font-medium truncate max-w-[150px]" title={unit.name}>
        {unit.name}
      </td>
      <td className="py-0.5 px-1 tabular-nums">{unit.entry || "—"}</td>
      <td className="py-0.5 px-1">{UNIT_TYPE_LABELS[unit.unitType] ?? "?"}</td>
      <td className={`py-0.5 px-1 ${aff.color}`}>{aff.label}</td>
      <td className="py-0.5 px-1 truncate max-w-[100px] text-muted-foreground" title={unit.owner ?? ""}>
        {unit.owner ?? "—"}
      </td>
      <td className={`py-0.5 px-1 truncate max-w-[100px] ${isPossessed ? "text-purple-400" : "text-muted-foreground"}`} title={unit.controller ?? ""}>
        {unit.controller ?? "—"}
      </td>
      <td className="py-0.5 px-1 truncate max-w-[120px] text-muted-foreground font-mono" title={unit.guid}>
        {unit.guid}
      </td>
    </tr>
  );
}
