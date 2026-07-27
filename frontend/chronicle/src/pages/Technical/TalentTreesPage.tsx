import { Link } from "react-router-dom";
import { ArrowLeft, TreePine } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TalentTreeViewerLegacy as TalentTreeViewer } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { useDatasets, useSiteConfig } from "@/api/queries";
import { parseTalentString } from "./talentParse";

const CLASSES = [
  { id: 1, name: "Warrior" },
  { id: 2, name: "Paladin" },
  { id: 3, name: "Hunter" },
  { id: 4, name: "Rogue" },
  { id: 5, name: "Priest" },
  { id: 6, name: "Death Knight" },
  { id: 7, name: "Shaman" },
  { id: 8, name: "Mage" },
  { id: 9, name: "Warlock" },
  { id: 11, name: "Druid" },
];

// Minimal type for the /wowdb/talent-trees response – includes talent count per tab
// so we can match WotLK companion rank strings (which lack tab names) by length.
interface TalentTreeJSON {
  classes: Record<
    string,
    { tabs: { name: string; orderIndex: number; talents: { id: number }[] }[] }
  >;
}

const EXAMPLE =
  "1713312000000|COMBATANT_TALENTS|0x00000000001A2B3C|Priests|Discipline;14;00503001500001|Holy;21;05230010500501|Shadow;0;00000000000000000";

const EXAMPLE_WOTLK =
  "P0x0000000000000A3B;T2,2,50200000000000000000000000}005305101230213233115031051}5300202010000000000000000000,50100000000000000000000000}005305100000000000000000000}5000032500033330531115301301";

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

  // Which talent group to display. Defaults to the active group from the
  // parsed message; the user can switch when multiple groups are present.
  const [groupOverride, setGroupOverride] = useState<number | null>(null);
  const selectedGroup = useMemo(() => {
    if (!parsed) return 1;
    const g = groupOverride ?? parsed.activeGroup;
    return Math.min(Math.max(g, 1), parsed.groups.length);
  }, [parsed, groupOverride]);
  const allocations = parsed?.groups[selectedGroup - 1];

  // Detect class from tab names (COMBATANT_TALENTS), or — for formats without
  // tab names (WotLK companion) — by matching per-tab talent counts against
  // each class's talent trees.
  const detectedClassId = useMemo(() => {
    if (!parsed || !allocations || !treeData) return null;

    // By tab name
    for (const alloc of allocations) {
      const cid = tabToClass.get(alloc.tabName.toLowerCase());
      if (cid) return cid;
    }

    // By per-tab talent counts
    const lengths = allocations.map((a) => a.rankDigits.length);
    if (lengths.length !== 3) return null;
    for (const [classId, data] of Object.entries(treeData.classes)) {
      const tabs = [...data.tabs].sort((a, b) => a.orderIndex - b.orderIndex);
      if (tabs.length !== 3) continue;
      if (tabs.every((tab, i) => tab.talents.length === lengths[i])) {
        return parseInt(classId, 10);
      }
    }
    return null;
  }, [parsed, allocations, tabToClass, treeData]);

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

      {/* Input for a talent log line */}
      <div className="mb-6 flex flex-col gap-2">
        <label className="text-sm text-zinc-400">
          Paste a <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded">COMBATANT_TALENTS</code> log line
          or a WotLK companion <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded">P&lt;guid&gt;;T…</code> message
        </label>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setGroupOverride(null);
          }}
          placeholder={`${EXAMPLE}\n${EXAMPLE_WOTLK}`}
          spellCheck={false}
          className="w-full h-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
        />
        {input && !parsed && (
          <p className="text-xs text-red-400">
            Could not parse talent string. Expected formats:{" "}
            <code className="text-[11px]">
              timestamp|COMBATANT_TALENTS|guid|name|Tab1;pts;ranks|Tab2;pts;ranks|Tab3;pts;ranks
            </code>{" "}
            or{" "}
            <code className="text-[11px]">
              P&lt;guid&gt;;T&lt;activeGroup&gt;,&lt;numGroups&gt;,&lt;tab1&#125;tab2&#125;tab3&gt;[,…]
            </code>
          </p>
        )}
        {parsed && allocations && detectedClassId && (
          <p className="text-xs text-green-400">
            Detected: {parsed.playerName ? <strong>{parsed.playerName}</strong> : null}
            {parsed.guid ? <code className="text-[11px]">{parsed.guid}</code> : null}{" "}
            {CLASSES.find((c) => c.id === detectedClassId)?.name ?? `Class ${detectedClassId}`}{" "}
            ({allocations.map((a) => `${a.tabName || "Tab"} ${a.pointsSpent}`).join(" / ")})
          </p>
        )}
        {parsed && allocations && !detectedClassId && treeData && (
          <p className="text-xs text-amber-400">
            Parsed {allocations.length} tabs but could not match a class.
            {allocations.some((a) => a.tabName)
              ? ` Check tab names: ${allocations.map((a) => a.tabName).join(", ")}`
              : ` Tab talent counts (${allocations.map((a) => a.rankDigits.length).join("/")}) did not match any class in this dataset.`}
          </p>
        )}
        {parsed && parsed.groups.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            Talent group:
            {parsed.groups.map((_, i) => {
              const groupNum = i + 1;
              const isActive = groupNum === parsed.activeGroup;
              const isSelected = groupNum === selectedGroup;
              return (
                <button
                  key={groupNum}
                  type="button"
                  onClick={() => setGroupOverride(groupNum)}
                  className={`px-2 py-0.5 rounded border ${
                    isSelected
                      ? "border-zinc-400 text-zinc-100 bg-zinc-800"
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {groupNum}
                  {isActive ? " (active)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Parsed talent tree */}
      {parsed && allocations && detectedClassId && (
        <div className="mb-8">
          <TalentTreeViewer
            classId={detectedClassId}
            allocations={allocations}
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
