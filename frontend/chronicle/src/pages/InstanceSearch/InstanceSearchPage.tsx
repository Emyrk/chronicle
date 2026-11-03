import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks, BookOpen, ChevronDown, ChevronRight, Code2, Lightbulb, ListFilter, Loader2, Lock, Search, X } from "lucide-react";
import type { InstanceSearchCursor, InstanceSearchLimitResponse } from "@/api/typesGenerated";
import { useRealms, useSupportedInstances } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmLinkNavigation } from "@/hooks/useConfirmLinkNavigation";
import { useSupporterTier } from "@/hooks/useSupporterTier";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";
import { Button } from "@/components/ui/button";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { BlockEditor } from "./BlockEditor";
import { ResultsTable } from "./ResultsTable";
import { SearchSummary } from "./SearchSummary";
import { CelCode } from "./CelCode";
import { CodeEditor } from "./CodeEditor";
import { CelParseError, parseCEL } from "./celParser";
import { AdRailStack } from "@/components/Ads/AdRailStack";
import { ExamplesMenu } from "./ExamplesMenu";
import { RecentSearchesMenu } from "./RecentSearchesMenu";
import { addRecentSearch, loadRecentSearches, saveRecentSearches, type RecentSearch } from "./recentSearches";
import { HonoredLockTooltip } from "./HonoredLockTooltip";
import { EXAMPLES, type SearchExample } from "./examples";
import { SearchForm } from "./SearchForm";
import { bossOptions, realmOptions, zoneOptions } from "./searchOptions";
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

type Mode = "form" | "blocks" | "code";

/** What Blocks / Code show non-Honored users first: or, count and not in one search. */
const PREVIEW_EXAMPLE = EXAMPLES.find((e) => e.id === "23_complex_speed_comp") ?? EXAMPLES[0];

export function InstanceSearchPage() {
  const [params, setParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const supporter = useSupporterTier();
  // Blocks, Code and Examples are an Honored perk (UI only; the server
  // accepts the same queries from anyone logged in). Assume unlocked while
  // the session loads so supporters never see a flash of locks.
  const advancedUnlocked = supporter.isLoading || supporter.atLeast("honored");
  const [showUpsell, setShowUpsell] = useState(false);
  const fields = useSearchFields();
  const supported = useSupportedInstances();

  // The submitted search lives in the URL so it can be shared.
  const submittedParam = params.get("q");
  const submittedTree = useMemo(() => decodeQuery(submittedParam), [submittedParam]);
  // Logged-out users can view a shared block / code search read-only.
  const modeParam = params.get("mode");
  const urlMode: Mode = modeParam === "blocks" || modeParam === "code" ? modeParam : "form";

  // Drafts start from the submitted search.
  const [mode, setMode] = useState<Mode>(() => (urlMode === "form" && treeToForm(submittedTree) === null ? "blocks" : urlMode));
  const [form, setForm] = useState<Form>(() => treeToForm(submittedTree) ?? emptyForm());
  const [blocks, setBlocks] = useState<Node | undefined>(() => submittedTree);
  const [code, setCode] = useState<string>(() => (submittedTree ? formatCEL(submittedTree) : ""));
  const [showCel, setShowCel] = useState(false);
  // The example last loaded into the block editor, shown as a caption.
  const [example, setExample] = useState<SearchExample | null>(null);

  // Without Honored, Blocks / Code / Examples open a read-only preview of an
  // example: it can be looked at in blocks or as code, but not edited or run.
  // Going back to Form restores the user's own form untouched.
  const [preview, setPreview] = useState(false);
  const enterPreview = (target: "blocks" | "code", ex: SearchExample = example ?? PREVIEW_EXAMPLE) => {
    setBlocks(ex.where);
    setCode(formatCEL(ex.where));
    setExample(ex);
    setMode(target);
    setPreview(true);
  };

  const loadExample = (ex: SearchExample) => {
    if (!advancedUnlocked) {
      enterPreview(mode === "code" ? "code" : "blocks", ex);
      return;
    }
    // Code mode shows the example as text; otherwise as blocks.
    if (mode === "code") {
      setCode(formatCEL(ex.where));
    } else {
      setBlocks(ex.where);
      setMode("blocks");
    }
    setExample(ex);
  };

  const parsedCode = useMemo(() => parseCode(code), [code]);
  const codeInvalid = mode === "code" && parsedCode.error !== null;

  const draftTree = mode === "form" ? formToTree(form) : mode === "blocks" ? prune(blocks) : prune(parsedCode.tree);
  // Whether the current draft fits the form (it always fits blocks and code).
  const formFromDraft = useMemo(() => (mode === "form" || codeInvalid ? null : treeToForm(draftTree)), [mode, codeInvalid, draftTree]);

  // Combobox options: supported instances, their bosses, and realms.
  const realms = useRealms();
  const zones = useMemo(() => zoneOptions(supported.data ?? []), [supported.data]);
  const bossesForZone = useMemo(() => {
    const all = supported.data ?? [];
    const zone = mode === "form" ? form.zone.trim().toLowerCase() : "";
    const picked = zone ? all.filter((i) => i.name.toLowerCase() === zone || (form.zoneMatch === "contains" && i.name.toLowerCase().includes(zone))) : all;
    return bossOptions(picked.length ? picked : all);
  }, [supported.data, mode, form.zone, form.zoneMatch]);
  const allBosses = useMemo(() => bossOptions(supported.data ?? []), [supported.data]);
  const realmNames = useMemo(() => realmOptions(realms.data ?? []), [realms.data]);
  const enumOf = (name: string) => fields.data?.fields.find((f) => f.name === name)?.enum ?? [];

  const anonBlocked = !isAuthenticated && mode === "form" && !formIsBasic(form);

  const leavePreview = () => {
    setPreview(false);
    setExample(null);
    setMode("form");
  };

  /** Blocks / Code without Honored: preview an example from the form, else just change the read-only view. */
  const lockedView = (next: "blocks" | "code") => {
    setShowUpsell(true);
    if (mode === "form") enterPreview(next);
    else if (preview) setMode(next);
    else switchMode(next);
  };

  const switchMode = (next: Mode) => {
    if (next === mode || codeInvalid) return;
    const tree = draftTree;
    if (next === "blocks") {
      setBlocks(tree);
    } else if (next === "code") {
      setCode(tree ? formatCEL(tree) : "");
    } else {
      const f = treeToForm(tree);
      if (!f) return;
      setForm(f);
    }
    setMode(next);
  };

  // After a search the builder collapses into a summary bar so the results
  // get the space; Edit re-expands it. Shared links open collapsed.
  const [collapsed, setCollapsed] = useState(() => params.get("q") !== null);

  const newSearch = () => {
    setForm(emptyForm());
    setBlocks(undefined);
    setCode("");
    setExample(null);
    const next = new URLSearchParams(params);
    next.delete("q");
    next.delete("mode");
    setParams(next);
    setCollapsed(false);
  };

  // The last ten searches run in this browser, newest first.
  const [recent, setRecent] = useState<RecentSearch[]>(() => loadRecentSearches());
  const rememberSearch = (q: string, m: Mode) => {
    const list = addRecentSearch(recent, { q, mode: m, at: Date.now() });
    setRecent(list);
    saveRecentSearches(list);
  };
  const clearRecent = () => {
    setRecent([]);
    saveRecentSearches([]);
  };

  const runQuery = (q: string, m: Mode) => {
    setCollapsed(true);
    const next = new URLSearchParams(params);
    next.set("q", q);
    if (m === "form") next.delete("mode");
    else next.set("mode", m);
    setParams(next);
    rememberSearch(q, m);
  };

  const submit = () => runQuery(encodeQuery(draftTree), mode);

  // Loads a recent search back into the editor and runs it again. It opens
  // in the form when it fits there and the advanced editors are locked.
  const pickRecent = (r: RecentSearch) => {
    const tree = decodeQuery(r.q);
    const asForm = treeToForm(tree);
    let m: Mode = r.mode;
    if (m === "form" && !asForm) m = "blocks";
    if (m !== "form" && asForm && !advancedUnlocked) m = "form";
    if (asForm) setForm(asForm);
    setBlocks(tree);
    setCode(tree ? formatCEL(tree) : "");
    setExample(null);
    setMode(m);
    runQuery(r.q, m);
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

  const queryClient = useQueryClient();
  const limit = useSearchLimit();
  const lastPage = results.data?.pages[results.data.pages.length - 1];
  const error = results.error instanceof SearchError ? results.error : null;
  const searchBudget = lastPage?.budget ?? error?.budget ?? null;
  const recordBudget = useCallback(
    (next: SearchBudget) => {
      queryClient.setQueryData<InstanceSearchLimitResponse>(["instance-search", "limit"], (current) =>
        current
          ? { ...current, limit: next.limit, remaining: next.remaining, reset_seconds: next.resetSeconds }
          : current,
      );
    },
    [queryClient],
  );
  // Search and explain responses already carry the exact bucket state. Put it
  // into the limit query so its five-second polling starts immediately, then
  // stops once a later peek reports a full bucket.
  useEffect(() => {
    if (searchBudget) recordBudget(searchBudget);
  }, [recordBudget, searchBudget]);
  const budget: SearchBudget | null = limit.data
    ? { limit: limit.data.limit, remaining: limit.data.remaining, resetSeconds: limit.data.reset_seconds }
    : searchBudget;
  const lastCost = lastPage?.cost ?? error?.cost ?? null;
  const rows = results.data?.pages.flatMap((p) => p.page.results) ?? [];
  // Ask before leaving while results are on screen: in-app links via the
  // shared click guard (BrowserRouter has no useBlocker), and reloads / tab
  // closes via beforeunload. Result rows open in new tabs, so they never ask.
  const hasResults = rows.length > 0;
  useConfirmLinkNavigation(hasResults, "Leave instance search? Your results will be closed.");
  useEffect(() => {
    if (!hasResults) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasResults]);

  const resultLabel = results.isLoading
    ? "Searching…"
    : results.error
      ? ""
      : `${rows.length}${results.hasNextPage ? "+" : ""} ${rows.length === 1 ? "run" : "runs"}`;
  const bossCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of supported.data ?? []) {
      if (i.boss_count == null) continue;
      m.set(i.name, i.boss_count);
      for (const alias of i.zone_names ?? []) m.set(alias, i.boss_count);
    }
    return m;
  }, [supported.data]);

  return (
    <div className="mx-auto flex w-full max-w-[2080px] items-start justify-center gap-6 p-4 md:p-8">
      <div className="hidden self-stretch 2xl:block">
        <AdRailStack primaryPlacement="instance-search-left-rail" secondaryPlacement="instance-search-left-rail-lower" railLayout="paired-wide" />
      </div>
    <main className="w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            Instance search
            <HintTooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="cursor-help rounded-sm border border-amber-400/35 bg-amber-400/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-amber-400"
                >
                  Beta
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6} className="max-w-64 text-center">
                Instance search is under active development. Fields, results and limits can change at any time.
              </TooltipContent>
            </HintTooltip>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Find raids by zone, bosses, speed, parses, roster and more.{" "}
            <Link to="/search/guide" className="inline-flex items-center gap-1 text-primary hover:underline">
              <BookOpen className="h-3.5 w-3.5" /> How it works
            </Link>
          </p>
        </div>
        <BudgetLine budget={budget} lastCost={lastCost} />
      </div>

      {collapsed ? (
        <SearchSummary tree={submittedTree} resultLabel={resultLabel} onEdit={() => setCollapsed(false)} onNew={newSearch} />
      ) : (
      <>
      {!isAuthenticated && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Logged out, you can search by zone, guild, realm, date and difficulty.{" "}
            <Link to="/login" className="underline font-medium">Log in</Link> to search by bosses, parses, kill times, roster and more.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
          <ModeButton
            active={mode === "form"}
            onClick={() => (preview ? leavePreview() : switchMode("form"))}
            disabled={!preview && mode !== "form" && (codeInvalid || formFromDraft === null)}
            title={preview ? "Back to your search" : codeInvalid ? "Fix the query text first" : mode !== "form" && formFromDraft === null ? "This search uses things the form can't show" : undefined}
          >
            <ListFilter className="h-3.5 w-3.5" /> Form
          </ModeButton>
          <ModeButton
            active={mode === "blocks"}
            locked={!advancedUnlocked}
            onClick={() => (advancedUnlocked ? switchMode("blocks") : lockedView("blocks"))}
            disabled={advancedUnlocked && codeInvalid}
            title={codeInvalid ? "Fix the query text first" : "Edit this search as blocks"}
            lockedPerk="blocks"
          >
            <Blocks className="h-3.5 w-3.5" /> Blocks
          </ModeButton>
          <ModeButton
            active={mode === "code"}
            locked={!advancedUnlocked}
            onClick={() => (advancedUnlocked ? switchMode("code") : lockedView("code"))}
            title="Edit this search as text"
            lockedPerk="code"
          >
            <Code2 className="h-3.5 w-3.5" /> Code
          </ModeButton>
        </div>
        <div className="flex items-center gap-2">
          <ExamplesMenu onPick={loadExample} />
          <RecentSearchesMenu recent={recent} onPick={pickRecent} onClear={clearRecent} />
        </div>
      </div>
      {!advancedUnlocked && (showUpsell || mode !== "form") && (
        <HonoredUpsell loggedIn={isAuthenticated} note={preview ? "You're previewing an example. " : mode !== "form" ? "You're viewing a shared search. " : ""} />
      )}

      {fields.isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mode === "form" ? (
        <SearchForm
          form={form}
          onChange={setForm}
          zones={zones}
          bosses={bossesForZone}
          realms={realmNames}
          classes={enumOf("player.class")}
          capabilities={enumOf("instance.capability")}
          loggedIn={isAuthenticated}
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-3">
          {example && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
              <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Example: {example.title}</p>
                <p className="text-2xs text-muted-foreground">{example.description} {preview ? "Honored supporters can edit and run it." : `${mode === "code" ? "Edit the query" : "Edit any block"}, then Search.`}</p>
              </div>
              {!preview && (
                <button type="button" onClick={() => setExample(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss example">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {mode === "code" ? (
            <CodeEditor value={code} onChange={setCode} onSubmit={submit} parse={{ error: parsedCode.error }} disabled={!advancedUnlocked} />
          ) : (
            <BlockEditor tree={blocks} onChange={setBlocks} ctx={{ fields: fields.data?.fields ?? [], zones, bosses: allBosses, realms: realmNames, disabled: !advancedUnlocked }} />
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={submit}
          disabled={preview || anonBlocked || codeInvalid || results.isFetching}
          title={preview ? "Honored supporters can run block and code searches" : undefined}
          className="gap-1.5"
        >
          {results.isFetching && !results.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        {mode === "form" && (
          <Button variant="ghost" size="sm" onClick={() => setForm(emptyForm())}>Clear</Button>
        )}
        {mode === "blocks" && !preview && (
          <Button variant="ghost" size="sm" onClick={() => { setBlocks(undefined); setExample(null); }}>Clear</Button>
        )}
        {mode === "code" && !preview && (
          <Button variant="ghost" size="sm" onClick={() => { setCode(""); setExample(null); }}>Clear</Button>
        )}
        {mode !== "code" && (
          <button type="button" onClick={() => setShowCel((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {showCel ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Query text
          </button>
        )}
      </div>
      {anonBlocked && (
        <p className="text-xs text-amber-300/90">
          <Link to="/login" className="underline">Log in</Link> to search by bosses, parses, roster or capabilities.
        </p>
      )}
      {showCel && mode !== "code" && (
        <pre className="text-2xs leading-relaxed bg-zinc-900/60 border border-border/60 rounded-md p-3 overflow-x-auto styled-scrollbar whitespace-pre-wrap">
          <CelCode code={formatCEL(draftTree)} />
        </pre>
      )}
      </>
      )}

      {error && <ErrorBox error={error} />}
      {results.error && !error && <ErrorBox error={new SearchError("Search failed.", 0)} />}

      {submittedParam !== null && !results.error && (
        <ResultsTable
          rows={rows}
          loading={results.isLoading}
          bossCounts={bossCounts}
          tree={submittedTree}
          onBudget={recordBudget}
        />
      )}
      {results.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
            {results.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        </div>
      )}
    </main>
      <AdRailStack primaryPlacement="instance-search-right-rail" secondaryPlacement="instance-search-right-rail-lower" railLayout="paired-wide" />
    </div>
  );
}

function ModeButton({ active, onClick, disabled, locked, lockedPerk, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; locked?: boolean; lockedPerk?: "blocks" | "code"; title?: string; children: ReactNode }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={locked ? undefined : title}
      className={cn(
        "px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {locked && <Lock className="h-3 w-3" style={{ color: TIER_COLOR.honored }} aria-label="Honored" />}
    </button>
  );
  return locked && lockedPerk ? <HonoredLockTooltip highlight={lockedPerk}>{button}</HonoredLockTooltip> : button;
}

/** Blocks / Code / Examples are an Honored perk; links to the supporter page. */
function HonoredUpsell({ loggedIn, note }: { loggedIn: boolean; note: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2"
      style={{ borderColor: `${TIER_COLOR.honored}55`, backgroundColor: `${TIER_COLOR.honored}0f` }}
    >
      <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: TIER_COLOR.honored }} />
      <span>
        {note}
        Building and running block and code searches is for{" "}
        <span className="font-medium" style={{ color: TIER_COLOR.honored }}>Honored</span> supporters.{" "}
        {loggedIn ? (
          <Link to="/supporter" className="underline font-medium">Become a supporter</Link>
        ) : (
          <>
            <Link to="/login" className="underline font-medium">Log in</Link> or{" "}
            <Link to="/supporter" className="underline font-medium">become a supporter</Link>
          </>
        )}{" "}
        to build your own. The form is free.
      </span>
    </div>
  );
}

/**
 * Parses the code editor's text. Kept outside the component: the React
 * Compiler mis-memoizes a try/catch inside a component, which left the syntax
 * error from an earlier keystroke on screen after the text was fixed.
 */
function parseCode(code: string): { tree: Node | undefined; error: { message: string; offset: number } | null } {
  try {
    return { tree: parseCEL(code), error: null };
  } catch (e) {
    const err = e instanceof CelParseError ? e : new CelParseError(String(e), 0);
    return { tree: undefined, error: { message: err.message, offset: err.offset } };
  }
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
