import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, Database, ExternalLink, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { ICON_CDN } from "@/config/iconUrl";
import {
  fetchMiniatureManifest,
  miniatureAssetUrl,
  miniatureManifestUrl,
  type MiniatureManifest,
} from "@/pages/Instance/EventsPanels/Map/bossMinis";
import { GalleryPagination } from "./GalleryPagination";
import { galleryPage } from "./galleryPage";
import { MiniaturePreview } from "./MiniaturePreview";

type Miniature = MiniatureManifest["miniatures"][number];
const EMPTY_MINIATURES: Miniature[] = [];

function MiniatureCard({ miniature }: { miniature: Miniature }) {
  const url = miniatureAssetUrl(miniature.path);
  return (
    <Card className="group gap-0 overflow-hidden border-amber-950/45 bg-[#171611] py-0 shadow-[0_20px_45px_-34px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 hover:border-amber-700/55">
      <div className="relative border-b border-amber-950/45">
        <MiniaturePreview name={miniature.name} url={url} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_44%,rgba(255,236,187,0.08)_50%,transparent_56%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="absolute left-3 top-3 rounded border border-amber-100/10 bg-black/65 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-100/55 backdrop-blur-sm">
          glTF binary
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-base font-semibold tracking-wide text-amber-50">
              {miniature.name}
            </h2>
            <p className="mt-1 truncate font-mono text-[10px] text-amber-200/45" title={miniature.path}>
              {miniature.path}
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 rounded-md border border-amber-100/10 bg-black/25 p-1.5 text-amber-100/45 transition hover:border-amber-500/30 hover:text-amber-100"
            aria-label={`Open ${miniature.name} model file`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {miniature.entry_ids.map((entry) => (
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const manifestQuery = useQuery({
    queryKey: ["unit-miniature-manifest"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchMiniatureManifest(),
  });
  const miniatures = manifestQuery.data?.miniatures ?? EMPTY_MINIATURES;
  const entryCount = useMemo(
    () => miniatures.reduce((total, miniature) => total + miniature.entry_ids.length, 0),
    [miniatures],
  );
  const filteredMiniatures = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return miniatures;
    return miniatures.filter((miniature) =>
      miniature.name.toLowerCase().includes(query)
      || miniature.path.toLowerCase().includes(query)
      || miniature.entry_ids.some((entry) => String(entry).includes(query)),
    );
  }, [miniatures, search]);
  const visibleMiniatures = useMemo(() => galleryPage(filteredMiniatures, page), [filteredMiniatures, page]);

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
                <h1 className="font-serif text-2xl font-semibold tracking-wide">Miniature Registry</h1>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Every published unit miniature available to the 3D Replay Map, loaded directly from the shared manifest.
              </p>
            </div>

            {manifestQuery.data && (
              <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100/55">
                <span className="rounded-md border border-amber-950/55 bg-black/20 px-3 py-2">
                  {miniatures.length} models
                </span>
                <span className="rounded-md border border-amber-950/55 bg-black/20 px-3 py-2">
                  {entryCount} NPC entries
                </span>
              </div>
            )}
          </div>

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
            <a
              href={miniatureManifestUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background/55 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:border-amber-800/50 hover:text-foreground"
            >
              <Database className="h-3.5 w-3.5" />
              manifest.json
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <p className="mt-2 break-all font-mono text-[9px] text-muted-foreground/60">
            Source: {miniatureManifestUrl(ICON_CDN)}
          </p>
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
            <h2 className="font-medium text-destructive">Miniature registry unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {manifestQuery.error instanceof Error ? manifestQuery.error.message : "Unable to load the miniature manifest."}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{miniatureManifestUrl()}</p>
          </Card>
        )}

        {manifestQuery.data && filteredMiniatures.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No miniatures match “{search}”.
          </Card>
        )}

        {filteredMiniatures.length > 0 && (
          <>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {visibleMiniatures.start}–{visibleMiniatures.end} of {filteredMiniatures.length} matching miniatures
                {filteredMiniatures.length !== miniatures.length ? ` (${miniatures.length} total)` : ""}. Previews load as they approach the viewport.
              </p>
              <GalleryPagination
                page={visibleMiniatures.page}
                totalPages={visibleMiniatures.totalPages}
                onPageChange={setPage}
              />
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleMiniatures.items.map((miniature) => (
                <MiniatureCard key={miniature.path} miniature={miniature} />
              ))}
            </div>
            <div className="mt-5">
              <GalleryPagination
                page={visibleMiniatures.page}
                totalPages={visibleMiniatures.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
