import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, Castle, Search, Check, ChevronsUpDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

import { useSupportedInstances, useRealms } from "@/api/queries";
import { useUrlState, serializers } from "@/hooks/useUrlState";
import {
  getInstanceCategory,
  INSTANCE_CONFIG,
} from "@/pages/Logs/utils/instanceImages";
import { RaidCard } from "./RaidCard";
import { expandInstanceOptions, expandInstanceQuery } from "./recentRaids.utils";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";

function renderItems(names: string[], selected: string[], onToggle: (name: string) => void) {
  return names.map((name) => {
    const isSelected = selected.includes(name);
    return (
      <button
        key={name}
        className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground"
        onClick={() => onToggle(name)}
      >
        <span className={`h-4 w-4 shrink-0 flex items-center justify-center rounded-sm border ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
          {isSelected && <Check className="h-3 w-3" />}
        </span>
        {name}
      </button>
    );
  });
}

function InstanceCombobox({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((name) => name.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverPrimitive.Trigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          Instances ({selected.length})
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-80 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instances..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1 styled-scrollbar">
            {selected.length > 0 && (
              <button
                className="w-full text-left text-sm px-2 py-1.5 rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={onClear}
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-4 text-center">No instances found</p>
            )}
            {renderItems(filtered, selected, onToggle)}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

const API_BASE = "/api/v1/raidlogs";

type CategoryFilter = "all" | "raid" | "dungeon";
type VideoFilter = "all" | "with";

function parseCategoryFilter(value: string): CategoryFilter {
  if (value === "raid" || value === "dungeon") {
    return value;
  }
  return "all";
}

function parseVideoFilter(value: string): VideoFilter {
  if (value === "with") {
    return value;
  }
  return "all";
}

export function RecentRaids() {
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { data: supportedInstances } = useSupportedInstances();
  const { data: realms } = useRealms();

  const [rawCategory, setRawCategory] = useUrlState("cat", "all", serializers.string);
  const [selectedInstances, setSelectedInstances] = useUrlState("inst", [], serializers.stringArray);
  const [rawVideoFilter, setRawVideoFilter] = useUrlState("vid", "all", serializers.string);
  const [realmID, setRealmID] = useUrlState("realm", "", serializers.string);

  const category = parseCategoryFilter(rawCategory);
  const videoFilter = parseVideoFilter(rawVideoFilter);

  // useUrlState(stringArray) deserializes to a new array each render, so stabilize it.
  const selectedInstancesKey = useMemo(
    () => [...selectedInstances].sort((a, b) => a.localeCompare(b)).join("\u0000"),
    [selectedInstances],
  );
  const stableSelectedInstances = useMemo(
    () => [...selectedInstances],
    [selectedInstancesKey],
  );

  const instanceOptions = useMemo(() => {
    const supportedNames = Array.isArray(supportedInstances) ? supportedInstances.map(i => i.name) : [];
    const fallbackNames = Object.keys(INSTANCE_CONFIG);
    const baseNames = supportedNames.length > 0 ? supportedNames : fallbackNames;

    // Expand parent instances (e.g. "Tower of Karazhan") so their derived
    // sub-instances ("Lower Tower of Karazhan", "Upper Tower of Karazhan")
    // are searchable and selectable in the picker.
    const expandedNames = expandInstanceOptions(baseNames);

    // Include selected instances so URL-provided values remain visible in the picker.
    const uniqueNames = new Set<string>([...expandedNames, ...stableSelectedInstances]);
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
  }, [stableSelectedInstances, supportedInstances]);

  const categoryInstanceOptions = useMemo(() => {
    if (category === "all") {
      return instanceOptions;
    }

    return instanceOptions.filter((name) => getInstanceCategory(name) === category);
  }, [category, instanceOptions]);

  const selectedInstancesValid = useMemo(
    () => stableSelectedInstances.filter((name) => instanceOptions.includes(name)),
    [instanceOptions, stableSelectedInstances],
  );

  const effectiveInstanceNames = useMemo(() => {
    let names: string[];
    if (selectedInstancesValid.length > 0) {
      if (category === "all") {
        names = selectedInstancesValid;
      } else {
        const categorySet = new Set(categoryInstanceOptions);
        names = selectedInstancesValid.filter((name) => categorySet.has(name));
      }
    } else if (category === "all") {
      names = [];
    } else {
      names = categoryInstanceOptions;
    }

    // Expand parent instances (e.g. "Tower of Karazhan") to include their
    // derived sub-instances in the API query so all matching rows are returned.
    return expandInstanceQuery(names);
  }, [category, categoryInstanceOptions, selectedInstancesValid]);

  const hasConflictingFilters = selectedInstancesValid.length > 0 && effectiveInstanceNames.length === 0;

  const hasVideoParam = videoFilter === "with" ? "true" : "";

  const PAGE_SIZE = 24;

  const fetchInstances = useCallback(async (offset?: number) => {
    if (hasConflictingFilters) {
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setInstances([]);
      setHasMore(false);
      return;
    }

    const isInitial = !offset;
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (offset) {
        params.set("offset", String(offset));
      }

      for (const name of effectiveInstanceNames) {
        params.append("instance_name", name);
      }

      if (hasVideoParam) {
        params.set("has_video", hasVideoParam);
      }

      if (realmID) {
        params.set("realm_id", realmID);
      }

      const response = await fetch(`${API_BASE}/recent?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data: RecentInstancesResponse = await response.json();

      if (isInitial) {
        setInstances([...data.instances]);
      } else {
        setInstances((prev) => [...prev, ...data.instances]);
      }

      setHasMore(data.instances.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recent raids");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [effectiveInstanceNames, hasConflictingFilters, hasVideoParam, realmID]);

  // Initial load and reload on filter change
  useEffect(() => {
    if (rawCategory !== category) {
      setRawCategory(category);
      return;
    }

    if (rawVideoFilter !== videoFilter) {
      setRawVideoFilter(videoFilter);
      return;
    }

    setHasMore(false);
    fetchInstances();
  }, [
    category,
    fetchInstances,
    rawCategory,
    rawVideoFilter,
    realmID,
    setRawCategory,
    setRawVideoFilter,
    videoFilter,
  ]);

  // Infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loadingMore || hasConflictingFilters || instances.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchInstances(instances.length);
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [fetchInstances, hasConflictingFilters, hasMore, instances.length, loadingMore]);

  const toggleInstance = useCallback((name: string) => {
    setSelectedInstances((prev) => {
      if (prev.includes(name)) {
        return prev.filter((entry) => entry !== name);
      }

      return [...prev, name];
    });
  }, [setSelectedInstances]);

  const hasActiveFilters =
    category !== "all" ||
    videoFilter !== "all" ||
    realmID !== "" ||
    selectedInstancesValid.length > 0;
  const isRefreshing = loading && instances.length > 0;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 space-y-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Castle className="h-7 w-7" />
            Recent
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse the latest dungeon & raid uploads from the community
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Category:</span>
          <Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setRawCategory("all")}>
            All
          </Button>
          <Button size="sm" variant={category === "raid" ? "default" : "outline"} onClick={() => setRawCategory("raid")}>
            Raids
          </Button>
          <Button size="sm" variant={category === "dungeon" ? "default" : "outline"} onClick={() => setRawCategory("dungeon")}>
            Dungeons
          </Button>

          <span className="text-sm text-muted-foreground ml-3 mr-1">Video:</span>
          <Button size="sm" variant={videoFilter === "all" ? "default" : "outline"} onClick={() => setRawVideoFilter("all")}>
            All
          </Button>
          <Button size="sm" variant={videoFilter === "with" ? "default" : "outline"} onClick={() => setRawVideoFilter("with")}>
            With Video
          </Button>

          <span className="text-sm text-muted-foreground ml-3 mr-1">Realm:</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={realmID}
            onChange={(event) => setRealmID(event.target.value)}
          >
            <option value="">All</option>
            {realms?.map((realm) => (
              <option key={realm.id} value={realm.id}>
                {realm.name}
              </option>
            ))}
          </select>

          <InstanceCombobox
            options={categoryInstanceOptions}
            selected={selectedInstancesValid}
            onToggle={toggleInstance}
            onClear={() => setSelectedInstances([])}
          />

          {selectedInstancesValid.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedInstances([])}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {isRefreshing && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating results...
        </div>
      )}

      <div className="min-h-[60vh]">
        {/* Loading state */}
        {loading && instances.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <Card className="p-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => fetchInstances()}>Try Again</Button>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !error && instances.length === 0 && (
          <Card className="p-12 text-center">
            <Castle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No raids found
            </h3>
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "No raids match the selected filters."
                : "No raids have been uploaded yet. Be the first!"}
            </p>
          </Card>
        )}

        {/* Raid grid */}
        {instances.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {instances.map((instance) => (
                <RaidCard key={instance.id} instance={instance} />
              ))}
            </div>

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-8">
                {loadingMore ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-sm text-muted-foreground">Scroll for more</span>
                )}
              </div>
            )}

            {/* End of results */}
            {!loading && !hasMore && instances.length > 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                You&apos;ve reached the end! {instances.length} raids shown.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
