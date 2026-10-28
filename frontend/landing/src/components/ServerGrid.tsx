import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Upload, X } from "lucide-react";
import { trackedTenantUrl } from "../trackedLinks";
import type { ServerEntry } from "../types";
import { ServerCard } from "./ServerCard";

/** Sort servers: sponsored first, then by unique player count (14d) descending. */
function sortServers(servers: ServerEntry[]): ServerEntry[] {
  return [...servers].sort((a, b) => {
    if (a.sponsored && !b.sponsored) return -1;
    if (!a.sponsored && b.sponsored) return 1;
    return (b.uniquePlayers14d ?? 0) - (a.uniquePlayers14d ?? 0);
  });
}

// --- Fuzzy search ---

/** Returns the edit distance, stopping once the requested limit is exceeded. */
function editDistanceWithin(value: string, query: string, limit: number): number | null {
  if (Math.abs(value.length - query.length) > limit) return null;

  let previous = Array.from({ length: query.length + 1 }, (_, index) => index);
  for (let valueIndex = 1; valueIndex <= value.length; valueIndex += 1) {
    const current = [valueIndex];
    let rowMinimum = current[0];

    for (let queryIndex = 1; queryIndex <= query.length; queryIndex += 1) {
      const substitutionCost = value[valueIndex - 1] === query[queryIndex - 1] ? 0 : 1;
      const distance = Math.min(
        previous[queryIndex] + 1,
        current[queryIndex - 1] + 1,
        previous[queryIndex - 1] + substitutionCost,
      );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > limit) return null;
    previous = current;
  }

  return previous[query.length] <= limit ? previous[query.length] : null;
}

/** Scores exact substrings first, then allows small typos in individual words. */
function fuzzyScore(value: string, query: string): number | null {
  const target = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase().trim();
  if (!needle) return 0;

  const exactIndex = target.indexOf(needle);
  if (exactIndex !== -1) {
    return 10_000 - exactIndex * 10 - (target.length - needle.length);
  }

  if (needle.length < 4) return null;
  const typoLimit = needle.length >= 7 ? 2 : 1;
  const words = target.split(/[^a-z0-9]+/).filter(Boolean);
  let bestDistance: number | null = null;

  for (const word of words) {
    const distance = editDistanceWithin(word, needle, typoLimit);
    if (distance !== null && (bestDistance === null || distance < bestDistance)) {
      bestDistance = distance;
    }
  }

  return bestDistance === null ? null : 1_000 - bestDistance * 100;
}

function serverSearchScore(server: ServerEntry, query: string): number | null {
  const fields = [
    { value: server.name, weight: 1_000 },
    { value: server.id, weight: 750 },
    { value: server.tagline, weight: 300 },
    { value: server.description, weight: 0 },
    { value: server.expansion, weight: 200 },
    { value: server.client, weight: 200 },
    { value: server.logging, weight: 100 },
    { value: server.engine, weight: 100 },
    ...(server.hostedByChronicle
      ? [{ value: "hosted by chronicle", weight: 100 }]
      : []),
    ...(server.status ?? []).map((value) => ({ value, weight: 100 })),
  ];

  let totalScore = 0;
  for (const term of query.trim().split(/\s+/)) {
    let bestTermScore: number | null = null;
    for (const field of fields) {
      const score = fuzzyScore(field.value, term);
      if (score === null) continue;
      const weightedScore = score + field.weight;
      if (bestTermScore === null || weightedScore > bestTermScore) {
        bestTermScore = weightedScore;
      }
    }
    if (bestTermScore === null) return null;
    totalScore += bestTermScore;
  }

  return totalScore;
}

// --- Grid ---

export function ServerGrid({ servers, loading }: { servers: ServerEntry[]; loading?: boolean }) {
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    const sorted = sortServers(servers);
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return sorted.map((server) => ({ server, matches: true, score: 0 }));
    }

    return sorted
      .map((server) => {
        const score = serverSearchScore(server, normalizedQuery);
        return { server, matches: score !== null, score: score ?? 0 };
      })
      .sort((a, b) => {
        if (a.matches !== b.matches) return a.matches ? -1 : 1;
        if (a.matches && b.matches && a.score !== b.score) return b.score - a.score;
        return 0;
      });
  }, [servers, query]);

  return (
    <section id="supported-servers" className="relative mx-auto w-full max-w-6xl scroll-mt-8 px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_58%)] opacity-40" />

      <header className="relative mb-10 text-center">
        <img
          src="/chronicle-logo.svg"
          alt="Chronicle"
          className="mx-auto h-20 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.55)] sm:h-28"
        />
        <h1 className="mt-5 font-wow text-2xl font-bold tracking-tight sm:text-4xl">
          Combat Log Analysis for <span className="text-primary">Classic WoW</span>
        </h1>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-muted-foreground">
          <a
            href="https://github.com/Emyrk/chronicle"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a href="/self-hosting/" className="transition-colors hover:text-foreground">
            Ask Chronicle about your server →
          </a>
        </div>
      </header>

      <article className="relative mb-12 overflow-hidden rounded-xl border border-primary/60 bg-card shadow-2xl shadow-black/20">
        <div className="absolute left-5 top-5 z-20 rounded-md bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
          New · Now supported
        </div>
        <div className="grid min-h-[23rem] md:grid-cols-[1.25fr_1fr]">
          <div className="relative min-h-64 overflow-hidden border-b border-border md:min-h-full md:border-b-0 md:border-r">
            <img
              src="/forever/wow-forever-hero.jpg"
              alt="WoW Forever key art"
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/75 via-transparent to-black/20 md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-card/25" />
          </div>
          <div className="flex flex-col justify-center px-6 py-9 sm:px-10 md:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <img
                src="https://icons.chronicleclassic.com/servers/forever/logo_sq.avif"
                alt="WoW Forever logo"
                className="h-12 w-12 rounded-lg object-contain shadow-md"
              />
              <div>
                <h2 className="font-wow text-3xl font-bold text-foreground">WoW Forever</h2>
                <p className="mt-1 text-sm text-muted-foreground">Hosted by Chronicle</p>
              </div>
            </div>
            <p className="mt-6 text-base leading-7 text-muted-foreground">
              Upload your WoW Forever logs today. Chronicle turns every pull into detailed damage, healing, death, and raid-performance analysis.
            </p>
            <div className="mt-7 flex flex-col gap-3 lg:flex-row">
              <a
                href={trackedTenantUrl(
                  "https://forever.chronicleclassic.com/",
                  "featured_server_logs",
                )}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                View WoW Forever logs
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </a>
              <a
                href={trackedTenantUrl(
                  "https://forever.chronicleclassic.com/upload",
                  "featured_server_upload",
                )}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-foreground/30 hover:bg-muted"
              >
                <Upload aria-hidden="true" className="h-4 w-4" />
                Upload a log
              </a>
            </div>
          </div>
        </div>
      </article>

      <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-wow text-2xl font-bold text-foreground">All supported servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find your server or bring Chronicle to your community.</p>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search servers, expansions, or features…"
            aria-label="Search servers"
            className="w-full rounded-lg border border-border bg-card/80 py-3 pl-10 pr-10 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid — non-matching cards are greyed out instead of hidden */}
      <div className="relative grid auto-rows-[1fr] gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {loading && servers.length === 0 && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card animate-pulse">
                <div className="h-28 bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-muted" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-32 rounded bg-muted" />
                      <div className="h-3 w-48 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                </div>
              </div>
            ))}
          </>
        )}
        {searchResults
          .filter(({ server }) => server.id !== "forever")
          .map(({ server, matches }) => {
            const dimmed = query.trim() !== "" && !matches;
            return (
              <div
                key={server.id}
                className={`flex transition-all duration-200 ${dimmed ? "opacity-30 grayscale" : "opacity-100 grayscale-0"}`}
              >
                <ServerCard server={server} />
              </div>
            );
          })}
      </div>

    </section>
  );
}
