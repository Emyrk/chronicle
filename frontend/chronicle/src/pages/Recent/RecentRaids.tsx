import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, Castle } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { useSupportedInstances } from "@/api/queries";
import { useUrlState, serializers } from "@/hooks/useUrlState";
import {
  getInstanceCategory,
  INSTANCE_CONFIG,
} from "@/pages/Logs/utils/instanceImages";
import { RaidCard } from "./RaidCard";
import type { RecentInstance, RecentInstancesResponse } from "@/api/typesGenerated";

const API_BASE = "/api/v1/raidlogs";

type CategoryFilter = "all" | "raid" | "dungeon";
type VideoFilter = "all" | "with";

const REALM_OPTIONS = [
  { id: "851d2fd3-f9c5-4623-b714-924b59d916aa", name: "Ambershire" },
  { id: "f94d3103-1cd8-40e9-ad91-a2366de33354", name: "Tel Abim" },
  { id: "bcf173a7-c94a-49fe-8930-27435d722fb7", name: "Nordanaar" },
  { id: "ad486d39-31dd-4eb6-a43d-7d469df4ffcf", name: "South Seas" },
  { id: "c240e1e4-9d2b-46f7-b23c-6b55a37b4710", name: "Gehennas" },
  { id: "885cd224-aa71-4592-81e2-98fe138ca650", name: "Ravenstorm" },
  { id: "0f9825e5-8a88-4bfb-80f6-26b472c7a1aa", name: "Karazhan" },
  { id: "5f786828-1c60-4360-8b0f-14b7b494be3a", name: "Blood Ring" },
] as const;

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

function parseRealmFilter(value: string): string {
  if (REALM_OPTIONS.some((realm) => realm.id === value)) {
    return value;
  }
  return "";
}

export function RecentRaids() {
  const [instances, setInstances] = useState<RecentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { data: supportedInstances } = useSupportedInstances();

  const [rawCategory, setRawCategory] = useUrlState("cat", "all", serializers.string);
  const [selectedInstances, setSelectedInstances] = useUrlState("inst", [], serializers.stringArray);
  const [rawVideoFilter, setRawVideoFilter] = useUrlState("vid", "all", serializers.string);
  const [rawRealmID, setRawRealmID] = useUrlState("realm", "", serializers.string);

  const category = parseCategoryFilter(rawCategory);
  const videoFilter = parseVideoFilter(rawVideoFilter);
  const realmID = parseRealmFilter(rawRealmID);

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

    // Include selected instances so URL-provided values remain visible in the picker.
    const uniqueNames = new Set<string>([...baseNames, ...stableSelectedInstances]);
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
    if (selectedInstancesValid.length > 0) {
      if (category === "all") {
        return selectedInstancesValid;
      }

      const categorySet = new Set(categoryInstanceOptions);
      return selectedInstancesValid.filter((name) => categorySet.has(name));
    }

    if (category === "all") {
      return [];
    }

    return categoryInstanceOptions;
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

    if (rawRealmID !== realmID) {
      setRawRealmID(realmID);
      return;
    }

    setHasMore(false);
    fetchInstances();
  }, [
    category,
    fetchInstances,
    rawCategory,
    rawRealmID,
    rawVideoFilter,
    realmID,
    setRawCategory,
    setRawRealmID,
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
            Recent Raids
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
            onChange={(event) => setRawRealmID(event.target.value)}
          >
            <option value="">All</option>
            {REALM_OPTIONS.map((realm) => (
              <option key={realm.id} value={realm.id}>
                {realm.name}
              </option>
            ))}
          </select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Instances ({selectedInstancesValid.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Select Instances</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSelectedInstances([])}>
                Clear selection
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {categoryInstanceOptions.length === 0 && (
                <DropdownMenuItem disabled>
                  No instances available
                </DropdownMenuItem>
              )}
              {categoryInstanceOptions.map((name) => (
                <DropdownMenuCheckboxItem
                  key={name}
                  checked={selectedInstancesValid.includes(name)}
                  onCheckedChange={() => toggleInstance(name)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
