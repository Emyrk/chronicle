import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, Database, ExternalLink, Images, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { ICON_CDN } from "@/config/iconUrl";
import {
  fetchUnitImageManifest,
  unitImageAssetUrl,
  unitImageManifestUrl,
  type UnitImageSet,
} from "@/config/unitImages";
import {
  fetchMiniatureManifest,
  miniatureAssetUrl,
  miniatureManifestUrl,
} from "@/pages/Instance/EventsPanels/Map/bossMinis";
import { GalleryPagination } from "./GalleryPagination";
import { galleryPage } from "./galleryPage";
import { MiniaturePreview } from "./MiniaturePreview";
import { filterRegistryModels, registryModels, type ModelRegistryTab, type RegistryModel } from "./modelRegistry";

const TAB_DETAILS: Record<ModelRegistryTab, { shortLabel: string; description: string; badge: string }> = {
  miniatures: {
    shortLabel: "Miniatures",
    description: "Stylized tabletop figures optimized for the 3D Replay Map.",
    badge: "tabletop miniature",
  },
  game_models: {
    shortLabel: "Game Models",
    description: "Animated GLBs extracted from the original game files with their creature skins.",
    badge: "original game model",
  },
};

function matchingImageSets(model: RegistryModel, imageSetsByEntry: ReadonlyMap<number, UnitImageSet>): UnitImageSet[] {
  return Array.from(new Map(model.entry_ids.flatMap((entry) => {
    const imageSet = imageSetsByEntry.get(entry);
    return imageSet === undefined ? [] : [[imageSet.name, imageSet] as const];
  })).values());
}

function ModelCard({ model, imageSets, tab }: { model: RegistryModel; imageSets: UnitImageSet[]; tab: ModelRegistryTab }) {
  const url = miniatureAssetUrl(model.path);
  const details = TAB_DETAILS[tab];
  const registeredImages = imageSets.flatMap((imageSet) => Object.entries(imageSet.images).map(([label, path]) => ({
    key: `${imageSet.name}:${label}`,
    label,
    path,
  })));
  return (
    <Card className="group gap-0 overflow-hidden border-amber-950/45 bg-[#171611] py-0 shadow-[0_20px_45px_-34px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 hover:border-amber-700/55">
      <div className="relative border-b border-amber-950/45">
        <MiniaturePreview name={model.name} url={url} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_44%,rgba(255,236,187,0.08)_50%,transparent_56%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="absolute left-3 top-3 rounded border border-amber-100/10 bg-black/65 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-100/55 backdrop-blur-sm">
          {details.badge}
        </span>
      </div>
      {registeredImages.length > 0 && (
        <div className="border-b border-amber-950/45 bg-[linear-gradient(180deg,rgba(52,35,20,0.46),rgba(16,14,12,0.72))] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-100/55">
              <Images className="h-3 w-3" />
              Registered images
            </span>
            <span className="font-mono text-[9px] text-amber-100/35">{registeredImages.length} variants</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {registeredImages.map(({ key, label, path }) => (
              <a
                key={key}
                href={unitImageAssetUrl(path)}
                target="_blank"
                rel="noreferrer"
                className="group/image relative aspect-square overflow-hidden rounded-md border border-amber-100/10 bg-[#0c0909] transition hover:border-amber-500/45"
                aria-label={`Open ${model.name} ${label} image`}
              >
                <img
                  src={unitImageAssetUrl(path)}
                  alt={`${model.name} ${label}`}
                  className="h-full w-full object-cover transition duration-300 group-hover/image:scale-[1.025]"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-1.5 pt-5 font-mono text-[9px] uppercase tracking-[0.13em] text-amber-50/80">
                  {label}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-base font-semibold tracking-wide text-amber-50">
              {model.name}
            </h2>
            <p className="mt-1 truncate font-mono text-[10px] text-amber-200/45" title={model.path}>
              {model.path}
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 rounded-md border border-amber-100/10 bg-black/25 p-1.5 text-amber-100/45 transition hover:border-amber-500/30 hover:text-amber-100"
            aria-label={`Open ${model.name} model file`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {model.entry_ids.map((entry) => (
            <code
              key={entry}
              className="rounded border border-white/7 bg-black/25 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              NPC {entry}
            </code>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function MiniaturesPage() {
  const [activeTab, setActiveTab] = useState<ModelRegistryTab>("miniatures");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const manifestQuery = useQuery({
    queryKey: ["unit-miniature-manifest"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchMiniatureManifest(),
  });
  const imageManifestQuery = useQuery({
    queryKey: ["unit-image-manifest"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchUnitImageManifest(),
  });
  const models = registryModels(manifestQuery.data, activeTab);
  const tabDetails = TAB_DETAILS[activeTab];
  const imageSetsByEntry = useMemo(() => new Map(
    imageManifestQuery.data?.units.flatMap((unit) => unit.entry_ids.map((entry) => [entry, unit] as const)) ?? [],
  ), [imageManifestQuery.data]);
  const registeredImageCount = useMemo(
    () => imageManifestQuery.data?.units.reduce((total, unit) => total + Object.keys(unit.images).length, 0) ?? 0,
    [imageManifestQuery.data],
  );
  const entryCount = useMemo(
    () => models.reduce((total, model) => total + model.entry_ids.length, 0),
    [models],
  );
  const filteredModels = useMemo(() => filterRegistryModels(models, search), [models, search]);
  const visibleModels = useMemo(() => galleryPage(filteredModels, page), [filteredModels, page]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,88,36,0.14),transparent_32%)]">
      <div className="container mx-auto max-w-[1600px] px-4 py-4">
        <Link
          to="/technical"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Technical
        </Link>

        <header className="mb-5 border-b border-amber-950/35 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-amber-100">
                <Box className="h-5 w-5" />
                <h1 className="font-serif text-2xl font-semibold tracking-wide">3D Model Registry</h1>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Browse the stylized replay miniatures and original animated models published in the shared manifest.
              </p>
            </div>

            {manifestQuery.data && (
              <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100/55">
                <span className="rounded-md border border-amber-950/55 bg-black/20 px-3 py-2">
                  {models.length} {tabDetails.shortLabel.toLowerCase()}
                </span>
                <span className="rounded-md border border-amber-950/55 bg-black/20 px-3 py-2">
                  {entryCount} NPC entries
                </span>
                {imageManifestQuery.data && (
                  <span className="rounded-md border border-amber-950/55 bg-black/20 px-3 py-2">
                    {registeredImageCount} registered images
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            className="mt-5 inline-flex w-full max-w-xl rounded-lg border border-amber-950/55 bg-black/25 p-1 shadow-inner shadow-black/30 sm:w-auto"
            role="tablist"
            aria-label="3D model type"
          >
            {(["miniatures", "game_models"] as const).map((tab) => {
              const details = TAB_DETAILS[tab];
              const count = registryModels(manifestQuery.data, tab).length;
              const selected = activeTab === tab;
              return (
                <button
                  key={tab}
                  id={`model-tab-${tab}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="model-registry-gallery"
                  onClick={() => {
                    setActiveTab(tab);
                    setPage(1);
                  }}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-left transition sm:min-w-56 ${
                    selected
                      ? "border border-amber-700/45 bg-[linear-gradient(180deg,rgba(112,76,30,0.6),rgba(55,35,18,0.72))] text-amber-50 shadow-[0_8px_24px_-16px_rgba(245,158,11,0.7)]"
                      : "border border-transparent text-muted-foreground hover:bg-amber-950/20 hover:text-amber-100"
                  }`}
                >
                  {tab === "miniatures" ? <Box className="h-4 w-4 shrink-0" /> : <Database className="h-4 w-4 shrink-0" />}
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.13em]">{details.shortLabel}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${selected ? "bg-black/30 text-amber-100/70" : "bg-white/5 text-muted-foreground/70"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{tabDetails.description}</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, path, or NPC entry…"
                className="h-10 w-full rounded-md border border-border bg-background/75 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-amber-700/70 focus:ring-2 focus:ring-amber-800/20"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <a
                href={miniatureManifestUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background/55 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:border-amber-800/50 hover:text-foreground"
              >
                <Database className="h-3.5 w-3.5" />
                models manifest
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={unitImageManifestUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background/55 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:border-amber-800/50 hover:text-foreground"
              >
                <Images className="h-3.5 w-3.5" />
                images manifest
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="mt-2 space-y-0.5 break-all font-mono text-[9px] text-muted-foreground/60">
            <p>Models: {miniatureManifestUrl(ICON_CDN)}</p>
            <p>Images: {unitImageManifestUrl(ICON_CDN)}</p>
          </div>
          {imageManifestQuery.isError && (
            <p className="mt-2 text-xs text-amber-300/70">
              Registered images are unavailable; 3D models can still be browsed normally.
            </p>
          )}
        </header>

        {manifestQuery.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="aspect-[4/3] animate-pulse rounded-xl border border-border bg-muted/20" />
            ))}
          </div>
        )}

        {manifestQuery.isError && (
          <Card className="p-6">
            <h2 className="font-medium text-destructive">3D model registry unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {manifestQuery.error instanceof Error ? manifestQuery.error.message : "Unable to load the 3D model manifest."}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{miniatureManifestUrl()}</p>
          </Card>
        )}

        {manifestQuery.data && filteredModels.length === 0 && (
          <Card
            id="model-registry-gallery"
            role="tabpanel"
            aria-labelledby={`model-tab-${activeTab}`}
            className="p-8 text-center text-sm text-muted-foreground"
          >
            {search ? `No ${tabDetails.shortLabel.toLowerCase()} match “${search}”.` : `No ${tabDetails.shortLabel.toLowerCase()} have been published yet.`}
          </Card>
        )}

        {filteredModels.length > 0 && (
          <section id="model-registry-gallery" role="tabpanel" aria-labelledby={`model-tab-${activeTab}`}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {visibleModels.start}–{visibleModels.end} of {filteredModels.length} matching {tabDetails.shortLabel.toLowerCase()}
                {filteredModels.length !== models.length ? ` (${models.length} total)` : ""}. Previews load as they approach the viewport.
              </p>
              <GalleryPagination
                page={visibleModels.page}
                totalPages={visibleModels.totalPages}
                onPageChange={setPage}
              />
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleModels.items.map((model) => (
                <ModelCard
                  key={model.path}
                  model={model}
                  tab={activeTab}
                  imageSets={matchingImageSets(model, imageSetsByEntry)}
                />
              ))}
            </div>
            <div className="mt-5">
              <GalleryPagination
                page={visibleModels.page}
                totalPages={visibleModels.totalPages}
                onPageChange={setPage}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
