import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ServerEntry } from "../types";
import { ServerCard } from "./ServerCard";
import { DiscordIcon } from "./DiscordIcon";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

function GetInTouchModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-foreground">
          Get in Touch via Discord
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          We'd love to help bring Chronicle to you. Reach out on our Discord
          and we'll get you set up.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Chronicle is open source and{" "}
          <a
            href="https://github.com/Emyrk/chronicle/blob/main/DEPLOYING.md"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            self-hosting is fully supported
          </a>
          {" "}— run it on your own infrastructure if you prefer.
        </p>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <DiscordIcon className="h-4 w-4" />
          Join the Chronicle Discord
        </a>
      </div>
    </div>
  );
}

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
  const [modalOpen, setModalOpen] = useState(false);

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
    <section className="relative mx-auto w-full max-w-6xl px-4 pt-8 pb-12 sm:px-6 sm:pt-12 lg:px-8">
      {/* Subtle radial gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_60%)] opacity-40 pointer-events-none" />

      {/* Hero header */}
      <div className="relative mb-6 text-center">
        <img
          src="chronicle-logo.svg"
          alt="Chronicle"
          className="mx-auto mb-4 h-28 sm:h-28"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />

        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
          Combat Log Analysis for{" "}
          <span className="text-primary">Classic WoW</span>
        </h1>
        <div className="mt-3 flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <a
            href="https://github.com/Emyrk/chronicle"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="transition-colors hover:text-foreground cursor-pointer"
          >
            Run Chronicle for your server →
          </button>
        </div>
      </div>

      {/* Separator */}
      <div className="relative mx-auto mb-6 h-px w-full max-w-xs bg-border/60" />

      {/* Search — matches rise to the top while the full directory remains visible */}
      <div className="relative mx-auto mb-6 max-w-xl">
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
        {searchResults.map(({ server, matches }) => {
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

      {modalOpen && <GetInTouchModal onClose={() => setModalOpen(false)} />}
    </section>
  );
}
