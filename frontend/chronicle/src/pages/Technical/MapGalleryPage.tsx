import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, Image, Map, Maximize2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useDatasets } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { placeableDungeonMesh } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";
import { mapDebugOverlays } from "@/pages/Instance/EventsPanels/Map/mapDebugOverlays";
import {
  mapAssetUrl,
  mapFloorMesh,
  mapGalleryItems,
  mapManifestUrl,
  overlayTilePlacement,
  tilePlacement,
  type MapGalleryItem,
  type WowMapMeshInstance,
} from "./mapGallery";
import { GalleryPagination } from "./GalleryPagination";
import { galleryPage } from "./galleryPage";
import { fetchMapManifest } from "./mapManifest";

const MapGallery3D = lazy(() => import("./MapGallery3D"));

// A mesh-only instance has no image; its card and modal show the mesh's
// world extent in yards (width along world Y, height along world X, as the
// Replay Map lays the ground out).
function meshExtent(mesh: WowMapMeshInstance): { width: number; height: number } {
  return { width: Math.round(mesh.bounds.maxY - mesh.bounds.minY), height: Math.round(mesh.bounds.maxX - mesh.bounds.minX) };
}

function galleryCanvasSize(item: MapGalleryItem): { width: number; height: number } {
  return item.kind === "zone" ? item.layer : item.kind === "instance" ? item.floor : item.kind === "mesh" ? meshExtent(item.mesh) : item.kind === "renders" ? item.render : item.rendered;
}

function galleryItemMesh(item: MapGalleryItem): WowMapMeshInstance | undefined {
  if (item.kind === "zone") return undefined;
  if (item.kind === "mesh") return item.mesh;
  if (item.kind === "styled") return item.instance.mesh;
  return mapFloorMesh(item.instance, item.floor);
}

function useMapManifest(iconBaseUrl: string | undefined) {
  return useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMapManifest(iconBaseUrl!),
  });
}

function MapArtwork({ item, iconBaseUrl }: { item: MapGalleryItem; iconBaseUrl: string }) {
  const name = item.kind === "zone" ? item.map.name : item.instance.name;
  if (item.kind === "mesh") {
    const extent = meshExtent(item.mesh);
    return (
      <div
        className="relative flex w-full items-center justify-center overflow-hidden bg-[#11100d]"
        style={{ aspectRatio: `${extent.width} / ${extent.height}` }}
        role="img"
        aria-label={`${name} 3D mesh only, no map artwork`}
      >
        <div className="px-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/45">
          <div>No map artwork · 3D mesh only</div>
          <div className="mt-1 normal-case tracking-normal text-muted-foreground">{item.mesh.path}</div>
        </div>
      </div>
    );
  }
  if (item.kind === "renders" || item.kind === "styled") {
    const image = item.kind === "renders" ? item.render : item.rendered;
    return (
      <div
        className="relative w-full overflow-hidden bg-[#11100d]"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        role="img"
        aria-label={`${name} ${item.kind === "styled" ? "stylized" : "rendered"} map`}
      >
        <img
          src={mapAssetUrl(iconBaseUrl, image.path)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full select-none object-contain"
        />
      </div>
    );
  }

  const canvas = item.kind === "zone" ? item.layer : item.floor;
  return (
    <div
      className="relative w-full overflow-hidden bg-[#11100d]"
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
      role="img"
      aria-label={`${name} map artwork`}
    >
      {canvas.tiles.map((tile) => (
        <img
          key={`base-${tile.row}-${tile.column}-${tile.fileDataID}`}
          src={mapAssetUrl(iconBaseUrl, tile.path)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute max-w-none select-none"
          style={tilePlacement(canvas, tile)}
        />
      ))}
      {item.kind === "zone" && item.art.overlays?.flatMap((overlay) =>
        overlay.tiles.map((tile) => (
          <img
            key={`overlay-${overlay.id}-${tile.row}-${tile.column}-${tile.fileDataID}`}
            src={mapAssetUrl(iconBaseUrl, tile.path)}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute max-w-none select-none"
            style={overlayTilePlacement(item.layer, overlay, tile)}
          />
        )),
      )}
    </div>
  );
}

function MapCard({
  item,
  iconBaseUrl,
  onSelect,
}: {
  item: MapGalleryItem;
  iconBaseUrl: string;
  onSelect: (item: MapGalleryItem) => void;
}) {
  const assignment = item.kind === "zone" ? item.map.assignments?.[0] : undefined;
  const name = item.kind === "zone" ? (item.map.name || `Map ${item.map.id}`) : item.instance.name;
  const canvas = galleryCanvasSize(item);

  return (
    <Card className="group relative gap-0 overflow-hidden border-amber-950/40 bg-[#171611] py-0 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.9)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-800/50">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="absolute inset-0 z-10 cursor-zoom-in rounded-xl outline-none ring-amber-500/70 transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#11100d]"
        aria-label={`Open ${name} map`}
      />
      <div className="relative border-b border-amber-950/40 bg-black/30 p-2">
        <div className="overflow-hidden rounded-md border border-white/5 bg-black shadow-inner">
          <MapArtwork item={item} iconBaseUrl={iconBaseUrl} />
        </div>
        <div className="pointer-events-none absolute inset-2 rounded-md bg-[linear-gradient(115deg,transparent_45%,rgba(255,235,180,0.08)_50%,transparent_55%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="pointer-events-none absolute right-4 top-4 rounded-md border border-amber-100/15 bg-black/65 p-1.5 text-amber-50/80 opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-sm font-semibold tracking-wide text-amber-50">
            {name}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/45">
            {item.kind === "zone"
              ? `UI map ${item.map.id}`
              : `${item.instance.instanceType === 2 ? "Raid" : "Dungeon"} · world ${item.instance.mapID}`}
            {item.kind === "styled" ? ` · ${item.rendered.source}` : item.kind === "renders" ? " · manual render" : ""}
            {assignment ? ` · world ${assignment.mapID}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right font-mono text-[9px] uppercase leading-4 tracking-wider text-muted-foreground">
          <div>{canvas.width}×{canvas.height}{item.kind === "mesh" ? " yd" : ""}</div>
          {item.kind === "mesh" && <div>3D mesh only</div>}
          {placeableDungeonMesh(galleryItemMesh(item)) && <div className="text-amber-300/65">3D available</div>}
          {item.kind === "zone" && (item.art.phaseID !== 0 || item.layer.index !== 0) && (
            <div>phase {item.art.phaseID} · layer {item.layer.index}</div>
          )}
          {item.kind === "instance" && <div>art floor {item.floor.floor}</div>}
          {(item.kind === "renders" || item.kind === "mesh") && item.floor && <div>floor {item.floor.floor}</div>}
          {item.kind === "renders" && <div>{item.render.bounds ? "calibrated" : "uncalibrated"} render</div>}
          {item.kind === "styled" && <div>stylized art</div>}
        </div>
      </div>
    </Card>
  );
}

function MapModal({
  item,
  iconBaseUrl,
  onOpenChange,
}: {
  item: MapGalleryItem | null;
  iconBaseUrl: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<"art" | "3d">(() => item?.kind === "mesh" ? "3d" : "art");

  if (!item || !iconBaseUrl) return null;

  const instance = item.kind === "zone" ? null : item.instance;
  const mesh = placeableDungeonMesh(galleryItemMesh(item));
  const debugOverlays = instance ? mapDebugOverlays(instance.mapID) : [];
  const name = item.kind === "zone" ? (item.map.name || `Map ${item.map.id}`) : item.instance.name;
  const canvas = galleryCanvasSize(item);
  const description = item.kind === "zone"
    ? `UI map ${item.map.id}${item.art.phaseID !== 0 || item.layer.index !== 0 ? `, phase ${item.art.phaseID}, layer ${item.layer.index}` : ""}`
    : item.kind === "instance"
      ? `${item.instance.instanceType === 2 ? "Raid" : "Dungeon"}, world ${item.instance.mapID}, art floor ${item.floor.floor}`
      : item.kind === "mesh"
        ? `Dungeon, world ${item.instance.mapID}${item.floor ? `, floor ${item.floor.floor}` : ""}, no map artwork, 3D mesh only (${item.mesh.path})`
        : `${item.instance.instanceType === 2 ? "Raid" : "Dungeon"}, world ${item.instance.mapID}${item.kind === "renders" && item.floor ? `, floor ${item.floor.floor}` : ""}, ${item.kind === "styled" ? "stylized render" : `manual render (${item.render.bounds ? "calibrated" : "uncalibrated"})`}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-[min(96vw,1600px)] gap-0 overflow-hidden border-amber-900/50 bg-[#11100d] p-0 shadow-2xl">
        <DialogHeader className="border-b border-amber-950/50 bg-[#171611] px-5 py-4 pr-12">
          <DialogTitle className="font-serif text-xl tracking-wide text-amber-50">{name}</DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/50">
            {description} · {canvas.width}×{canvas.height}{item.kind === "mesh" ? " yd" : ""}
          </DialogDescription>
          {mesh && (
            <div className="mt-2 flex w-fit rounded-md border border-amber-900/50 bg-black/30 p-0.5" role="group" aria-label="Map render mode">
              {item.kind !== "mesh" && (
                <button
                  type="button"
                  onClick={() => setViewMode("art")}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${viewMode === "art" ? "bg-amber-200/15 text-amber-50" : "text-muted-foreground hover:text-amber-100"}`}
                >
                  <Image className="h-3.5 w-3.5" /> Artwork
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${viewMode === "3d" ? "bg-amber-200/15 text-amber-50" : "text-muted-foreground hover:text-amber-100"}`}
              >
                <Box className="h-3.5 w-3.5" /> 3D mesh
                {debugOverlays.length > 0 && <span className="text-[9px] uppercase tracking-wider text-orange-300/70">+ debug</span>}
              </button>
            </div>
          )}
        </DialogHeader>
        <div className="styled-scrollbar max-h-[calc(94vh-5rem)] overflow-auto bg-black/70 p-2 sm:p-4">
          <div className="mx-auto overflow-hidden rounded-md border border-white/10 bg-black shadow-2xl">
            {viewMode === "3d" && mesh && instance ? (
              <Suspense fallback={<div className="flex h-[min(72vh,900px)] min-h-[420px] items-center justify-center font-mono text-xs uppercase tracking-widest text-amber-100/50">Loading 3D renderer…</div>}>
                <MapGallery3D key={item.key} mesh={mesh} iconBaseUrl={iconBaseUrl} overlays={debugOverlays} />
              </Suspense>
            ) : (
              <MapArtwork item={item} iconBaseUrl={iconBaseUrl} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MapGalleryPage() {
  const tenantIconBaseUrl = useIconBaseUrl();
  const { data: datasets } = useDatasets();
  const [datasetOverride, setDatasetOverride] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedMap, setSelectedMap] = useState<MapGalleryItem | null>(null);
  const selectedDataset = datasets?.find((dataset) => dataset.id === datasetOverride);
  const iconBaseUrl = datasetOverride ? selectedDataset?.icon_base_url : tenantIconBaseUrl;
  const manifestQuery = useMapManifest(iconBaseUrl);

  const items = useMemo(
    () => manifestQuery.data ? mapGalleryItems(manifestQuery.data) : [],
    [manifestQuery.data],
  );
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      if (item.kind !== "zone") {
        return item.instance.name.toLowerCase().includes(query)
          || String(item.instance.mapID).includes(query)
          || item.instance.directory.toLowerCase().includes(query);
      }
      return item.map.name.toLowerCase().includes(query)
        || String(item.map.id).includes(query)
        || item.map.assignments?.some((assignment) => String(assignment.mapID).includes(query));
    });
  }, [items, search]);
  const visibleItems = useMemo(() => galleryPage(filteredItems, page), [filteredItems, page]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,88,36,0.12),transparent_35%)]">
      <div className="container mx-auto max-w-[1600px] px-4 py-4">
        <Link
          to="/technical"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Technical
        </Link>

        <div className="mb-5 overflow-hidden rounded-xl border border-amber-950/40 bg-[#171611]/95 shadow-xl">
          <div className="relative px-5 py-5 sm:px-7">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(194,144,62,0.08),transparent_45%)]" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-amber-100">
                  <Map className="h-5 w-5" />
                  <h1 className="font-serif text-2xl font-semibold tracking-wide">Dataset Map Atlas</h1>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Map artwork and coordinate-faithful geometry published by the active dataset. These are the same assets Chronicle can use for position visualizations.
                </p>
                {manifestQuery.data && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/50">
                    {manifestQuery.data.target.product} · build {manifestQuery.data.target.build} · {items.length} map layers
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col xl:flex-row">
                {datasets && datasets.length > 0 && (
                  <label className="flex min-w-56 flex-col gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200/50">
                    Dataset
                    <select
                      value={datasetOverride}
                      onChange={(event) => {
                        setDatasetOverride(event.target.value);
                        setPage(1);
                        setSelectedMap(null);
                      }}
                      className="rounded-md border border-amber-950/60 bg-[#11100d] px-3 py-2 font-sans text-sm normal-case tracking-normal text-amber-50 outline-none [color-scheme:dark] transition-colors focus:border-amber-700/70"
                    >
                      <option value="" className="bg-[#11100d] text-amber-50">Tenant default</option>
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id} className="bg-[#11100d] text-amber-50">
                          {dataset.name} ({dataset.wow_version})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="relative block w-full self-end sm:w-80">
                  <span className="sr-only">Filter maps</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Filter by name or map ID…"
                    className="w-full rounded-md border border-amber-950/60 bg-black/25 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-amber-700/70"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {!iconBaseUrl && (
          <Card className="p-6 text-sm text-muted-foreground">
            The active dataset does not have an icon base URL configured, so its map manifest cannot be located.
          </Card>
        )}

        {iconBaseUrl && manifestQuery.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="aspect-[3/2] animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        )}

        {manifestQuery.isError && (
          <Card className="p-6">
            <h2 className="font-medium text-destructive">Map atlas unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {manifestQuery.error instanceof Error ? manifestQuery.error.message : "Unable to load the dataset map manifest."}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {iconBaseUrl ? mapManifestUrl(iconBaseUrl) : "No icon base URL configured"}
            </p>
          </Card>
        )}

        {manifestQuery.data && filteredItems.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No map artwork matches “{search}”.
          </Card>
        )}

        {iconBaseUrl && filteredItems.length > 0 && (
          <>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {visibleItems.start}–{visibleItems.end} of {filteredItems.length} matching map layers
                {filteredItems.length !== items.length ? ` (${items.length} total)` : ""}
              </p>
              <GalleryPagination
                page={visibleItems.page}
                totalPages={visibleItems.totalPages}
                onPageChange={setPage}
              />
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleItems.items.map((item) => (
                <MapCard
                  key={item.key}
                  item={item}
                  iconBaseUrl={iconBaseUrl}
                  onSelect={setSelectedMap}
                />
              ))}
            </div>
            <div className="mt-5">
              <GalleryPagination
                page={visibleItems.page}
                totalPages={visibleItems.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <MapModal
        key={selectedMap?.key ?? "closed"}
        item={selectedMap}
        iconBaseUrl={iconBaseUrl}
        onOpenChange={(open) => {
          if (!open) setSelectedMap(null);
        }}
      />
    </div>
  );
}
