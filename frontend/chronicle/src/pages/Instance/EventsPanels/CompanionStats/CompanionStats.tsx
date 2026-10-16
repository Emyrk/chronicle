/**
 * CompanionStats panel — Displays addon relay health as a bar chart.
 *
 * Shows the 10 per-minute buckets of landed message chunks from the
 * ChronicleCompanionWoTLK addon. Fetches and decodes the companion_stats
 * stream directly (self-managed aggregation, no worker).
 */

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { companionStatsProcessor, type CompanionStatsResult } from "./companionStats.processor";
import { useInstanceEventsContext } from "@/hooks/instanceEvents/InstanceEventsContext";
import { createStreamCursor } from "@/api/protodecode/decode";
import { CompanionStatsSchema } from "@/api/proto/chronicle_pb";

/** A single decoded CompanionStats snapshot. */
interface StatsSnapshot {
  /** Absolute timestamp (ms since epoch) of this snapshot. */
  timestampMs: number;
  dirty: number;
  buckets: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCompanionStatsPanel(): PanelDefinition<CompanionStatsResult, any> {
  return {
    ...companionStatsProcessor,
    label: "Addon Relay Stats",
    icon: <Radio className="h-4 w-4" />,
    keybinds: [],
    selfManagesAggregation: true,
    supportsPerSecond: false,

    render: (props: PanelRenderProps<CompanionStatsResult>) => {
      return <CompanionStatsContent {...props} />;
    },
  };
}

function CompanionStatsContent({ context }: PanelRenderProps<CompanionStatsResult>) {
  const eventsCtx = useInstanceEventsContext();
  const [snapshots, setSnapshots] = useState<StatsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const cached = await eventsCtx.fetchStream("companion_stats");
        if (cancelled || !cached) {
          setSnapshots([]);
          setLoading(false);
          return;
        }

        const cursor = createStreamCursor(CompanionStatsSchema, cached.data);
        const results: StatsSnapshot[] = [];

        // StreamCursor: peek()/advance() to read, nextEncounter() to move between encounters.
        // The first encounter is loaded by the constructor, so enter the read loop directly.
        do {
          const header = cursor.currentHeader;
          const encounterStartMs = header ? header.firstTimestamp.getTime() : 0;

          while (cursor.hasMoreInEncounter) {
            const peeked = cursor.peek();
            if (!peeked) break;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const m = peeked.message as any;
            const offsetMs = Number(m.meta?.offsetMilli ?? 0);
            results.push({
              timestampMs: encounterStartMs + offsetMs,
              dirty: Number(m.dirty ?? 0),
              buckets: Array.isArray(m.buckets) ? m.buckets.map(Number) : [],
            });
            cursor.advance();
          }
        } while (cursor.nextEncounter());

        if (!cancelled) {
          setSnapshots(results);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [eventsCtx, context.instance.id]);

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground text-sm">Loading addon stats…</div>;
  }
  if (error) {
    return <div className="text-center py-4 text-destructive text-sm">Error: {error}</div>;
  }
  if (snapshots.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No companion addon stats available.
        <br />
        <span className="text-xs">The ChronicleCompanionWoTLK addon emits relay stats every 5 minutes.</span>
      </div>
    );
  }

  return <SnapshotBrowser snapshots={snapshots} />;
}

/** Format a timestamp as HH:MM:SS. */
function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Browse individual snapshots with Previous / Next navigation. */
function SnapshotBrowser({ snapshots }: { snapshots: StatsSnapshot[] }) {
  const [idx, setIdx] = useState(snapshots.length - 1);
  const snap = snapshots[idx];
  const buckets = snap.buckets.length > 0 ? snap.buckets : [];
  const total = buckets.reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...buckets, 1);

  // Labels: bucket[0] = "now", bucket[1] = "1m ago", etc.
  const labels = buckets.map((_, i) => (i === 0 ? "now" : `${i}m`));

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Header: nav + stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {snapshots.length > 1 && (
            <>
              <button
                className="px-1.5 py-0.5 rounded border border-border text-[11px] hover:bg-muted disabled:opacity-30"
                disabled={idx === 0}
                onClick={() => setIdx((i) => i - 1)}
              >
                ← Prev
              </button>
              <button
                className="px-1.5 py-0.5 rounded border border-border text-[11px] hover:bg-muted disabled:opacity-30"
                disabled={idx === snapshots.length - 1}
                onClick={() => setIdx((i) => i + 1)}
              >
                Next →
              </button>
            </>
          )}
          <span className="font-mono">
            Snapshot {idx + 1}/{snapshots.length}
          </span>
          {snap.timestampMs > 0 && (
            <span className="text-muted-foreground">{formatTime(snap.timestampMs)}</span>
          )}
        </div>
        <div className="flex gap-3 font-mono">
          <span>{total} landed</span>
          <span className={snap.dirty > 0 ? "text-yellow-500" : ""}>{snap.dirty} pending</span>
        </div>
      </div>

      {/* Bar chart for this snapshot's buckets */}
      {buckets.length > 0 ? (
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {buckets.map((val, i) => {
            const barH = maxVal > 0 ? (val / maxVal) * 90 : 0; // max 90px for bars, leave room for labels
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ height: "100%", justifyContent: "flex-end" }}>
                <span className="text-[10px] text-muted-foreground font-mono">{val}</span>
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: Math.max(barH, 2),
                    backgroundColor: val > 0 ? "var(--color-chart-1)" : "var(--color-muted)",
                    opacity: val > 0 ? 1 : 0.3,
                  }}
                />
                <span className="text-[9px] text-muted-foreground">{labels[i]}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground text-sm">No buckets in this snapshot.</div>
      )}
    </div>
  );
}
