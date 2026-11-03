import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Blocks, ChevronDown, ChevronRight, ListFilter, Loader2, Lock, Search } from "lucide-react";
import type { InstanceSearchCursor, InstanceSearchResult } from "@/api/typesGenerated";
import { useSupportedInstances } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BlockEditor } from "./BlockEditor";
import { SearchForm } from "./SearchForm";
import {
  buildQuery,
  decodeQuery,
  emptyForm,
  encodeQuery,
  formIsBasic,
  formToTree,
  formatCEL,
  prune,
  treeToForm,
  type Node,
  type SearchForm as Form,
} from "./queryModel";
import { SearchError, runSearch, useSearchFields, useSearchLimit, type SearchBudget } from "./searchApi";

type Mode = "form" | "blocks";

export function InstanceSearchPage() {
  const [params, setParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const fields = useSearchFields();
  const supported = useSupportedInstances();

  // The submitted search lives in the URL so it can be shared.
  const submittedParam = params.get("q");
  const submittedTree = useMemo(() => decodeQuery(submittedParam), [submittedParam]);
  // Logged-out users can view a shared block search read-only.
  const urlMode: Mode = params.get("mode") === "blocks" ? "blocks" : "form";

  // Drafts start from the submitted search.
  const [mode, setMode] = useState<Mode>(() => (urlMode === "form" && treeToForm(submittedTree) === null ? "blocks" : urlMode));
  const [form, setForm] = useState<Form>(() => treeToForm(submittedTree) ?? emptyForm());
  const [blocks, setBlocks] = useState<Node | undefined>(() => submittedTree);
  const [showCel, setShowCel] = useState(false);

  const draftTree = mode === "form" ? formToTree(form) : prune(blocks);
  const formFromBlocks = useMemo(() => (mode === "blocks" ? treeToForm(prune(blocks)) : null), [mode, blocks]);

  const zones = useMemo(() => (supported.data ?? []).map((i) => i.name).sort(), [supported.data]);
  const bossesForZone = useMemo(() => {
    const all = supported.data ?? [];
    const zone = mode === "form" ? form.zone.trim().toLowerCase() : "";
    const picked = zone ? all.filter((i) => i.name.toLowerCase() === zone || (form.zoneMatch === "contains" && i.name.toLowerCase().includes(zone))) : all;
    return [...new Set((picked.length ? picked : all).flatMap((i) => (i.bosses ?? []).map((b) => b.name)))].sort();
  }, [supported.data, mode, form.zone, form.zoneMatch]);
  const allBosses = useMemo(() => [...new Set((supported.data ?? []).flatMap((i) => (i.bosses ?? []).map((b) => b.name)))].sort(), [supported.data]);
  const enumOf = (name: string) => fields.data?.fields.find((f) => f.name === name)?.enum ?? [];

  const anonBlocked = !isAuthenticated && mode === "form" && !formIsBasic(form);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "blocks") {
      setBlocks(formToTree(form));
    } else {
      const f = treeToForm(prune(blocks));
      if (!f) return;
      setForm(f);
    }
    setMode(next);
  };

  const submit = () => {
    const next = new URLSearchParams(params);
    next.set("q", encodeQuery(draftTree));
    if (mode === "blocks") next.set("mode", "blocks");
    else next.delete("mode");
    setParams(next);
  };

  const results = useInfiniteQuery({
    queryKey: ["instance-search", "results", submittedParam, isAuthenticated],
    queryFn: ({ pageParam }) => runSearch(buildQuery(submittedTree, isAuthenticated ? undefined : 25), pageParam),
    initialPageParam: undefined as InstanceSearchCursor | undefined,
    getNextPageParam: (last) => last.page.next ?? undefined,
    // Wait for the session: searching before it loads would run (and spend)
    // the search once as anonymous and again as the logged-in user.
    enabled: submittedParam !== null && !authLoading,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const limit = useSearchLimit();
  const lastPage = results.data?.pages[results.data.pages.length - 1];
  const error = results.error instanceof SearchError ? results.error : null;
  const budget: SearchBudget | null =
    lastPage?.budget ??
    error?.budget ??
    (limit.data ? { limit: limit.data.limit, remaining: limit.data.remaining, resetSeconds: limit.data.reset_seconds } : null);
  const lastCost = lastPage?.cost ?? error?.cost ?? null;
  const rows = results.data?.pages.flatMap((p) => p.page.results) ?? [];

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Instance search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find raids by zone, bosses, speed, parses, roster and more.
        </p>
      </div>

      {!isAuthenticated && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Logged out, you can search by zone, guild, realm, date and difficulty.{" "}
            <Link to="/login" className="underline font-medium">Log in</Link> to search by bosses, parses, kill times, roster and more, and to use the block editor.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
          <ModeButton active={mode === "form"} onClick={() => switchMode("form")} disabled={mode === "blocks" && formFromBlocks === null} title={mode === "blocks" && formFromBlocks === null ? "This search uses blocks the form can't show" : undefined}>
            <ListFilter className="h-3.5 w-3.5" /> Form
          </ModeButton>
          <ModeButton active={mode === "blocks"} onClick={() => switchMode("blocks")} disabled={!isAuthenticated} title={isAuthenticated ? "Edit this search as blocks" : "Log in to use the block editor"}>
            <Blocks className="h-3.5 w-3.5" /> Blocks
          </ModeButton>
        </div>
        <BudgetLine budget={budget} lastCost={lastCost} />
      </div>

      {fields.isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mode === "form" ? (
        <SearchForm
          form={form}
          onChange={setForm}
          zones={zones}
          bosses={bossesForZone}
          classes={enumOf("player.class")}
          capabilities={enumOf("instance.capability")}
          loggedIn={isAuthenticated}
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <BlockEditor tree={blocks} onChange={setBlocks} ctx={{ fields: fields.data?.fields ?? [], zones, bosses: allBosses, disabled: !isAuthenticated }} />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={submit} disabled={anonBlocked || results.isFetching} className="gap-1.5">
          {results.isFetching && !results.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        {mode === "form" && (
          <Button variant="ghost" size="sm" onClick={() => setForm(emptyForm())}>Clear</Button>
        )}
        {mode === "blocks" && (
          <Button variant="ghost" size="sm" onClick={() => setBlocks(undefined)}>Clear</Button>
        )}
        <button type="button" onClick={() => setShowCel((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          {showCel ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Query text
        </button>
      </div>
      {anonBlocked && (
        <p className="text-xs text-amber-300/90">
          <Link to="/login" className="underline">Log in</Link> to search by bosses, parses, roster or capabilities.
        </p>
      )}
      {showCel && (
        <pre className="text-2xs leading-relaxed bg-zinc-900/60 border border-border/60 rounded-md p-3 overflow-x-auto styled-scrollbar whitespace-pre-wrap">
          {formatCEL(draftTree)}
        </pre>
      )}

      {error && <ErrorBox error={error} />}
      {results.error && !error && <ErrorBox error={new SearchError("Search failed.", 0)} />}

      {submittedParam !== null && !results.error && (
        <ResultsTable rows={rows} loading={results.isLoading} />
      )}
      {results.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
            {results.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, disabled, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BudgetLine({ budget, lastCost }: { budget: SearchBudget | null; lastCost: number | null }) {
  if (!budget) return null;
  const pct = budget.limit > 0 ? Math.max(0, Math.min(1, budget.remaining / budget.limit)) : 0;
  return (
    <div className="flex items-center gap-2 text-2xs text-muted-foreground" title="Searches spend from a budget that refills over time. Complex searches cost more.">
      <span>Search budget</span>
      <div className="h-1.5 w-24 rounded-full bg-zinc-800 overflow-hidden">
        <div className={cn("h-full rounded-full", pct > 0.25 ? "bg-primary/70" : "bg-amber-500/80")} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="tabular-nums">{Math.floor(budget.remaining)}/{budget.limit}</span>
      {lastCost != null && <span className="tabular-nums">· last search cost {lastCost}</span>}
    </div>
  );
}

function ErrorBox({ error }: { error: SearchError }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs space-y-0.5">
      <p className="text-red-300 font-medium">{error.message}</p>
      {error.callToAction && <p className="text-muted-foreground">{error.callToAction}</p>}
      {error.detail && <p className="text-muted-foreground font-mono">{error.detail}</p>}
      {error.retryAfterSeconds != null && error.status === 429 && <p className="text-muted-foreground">Try again in {error.retryAfterSeconds}s.</p>}
      {error.loginRequired && (
        <p><Link to="/login" className="underline text-amber-300">Log in</Link> to run this search.</p>
      )}
    </div>
  );
}

function ResultsTable({ rows, loading }: { rows: InstanceSearchResult[]; loading: boolean }) {
  if (loading) {
    return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-center py-10 text-sm text-muted-foreground">No runs match this search.</p>;
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-darker text-muted-foreground text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-2.5 font-medium">Zone</th>
            <th className="text-left px-4 py-2.5 font-medium">Guild</th>
            <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Realm</th>
            <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Size</th>
            <th className="text-right px-4 py-2.5 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-primary-darker/40 transition-colors">
              <td className="px-4 py-2">
                <Link to={`/instances/${r.slug || r.id}`} className="font-medium text-foreground hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {r.guild_id && r.guild_name ? (
                  <Link to={`/g/${r.guild_id}`} className="hover:underline">{r.guild_name}</Link>
                ) : (
                  <span className="opacity-50">—</span>
                )}
              </td>
              <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground">{r.realm_name}</td>
              <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">
                {[r.difficulty_name, r.max_players ? `${r.max_players}` : ""].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                {new Date(r.started_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
