import { Link } from "react-router-dom";
import { ArrowLeft, TreePine } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TalentTreeViewer,
  type TalentAllocation,
} from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { useDatasets, useSiteConfig } from "@/api/queries";

const CLASSES = [
  { id: 1, name: "Warrior" },
  { id: 2, name: "Paladin" },
  { id: 3, name: "Hunter" },
  { id: 4, name: "Rogue" },
  { id: 5, name: "Priest" },
  { id: 7, name: "Shaman" },
  { id: 8, name: "Mage" },
  { id: 9, name: "Warlock" },
  { id: 11, name: "Druid" },
];

// Minimal type for the /wowdb/talent-trees response
interface TalentTreeJSON {
  classes: Record<
    string,
    { tabs: { name: string; orderIndex: number }[] }
  >;
}

const EXAMPLE =
  "1713312000000|COMBATANT_TALENTS|0x00000000001A2B3C|Priests|Discipline;14;00503001500001|Holy;21;05230010500501|Shadow;0;00000000000000000";

/**
 * Parse a COMBATANT_TALENTS log line into tab allocations.
 * Returns null if the string doesn't look valid.
 */
function parseTalentString(
  raw: string
): { playerName: string; allocations: TalentAllocation[] } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Split by pipe – accept with or without the COMBATANT_TALENTS prefix fields
  const parts = trimmed.split("|");

  // Find the three tab fields. Full format has 7 fields (timestamp, event, guid, name, tab1, tab2, tab3).
  // Also support pasting just the three tab fields separated by pipes.
  let tabFields: string[];
  let playerName = "";

  if (parts.length >= 7 && parts[1] === "COMBATANT_TALENTS") {
    playerName = parts[3];
    tabFields = parts.slice(4, 7);
  } else if (parts.length === 3 && parts[0].includes(";")) {
    // Just three tab strings
    tabFields = parts;
  } else {
    return null;
  }

  const allocations: TalentAllocation[] = [];
  for (const field of tabFields) {
    const semi = field.split(";");
    if (semi.length < 3) return null;
    allocations.push({
      tabName: semi[0],
      pointsSpent: parseInt(semi[1], 10) || 0,
      rankDigits: semi[2],
    });
  }

  return { playerName, allocations };
}

export function TalentTreesPage() {
  const [input, setInput] = useState("");

  // Dataset selection. Defaults to the current tenant's default dataset
  // (resolved by the context handler); the user can override via the selector.
  const { data: siteConfig } = useSiteConfig();
  const { data: datasets } = useDatasets();
  const [datasetOverride, setDatasetOverride] = useState<string>("");
  const datasetId =
    datasetOverride || siteConfig?.tenant?.default_dataset_id || "";

  // Fetch talent tree data to resolve tab names → class ID
  const { data: treeData } = useQuery<TalentTreeJSON | null>({
    queryKey: ["talent-trees", datasetId || "default"],
    queryFn: async () => {
      const url = datasetId
        ? `/api/v1/wowdb/talent-trees?dataset_id=${encodeURIComponent(datasetId)}`
        : "/api/v1/wowdb/talent-trees";
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch talent trees");
      return res.json();
    },
    staleTime: Infinity,
  });

  // Build a reverse lookup: lowercase tab name → class ID
  const tabToClass = useMemo(() => {
    if (!treeData) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const [classId, data] of Object.entries(treeData.classes)) {
      for (const tab of data.tabs) {
        m.set(tab.name.toLowerCase(), parseInt(classId, 10));
      }
    }
    return m;
  }, [treeData]);

  const parsed = useMemo(() => parseTalentString(input), [input]);

  // Detect class from the first tab name
  const detectedClassId = useMemo(() => {
    if (!parsed || tabToClass.size === 0) return null;
    for (const alloc of parsed.allocations) {
      const cid = tabToClass.get(alloc.tabName.toLowerCase());
      if (cid) return cid;
    }
    return null;
  }, [parsed, tabToClass]);

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl">
      <Link
        to="/technical"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Technical
      </Link>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5" />
          <h1 className="text-xl font-bold">Talent Trees</h1>
        </div>
        {datasets && datasets.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Dataset
            <select
              value={datasetId}
              onChange={(e) => setDatasetOverride(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {/* Empty value = let the server resolve the tenant default. */}
              <option value="">Tenant default</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.wow_version})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Input for COMBATANT_TALENTS string */}
      <div className="mb-6 flex flex-col gap-2">
        <label className="text-sm text-zinc-400">
          Paste a <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded">COMBATANT_TALENTS</code> log line
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          className="w-full h-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
        />
        {input && !parsed && (
          <p className="text-xs text-red-400">
            Could not parse talent string. Expected format:{" "}
            <code className="text-[11px]">
              timestamp|COMBATANT_TALENTS|guid|name|Tab1;pts;ranks|Tab2;pts;ranks|Tab3;pts;ranks
            </code>
          </p>
        )}
        {parsed && detectedClassId && (
          <p className="text-xs text-green-400">
            Detected: {parsed.playerName ? <strong>{parsed.playerName}</strong> : null}{" "}
            {CLASSES.find((c) => c.id === detectedClassId)?.name ?? `Class ${detectedClassId}`}{" "}
            ({parsed.allocations.map((a) => `${a.tabName} ${a.pointsSpent}`).join(" / ")})
          </p>
        )}
        {parsed && !detectedClassId && treeData && (
          <p className="text-xs text-amber-400">
            Parsed {parsed.allocations.length} tabs but could not match a class.
            Check tab names: {parsed.allocations.map((a) => a.tabName).join(", ")}
          </p>
        )}
      </div>

      {/* Parsed talent tree */}
      {parsed && detectedClassId && (
        <div className="mb-8">
          <TalentTreeViewer
            classId={detectedClassId}
            allocations={parsed.allocations}
            datasetId={datasetId || undefined}
          />
        </div>
      )}

      {/* All class trees */}
      <div className="flex flex-col gap-8">
        {CLASSES.map((cls) => (
          <TalentTreeViewer
            key={cls.id}
            classId={cls.id}
            datasetId={datasetId || undefined}
          />
        ))}
      </div>
    </div>
  );
}
