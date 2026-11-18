import { copyPossibleHostilesCode } from "./possibleHostilesExport";
import { useState } from "react";
import { ChevronRight, Fingerprint } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import type { IdentityReport } from "@/api/typesGenerated";

export function IdentitySection({ identity }: { identity: IdentityReport }) {
  const zonedUnits = identity.zoned_units ? Object.entries(identity.zoned_units) : [];
  const zoneSpells = identity.zone_spells ? Object.entries(identity.zone_spells) : [];
  const unitSpells = identity.unit_spells ? Object.entries(identity.unit_spells) : [];
  const [copyStatus, setCopyStatus] = useState("");
  const [category, setCategory] = useState("all");
  const instances = identity.instances ?? [];
  const unknownCount = instances.flatMap(i => i.units).filter(u => u.category === "unknown").reduce((sum, u) => sum + u.unique_count, 0);

  // Build a name lookup from zonedUnits for unit_spells (keyed by entry ID)
  const creatureNames = new Map<string, string>();
  for (const [, creatures] of zonedUnits) {
    for (const c of creatures) {
      creatureNames.set(String(c.entry_id), c.name);
    }
  }

  for (const instance of instances) {
    for (const unit of instance.units) {
      if (unit.name) creatureNames.set(String(unit.entry_id), unit.name);
    }
  }
  const totalCreatures = instances.length > 0 ? instances.flatMap(i => i.units).reduce((sum, u) => sum + u.unique_count, 0) : zonedUnits.reduce((sum, [, creatures]) => sum + creatures.length, 0);
  const totalSpells = zoneSpells.reduce((sum, [, spells]) => sum + spells.length, 0);

  return (
    <Card className="p-6">
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 font-semibold text-lg list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
          <Fingerprint className="h-5 w-5 text-blue-500" />
          Unit Categories
          <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
            ({totalCreatures} units, {unknownCount} unknown, {totalSpells} spells)
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          {identity.possible_hostiles_go_code && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Possible hostiles Go export (review required)</summary>
              <p className="my-2 text-sm text-muted-foreground">Unknown category does not prove hostility. This scaffold includes only unknown and ordinary entries. Review affiliation, boss roles, encounter names and hooks before registering the factory. Known boss flags are preserved; this is not a replacement for existing encounter definitions.</p>
              <button type="button" className="rounded bg-muted px-2 py-1 text-xs" onClick={async () => setCopyStatus(await copyPossibleHostilesCode(identity.possible_hostiles_go_code!))}>Copy possible hostiles Go code</button>
              <span role="status" className="ml-2 text-xs">{copyStatus}</span>
              <pre className="styled-scrollbar mt-2 max-h-96 overflow-auto rounded bg-muted/50 p-3 text-xs whitespace-pre">{identity.possible_hostiles_go_code}</pre>
            </details>
          )}
          {instances.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Final categories for observed GUIDs, including passive references and instances without retained encounters. Counts are unique GUIDs per instance, not event counts. Up to three sample GUIDs per entry.</p>
              <label className="text-sm font-medium">
                Category filter
                <select aria-label="Category filter" className="ml-2 rounded border bg-background p-1" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {["unknown", "ordinary", "guardian", "scripted_object", "object", "environment", "critter", "totem", "trap", "demon", "player", "pet"].map(c => (
                    <option key={c} value={c}>{c} ({instances.flatMap(i => i.units).filter(u => u.category === c).reduce((sum, u) => sum + u.unique_count, 0)})</option>
                  ))}
                </select>
              </label>
              {instances.map((instance, index) => (
                <details key={index} open>
                  <summary className="cursor-pointer text-sm font-medium">{instance.name} · {instance.zone} · Instance {index + 1}</summary>
                  <div className="styled-scrollbar mt-2 space-y-1 max-h-80 overflow-auto">
                    {instance.units.filter(u => category === "all" || u.category === category).map(unit => (
                      <div key={`${unit.category}:${unit.entry_id}`} className={`rounded p-2 text-xs ${unit.category === "unknown" ? "bg-amber-500/10 border border-amber-500/40" : "bg-muted/30"}`}>
                        <div><strong>{unit.category}</strong> · {unit.name || "Unnamed"} · Entry {unit.entry_id} · {unit.unique_count} unique GUIDs</div>
                        <div className="font-mono break-all text-muted-foreground">{unit.samples.join(", ")}</div>
                      </div>
                    ))}
                    {instance.units.filter(u => category === "all" || u.category === category).length === 0 && <p className="text-sm text-muted-foreground">No units in this category.</p>}
                  </div>
                </details>
              ))}
            </div>
          )}
          {instances.length === 0 && <p className="text-sm text-muted-foreground">This report has no category catalogue. Legacy creatures below are unclassified, not necessarily unknown. Reparse with Categories to populate it.</p>}
          {/* Creatures by Zone */}
          {zonedUnits.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Legacy creatures by zone (unclassified)</h4>
              <div className="space-y-3">
                {zonedUnits
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([zone, creatures]) => (
                  <details key={zone}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {zone} <span className="text-muted-foreground">({creatures.length} creatures)</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto styled-scrollbar">
                      {creatures
                        .sort((a, b) => a.entry_id - b.entry_id)
                        .map((c) => (
                        <div key={c.entry_id} className="flex justify-between font-mono p-1 bg-muted/30 rounded">
                          <span>
                            {c.name} <span className="text-muted-foreground">({c.entry_id})</span>
                          </span>
                          <span className="text-muted-foreground">{c.unique_count}× unique</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Spells by Zone */}
          {zoneSpells.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Spells by Zone</h4>
              <div className="space-y-3">
                {zoneSpells
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([zone, spells]) => (
                  <details key={zone}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {zone} <span className="text-muted-foreground">({spells.length} spells)</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto styled-scrollbar">
                      {spells
                        .sort((a, b) => a.spell_id - b.spell_id)
                        .map((s) => (
                        <div key={s.spell_id} className="flex justify-between font-mono p-1 bg-muted/30 rounded">
                          <span>Spell {s.spell_id}</span>
                          <span className="text-muted-foreground">{s.count}× seen</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Spells by Creature */}
          {unitSpells.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Spells by Creature</h4>
              <div className="space-y-3">
                {unitSpells
                  .sort(([a], [b]) => {
                    const nameA = creatureNames.get(a) ?? a;
                    const nameB = creatureNames.get(b) ?? b;
                    return nameA.localeCompare(nameB);
                  })
                  .map(([entryId, spells]) => (
                  <details key={entryId}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {creatureNames.get(entryId) ?? `Creature ${entryId}`}{" "}
                      <span className="text-muted-foreground">({entryId}) — {spells.length} spells</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto styled-scrollbar">
                      {spells.sort().map((spell) => (
                        <div key={spell} className="font-mono p-1 bg-muted/30 rounded">
                          {spell}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}
