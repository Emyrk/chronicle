import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, CircleHelp, Loader2, X } from "lucide-react";
import type { InstanceSearchEvidence, InstanceSearchWitness } from "@/api/typesGenerated";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { enumLabel } from "./fieldLabels";
import { encodeQuery, type Node } from "./queryModel";
import { SearchError, explainRun, type SearchBudget } from "./searchApi";
import { describe, formatDuration, formatEvidence } from "./summary";

/**
 * Why one run matched: each condition with a check / cross, the run's actual
 * values (per boss for per-fight fields), and the players or pulls that
 * satisfied each player / pull condition. Loaded on demand from
 * POST /search/explain, which mirrors the query tree node for node.
 */
export function EvidencePanel({
  tree,
  instanceId,
  realmName,
  onBudget,
}: {
  tree: Node | undefined;
  instanceId: string;
  /** For armory links on player witnesses. */
  realmName: string;
  onBudget?: (budget: SearchBudget) => void;
}) {
  const explain = useQuery({
    queryKey: ["instance-search", "explain", encodeQuery(tree), instanceId],
    queryFn: async () => {
      const res = await explainRun({ where: tree }, instanceId);
      if (res.budget) onBudget?.(res.budget);
      return res;
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (!tree) return <p className="text-xs text-muted-foreground">This search has no conditions, so every run matches.</p>;
  if (explain.isLoading) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking why this run matched…
      </p>
    );
  }
  if (explain.error) {
    const err = explain.error instanceof SearchError ? explain.error : null;
    return <p className="text-xs text-red-300">{err?.message ?? "Could not explain this run."}</p>;
  }
  const ev = explain.data?.explanation.evidence;
  if (!ev) return null;
  // The top-level AND reads as a checklist; anything else is one item.
  const items: [Node, InstanceSearchEvidence][] =
    tree.and && ev.kind === "and" ? tree.and.map((n, i) => [n, ev.children?.[i] ?? missing]) : [[tree, ev]];
  return (
    <ul className="space-y-1.5">
      {items.map(([n, e], i) => (
        <EvidenceItem key={i} node={n} ev={e} realmName={realmName} />
      ))}
    </ul>
  );
}

const missing: InstanceSearchEvidence = { kind: "field", ok: null };

function StatusIcon({ ok }: { ok: boolean | null | undefined }) {
  if (ok === true) return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="matched" />;
  if (ok === false) return <X className="h-3.5 w-3.5 shrink-0 text-red-400/80" aria-label="did not match" />;
  return <CircleHelp className="h-3.5 w-3.5 shrink-0 text-amber-300/80" aria-label="unknown: the run has no value for this" />;
}

function EvidenceItem({ node, ev, realmName }: { node: Node; ev: InstanceSearchEvidence; realmName: string }) {
  const kids = node.and ?? node.or;
  if (kids) {
    return (
      <li>
        <Line ok={ev.ok}>
          <span className="text-muted-foreground">{node.or ? "Any of:" : "All of:"}</span>
        </Line>
        <ul className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-3">
          {kids.map((k, i) => (
            <EvidenceItem key={i} node={k} ev={ev.children?.[i] ?? missing} realmName={realmName} />
          ))}
        </ul>
      </li>
    );
  }
  if (node.not) {
    return (
      <li>
        <Line ok={ev.ok}>
          <span className="text-muted-foreground">None of:</span>
        </Line>
        <ul className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-3">
          <EvidenceItem node={node.not} ev={ev.children?.[0] ?? missing} realmName={realmName} />
        </ul>
      </li>
    );
  }
  const inner = node.any_player ?? node.any_encounter ?? node.count_players?.where ?? node.count_encounters?.where;
  if (node.any_player || node.any_encounter || node.count_players || node.count_encounters) {
    return <QuantifierItem node={node} inner={inner} ev={ev} realmName={realmName} />;
  }
  return (
    <li>
      <Line ok={ev.ok}>
        <span>{describe(node)}</span>
        <FieldValue field={node.field ?? ""} ev={ev} bosses={node.bosses} />
      </Line>
    </li>
  );
}

function Line({ ok, children }: { ok: boolean | null | undefined; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      <span className="mt-px">
        <StatusIcon ok={ok} />
      </span>
      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/** The run's value: one value, or a chip per boss / fight. */
function FieldValue({ field, ev, bosses }: { field: string; ev: InstanceSearchEvidence; bosses?: readonly string[] }) {
  if (ev.rows) {
    // Requested bosses with no row: no kill / no score for that boss.
    const seen = new Set(ev.rows.map((r) => r.name.toLowerCase()));
    const absent = (bosses ?? []).filter((b) => !seen.has(b.toLowerCase()));
    if (ev.rows.length === 0 && absent.length === 0) return <span className="text-muted-foreground/70">no data</span>;
    return (
      <span className="inline-flex flex-wrap gap-1">
        {ev.rows.map((r, i) => (
          <Chip key={i} ok={r.ok}>
            <span className="text-muted-foreground">{r.name}</span> {formatEvidence(field, r.value)}
          </Chip>
        ))}
        {absent.map((b) => (
          <Chip key={b} ok={false}>
            <span className="text-muted-foreground">{b}</span> —
          </Chip>
        ))}
      </span>
    );
  }
  if (ev.value === undefined || ev.value === null) return <span className="text-muted-foreground/70">no value</span>;
  return <span className="text-muted-foreground">→ <span className="text-foreground tabular-nums">{formatEvidence(field, ev.value)}</span></span>;
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-px text-2xs tabular-nums ring-1",
        ok ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30" : "bg-muted/40 text-muted-foreground ring-border",
      )}
    >
      {children}
    </span>
  );
}

function QuantifierItem({ node, inner, ev, realmName }: { node: Node; inner: Node | undefined; ev: InstanceSearchEvidence; realmName: string }) {
  const players = !!(node.any_player || node.count_players);
  const noun = players ? "player" : "pull";
  const count = ev.count ?? 0;
  const witnesses = ev.witnesses ?? [];
  return (
    <li>
      <Line ok={ev.ok}>
        <span>{describe(node)}</span>
        <span className="text-muted-foreground">
          → {count} {noun}
          {count === 1 ? "" : "s"}
        </span>
      </Line>
      {witnesses.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-3">
          {witnesses.map((w, i) => (
            <WitnessItem key={i} witness={w} inner={inner} realmName={realmName} defaultOpen={i === 0} />
          ))}
          {count > witnesses.length && (
            <li className="text-2xs text-muted-foreground">
              and {count - witnesses.length} more {noun}
              {count - witnesses.length === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function WitnessItem({ witness: w, inner, realmName, defaultOpen }: { witness: InstanceSearchWitness; inner: Node | undefined; realmName: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const evidence = w.evidence;
  const canOpen = !!(inner && evidence);
  const cls = w.class?.replace(/_/g, "");
  return (
    <li>
      <div className="flex items-center gap-1.5 text-xs">
        {canOpen ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-foreground" aria-label={open ? "Hide details" : "Show details"}>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        {w.guid ? (
          <>
            {cls && <ClassIcon cls={cls} className="h-3.5 w-3.5 rounded-sm" />}
            <Link
              to={`/armory/${encodeURIComponent(realmName)}/${encodeURIComponent(w.guid)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={cls ? { color: getClassColorVar(cls) } : undefined}
            >
              {w.name}
            </Link>
          </>
        ) : (
          <>
            <span className="font-medium">{w.name}</span>
            {w.outcome && <span className="text-muted-foreground">{enumLabel(w.outcome)}</span>}
            {w.duration_ms ? <span className="text-muted-foreground tabular-nums">{formatDuration(w.duration_ms)}</span> : null}
          </>
        )}
      </div>
      {open && canOpen && (
        <ul className="ml-5 mt-1 space-y-1">
          {inner!.and && evidence!.kind === "and" ? (
            inner!.and.map((n, i) => <EvidenceItem key={i} node={n} ev={evidence!.children?.[i] ?? missing} realmName={realmName} />)
          ) : (
            <EvidenceItem node={inner!} ev={evidence!} realmName={realmName} />
          )}
        </ul>
      )}
    </li>
  );
}
