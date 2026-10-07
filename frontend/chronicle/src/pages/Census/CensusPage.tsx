import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Users, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCensus, useRealms, useSiteConfig } from "@/api/queries";
import { PlayersTab } from "./PlayersTab";

const DAY_PRESETS = [30, 60, 90, 180, 365] as const;
const EMPTY_FLAVOR: readonly string[] = [];

function RealmMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id]
    );
  };

  const selectedNames = options.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const label =
    selectedNames.length === 0
      ? "All Realms"
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} realms`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-muted text-sm text-foreground min-w-[160px]"
      >
        <span className={selected.length === 0 ? "text-muted-foreground" : ""}>
          {label}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border bg-popover shadow-md max-h-48 overflow-y-auto min-w-[200px]">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-muted-foreground border-b"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => toggle(option.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
            >
              <span
                className={`h-4 w-4 rounded border flex items-center justify-center text-xs ${
                  selected.includes(option.id)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                }`}
              >
                {selected.includes(option.id) && "✓"}
              </span>
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CensusPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get("tab") ?? "players";
  const days = Number(searchParams.get("days")) || 90;
  const realmIds = searchParams.getAll("realm_id");

  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const setDays = (d: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("days", String(d));
    setSearchParams(next, { replace: true });
  };

  const setRealmIds = (ids: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete("realm_id");
    for (const id of ids) next.append("realm_id", id);
    setSearchParams(next, { replace: true });
  };

  const { data: siteConfig, isLoading: isSiteConfigLoading } = useSiteConfig();
  const tenantFlavor = siteConfig?.tenant ? siteConfig.dataset_flavor : EMPTY_FLAVOR;

  const { data: realms } = useRealms();
  const realmOptions = useMemo(
    () => (realms ?? []).map((r) => ({ id: r.id, name: r.name })),
    [realms]
  );

  const { data: censusData, isLoading } = useCensus({ days, realmIds });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Census
        </h1>
        <p className="text-sm text-muted-foreground">
          Player population statistics based on combat log activity
        </p>
      </div>

      {/* Shared controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Day presets */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
          {DAY_PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === d
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Realm filter */}
        {realmOptions.length > 1 && (
          <RealmMultiSelect
            options={realmOptions}
            selected={realmIds}
            onChange={setRealmIds}
          />
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="players">Players</TabsTrigger>
        </TabsList>
        <TabsContent value="players" className="mt-6">
          <PlayersTab
            data={censusData}
            isLoading={isLoading || isSiteConfigLoading}
            flavor={tenantFlavor}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
