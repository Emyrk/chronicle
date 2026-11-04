import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { useInferenceCapability } from "@/features/chat";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Blocks, BookOpen, ChevronDown, ChevronUp, Code2, Lightbulb, ListFilter, Loader2, Lock, Search, X } from "lucide-react";
import { InstanceSearchSortFields } from "@/api/typesGenerated";
import type {
  InstanceSearchCursor,
  InstanceSearchLimitResponse,
  InstanceSearchParseScope,
  InstanceSearchSort,
  InstanceSearchSortDirection,
  InstanceSearchSortField,
  InstanceSearchSortOption,
  InstanceSearchSortTier,
} from "@/api/typesGenerated";
import { useRealms, useSiteConfig, useSupportedInstances } from "@/api/queries";
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
import { CostLine } from "./CostLine";
import { queryCost } from "./searchCost";
import { CodeEditor } from "./CodeEditor";
import { CelParseError, parseCEL } from "./celParser";
import { AdRailStack } from "@/components/Ads/AdRailStack";
import { ExamplesMenu } from "./ExamplesMenu";
import { RecentSearchesMenu } from "./RecentSearchesMenu";
import { addRecentSearch, loadRecentSearches, saveRecentSearches, type RecentSearch } from "./recentSearches";
import { HonoredLockTooltip } from "./HonoredLockTooltip";
import { EXAMPLES, type SearchExample } from "./examples";
import { SentenceForm } from "./SentenceForm";
import { treeNeedsHonored } from "./fieldTiers";
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
import { planSearchDraftUpdate } from "./searchInferenceDraft";
import { SearchError, runSearch, useSearchFields, useSearchLimit, type SearchBudget } from "./searchApi";

type Mode = "form" | "blocks" | "code";

/** What Blocks / Code show non-Honored users first: or, count and not in one search. */
const PREVIEW_EXAMPLE = EXAMPLES.find((e) => e.id === "23_complex_speed_comp") ?? EXAMPLES[0];

function defaultSortDirection(field: InstanceSearchSortField): InstanceSearchSortDirection {
  switch (field) {
    case "instance.name":
    case "instance.realm":
    case "instance.guild":
    case "instance.difficulty":
    case "instance.clear_time_ms":
      return "asc";
    default:
      return "desc";
  }
}

function readSort(field: string | null, direction: string | null, parseScope: string | null): InstanceSearchSort | undefined {
  if (!InstanceSearchSortFields.some((option) => option === field)) return undefined;
  const typedField = field as InstanceSearchSortField;
  const typedDirection: InstanceSearchSortDirection = direction === "asc" || direction === "desc" ? direction : defaultSortDirection(typedField);
  if (typedField !== "instance.clear_parse") return { field: typedField, direction: typedDirection };
  const typedScope: InstanceSearchParseScope = parseScope === "realm" || parseScope === "guild" ? parseScope : "server";
  return { field: typedField, direction: typedDirection, parse_scope: typedScope };
}

export function InstanceSearchPage() {
  const [params, writeParams] = useSearchParams();
  const [draftRevision, bumpDraftRevision] = useReducer((revision: number) => revision + 1, 0);
  const setParams: typeof writeParams = (...args) => { bumpDraftRevision(); writeParams(...args); };
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const supporter = useSupporterTier();
  // Code and the costly fields (fieldTiers.ts) are an Honored perk (UI only;
  // the server accepts the same queries from anyone logged in). Form and
  // Blocks are open to everyone. Assume unlocked while the session loads so
  // supporters never see a flash of locks.
  const advancedUnlocked = supporter.isLoading || supporter.atLeast("honored");
  const [showUpsell, setShowUpsell] = useState(false);
  const fields = useSearchFields();
  const supported = useSupportedInstances();
  const siteConfig = useSiteConfig();

  // The submitted search lives in the URL so it can be shared.
  const submittedParam = params.get("q");
  const submittedTree = useMemo(() => decodeQuery(submittedParam), [submittedParam]);
  const sortFieldParam = params.get("sort");
  const sortDirectionParam = params.get("order");
  const sortScopeParam = params.get("sort_scope");
  const submittedSort = useMemo(
    () => readSort(sortFieldParam, sortDirectionParam, sortScopeParam),
    [sortFieldParam, sortDirectionParam, sortScopeParam],
  );
  const selectedSort: InstanceSearchSort = submittedSort ?? { field: "instance.started_at", direction: "desc" };
  // Logged-out users can view a shared block / code search read-only.
  const modeParam = params.get("mode");
  const urlMode: Mode = modeParam === "blocks" || modeParam === "code" ? modeParam : "form";

  // Drafts start from the submitted search.
  const [mode, writeMode] = useState<Mode>(() => (urlMode === "form" && treeToForm(submittedTree) === null ? "blocks" : urlMode));
  const setMode: typeof writeMode = (value) => { bumpDraftRevision(); writeMode(value); };
  const [form, writeForm] = useState<Form>(() => treeToForm(submittedTree) ?? emptyForm());
  const setForm: typeof writeForm = (value) => { bumpDraftRevision(); writeForm(value); };
  const [blocks, writeBlocks] = useState<Node | undefined>(() => submittedTree);
  const setBlocks: typeof writeBlocks = (value) => { bumpDraftRevision(); writeBlocks(value); };
  const [code, writeCode] = useState<string>(() => (submittedTree ? formatCEL(submittedTree) : ""));
  const setCode: typeof writeCode = (value) => { bumpDraftRevision(); writeCode(value); };
  const [showCel, setShowCel] = useState(false);
  // The example last loaded into the block editor, shown as a caption.
  const [example, setExample] = useState<SearchExample | null>(null);

  // Without Honored, Code opens a read-only preview of an example: it can be
  // looked at as code, but not edited or run.
  // Going back to Form restores the user's own form untouched.
  const [preview, writePreview] = useState(false);
  const setPreview: typeof writePreview = (value) => { bumpDraftRevision(); writePreview(value); };
  const enterPreview = (target: "blocks" | "code", ex: SearchExample = example ?? PREVIEW_EXAMPLE) => {
    setBlocks(ex.where);
    setCode(formatCEL(ex.where));
    setExample(ex);
    setMode(target);
    setPreview(true);
  };

  const loadExample = (ex: SearchExample) => {
    if (!advancedUnlocked && mode === "code") {
      enterPreview("code", ex);
      return;
    }
    setPreview(false);
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

  const draftTree = useMemo(() => mode === "form" ? formToTree(form) : mode === "blocks" ? prune(blocks) : prune(parsedCode.tree), [mode, form, blocks, parsedCode.tree]);
  useInferenceCapability({
    id: "search-page",
    version: 1,
    scope: { type: "search_page", id: "search" },
    stateRevision: draftRevision,
    available: isAuthenticated && !authLoading && !supporter.isLoading,
    tools: {
      inspect_search_draft: () => ({
        draft: codeInvalid ? null : (draftTree ?? null),
        submitted: submittedTree ?? null,
        mode,
        revision: draftRevision,
        ...(codeInvalid ? { codeError: parsedCode.error } : {}),
        searchWasSubmitted: submittedParam !== null,
      }),
      set_search_draft: (argumentsValue) => {
        const plan = planSearchDraftUpdate(argumentsValue, advancedUnlocked, draftRevision);
        if (plan.form) setForm(plan.form);
        setBlocks(plan.where);
        setCode(formatCEL(plan.where));
        setMode(plan.mode);
        setPreview(false);
        setExample(null);
        setCollapsed(false);
        return { applied: true, mode: plan.mode, submitted: false, draft: plan.where };
      },
    },
  });
  // Whether the current draft fits the form (it always fits blocks and code).
  const formFromDraft = useMemo(() => (mode === "form" || codeInvalid ? null : treeToForm(draftTree)), [mode, codeInvalid, draftTree]);

  // Combobox options: supported instances, their bosses, and realms.
  const realms = useRealms();
  const zones = useMemo(
    () => zoneOptions(supported.data ?? [], siteConfig.data?.dataset_flavor ?? []),
    [siteConfig.data?.dataset_flavor, supported.data],
  );
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
  // Honored-only fields (UI-only lock, like Code).
  const honoredBlocked = !advancedUnlocked && !preview && treeNeedsHonored(draftTree);

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
    next.delete("sort");
    next.delete("order");
    next.delete("sort_scope");
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

  const updateSort = (sort: InstanceSearchSort) => {
    const next = new URLSearchParams(params);
    if (sort.field === "instance.started_at" && sort.direction === "desc") {
      next.delete("sort");
      next.delete("order");
      next.delete("sort_scope");
    } else {
      next.set("sort", sort.field);
      next.set("order", sort.direction ?? defaultSortDirection(sort.field));
      if (sort.field === "instance.clear_parse") next.set("sort_scope", sort.parse_scope ?? "server");
      else next.delete("sort_scope");
    }
    setParams(next);
  };

  const submit = () => runQuery(encodeQuery(draftTree), mode);

  // Loads a recent search back into the editor and runs it again. It opens
  // in the form when it fits there and the advanced editors are locked.
  const pickRecent = (r: RecentSearch) => {
    const tree = decodeQuery(r.q);
    const asForm = treeToForm(tree);
    let m: Mode = r.mode;
    if (m === "form" && !asForm) m = "blocks";
    if (m === "code" && !advancedUnlocked) m = asForm ? "form" : "blocks";
    if (asForm) setForm(asForm);
    setBlocks(tree);
    setCode(tree ? formatCEL(tree) : "");
    setExample(null);
    setMode(m);
    runQuery(r.q, m);
  };

  const results = useInfiniteQuery({
    queryKey: ["instance-search", "results", submittedParam, submittedSort, isAuthenticated],
    queryFn: ({ pageParam }) => runSearch(buildQuery(submittedTree, isAuthenticated ? undefined : 25, submittedSort), pageParam),
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
  const lastRuntimeCost = lastPage?.runtimeCost ?? error?.runtimeCost ?? null;
  // The cost the server will charge for the current draft, live as it's edited.
  const liveCost = useMemo(() => (fields.data && !codeInvalid ? queryCost(draftTree, fields.data) : null), [fields.data, codeInvalid, draftTree]);
  const tooComplex = liveCost != null && budget != null && liveCost.total > budget.limit;
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
        <BudgetLine budget={budget} lastCost={lastCost} lastRuntimeCost={lastRuntimeCost} pending={collapsed ? null : (liveCost?.total ?? null)} />
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
            onClick={() => {
              // From a Code preview, Blocks opens the example for editing.
              if (preview) {
                setPreview(false);
                setMode("blocks");
              } else switchMode("blocks");
            }}
            disabled={!preview && codeInvalid}
            title={codeInvalid ? "Fix the query text first" : "Edit this search as blocks"}
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
      {!advancedUnlocked && (showUpsell || mode === "code" || honoredBlocked) && (
        <HonoredUpsell loggedIn={isAuthenticated} note={preview ? "You're previewing an example. " : mode === "code" ? "You're viewing a shared search. " : honoredBlocked ? "This search uses Honored conditions. " : ""} />
      )}

      {fields.isLoading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mode === "form" ? (
        <SentenceForm
          form={form}
          onChange={setForm}
          zones={zones}
          bosses={bossesForZone}
          realms={realmNames}
          classes={enumOf("player.class")}
          capabilities={enumOf("instance.capability")}
          loggedIn={isAuthenticated}
          honored={advancedUnlocked}
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
            <BlockEditor
              tree={blocks}
              onChange={setBlocks}
              ctx={{ fields: fields.data?.fields ?? [], costs: fields.data, zones, bosses: allBosses, realms: realmNames, disabled: preview, honored: advancedUnlocked, loggedIn: isAuthenticated }}
            />
          )}
        </div>
      )}

      {/* Sticks to the bottom of the screen while a long search is being
          edited, so Search and the cost stay in reach; it settles back into
          place above the results. The query text opens inside it, above the
          buttons, so it stays visible while pinned. */}
      <div className="sticky bottom-2 z-20 -mx-2 overflow-hidden rounded-xl border border-sky-500/30 bg-zinc-950/95 shadow-[0_-12px_36px_rgba(0,0,0,0.6)] ring-1 ring-white/5 backdrop-blur">
        <div className="h-0.5 bg-gradient-to-r from-sky-500/0 via-sky-400/70 to-sky-500/0" />
        {showCel && mode !== "code" && (
          <pre className="mx-3 mt-2.5 max-h-48 overflow-auto rounded-md border border-border/60 bg-zinc-900/70 p-3 text-2xs leading-relaxed whitespace-pre-wrap styled-scrollbar">
            <CelCode code={formatCEL(draftTree)} />
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <Button
          onClick={submit}
          disabled={preview || anonBlocked || honoredBlocked || codeInvalid || tooComplex || results.isFetching}
          title={preview ? "Honored supporters can run code searches" : honoredBlocked ? "This search uses conditions for Honored supporters" : undefined}
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
        {liveCost && (
          <span className="ml-auto">
            <CostLine cost={liveCost} budget={budget} refillPerMinute={limit.data?.refill_per_minute ?? null} />
          </span>
        )}
        {mode !== "code" && (
          <button type="button" onClick={() => setShowCel((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {showCel ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Query text
          </button>
        )}
        </div>
      </div>
      {anonBlocked && (
        <p className="text-xs text-amber-300/90">
          <Link to="/login" className="underline">Log in</Link> to search by bosses, parses, roster or capabilities.
        </p>
      )}
      </>
      )}

      {error && <ErrorBox error={error} />}
      {results.error && !error && <ErrorBox error={new SearchError("Search failed.", 0)} />}

      {submittedParam !== null && (
        <SortControls
          sort={selectedSort}
          options={fields.data?.sorts ?? []}
          supporterTier={supporter.tier}
          supporterLoading={supporter.isLoading}
          onChange={updateSort}
        />
      )}

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

function sortTierUnlocked(minimum: InstanceSearchSortTier, supporterTier: string | null, loading: boolean): boolean {
  if (minimum === "free" || loading) return true;
  const order = ["honored", "revered", "exalted"];
  return supporterTier !== null && order.indexOf(supporterTier) >= order.indexOf(minimum);
}

function SortControls({
  sort,
  options,
  supporterTier,
  supporterLoading,
  onChange,
}: {
  sort: InstanceSearchSort;
  options: readonly InstanceSearchSortOption[];
  supporterTier: string | null;
  supporterLoading: boolean;
  onChange: (sort: InstanceSearchSort) => void;
}) {
  const selectClass = "h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60";
  const current = options.find((option) => option.field === sort.field);
  const currentUnlocked = current ? sortTierUnlocked(current.minimum_tier, supporterTier, supporterLoading) : true;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ArrowUpDown className="h-3.5 w-3.5" /> Sort
      </span>
      <select
        aria-label="Sort property"
        className={selectClass}
        value={sort.field}
        disabled={options.length === 0}
        onChange={(event) => {
          const option = options.find((candidate) => candidate.field === event.target.value);
          if (!option) return;
          onChange({
            field: option.field,
            direction: option.default_direction,
            ...(option.parse_scope ? { parse_scope: "server" as const } : {}),
          });
        }}
      >
        {options.map((option) => {
          const unlocked = sortTierUnlocked(option.minimum_tier, supporterTier, supporterLoading);
          const suffix = option.minimum_tier === "free" ? "" : ` · ${option.minimum_tier[0].toUpperCase()}${option.minimum_tier.slice(1)}`;
          return <option key={option.field} value={option.field} disabled={!unlocked}>{option.label}{suffix}</option>;
        })}
      </select>
      {current?.parse_scope && (
        <select
          aria-label="Clear parse scope"
          className={selectClass}
          value={sort.parse_scope ?? "server"}
          disabled={!currentUnlocked}
          onChange={(event) => onChange({ ...sort, parse_scope: event.target.value as InstanceSearchParseScope })}
        >
          <option value="server">Server</option>
          <option value="realm">Realm</option>
          <option value="guild">Guild</option>
        </select>
      )}
      <select
        aria-label="Sort direction"
        className={selectClass}
        value={sort.direction ?? current?.default_direction ?? defaultSortDirection(sort.field)}
        disabled={!currentUnlocked}
        onChange={(event) => onChange({ ...sort, direction: event.target.value as InstanceSearchSortDirection })}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
      {current && current.cost > 0 && <span className="text-2xs text-muted-foreground">+{current.cost} search cost</span>}
      {current && !currentUnlocked && current.minimum_tier !== "free" && (
        <Link to="/supporter" className="ml-auto inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: TIER_COLOR[current.minimum_tier] }}>
          <Lock className="h-3.5 w-3.5" /> {current.minimum_tier[0].toUpperCase()}{current.minimum_tier.slice(1)} perk
        </Link>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, disabled, locked, lockedPerk, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; locked?: boolean; lockedPerk?: "code"; title?: string; children: ReactNode }) {
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

/** Code and the costly conditions are an Honored perk; links to the supporter page. */
function HonoredUpsell({ loggedIn, note }: { loggedIn: boolean; note: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2"
      style={{ borderColor: `${TIER_COLOR.honored}55`, backgroundColor: `${TIER_COLOR.honored}0f` }}
    >
      <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: TIER_COLOR.honored }} />
      <span>
        {note}
        Code searches and the costly conditions (player parses and stats, boss, trash and idle time) are for{" "}
        <span className="font-medium" style={{ color: TIER_COLOR.honored }}>Honored</span> supporters.{" "}
        {loggedIn ? (
          <Link to="/supporter" className="underline font-medium">Become a supporter</Link>
        ) : (
          <>
            <Link to="/login" className="underline font-medium">Log in</Link> or{" "}
            <Link to="/supporter" className="underline font-medium">become a supporter</Link>
          </>
        )}{" "}
        to use them. The form and blocks are free.
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

/**
 * The caller's budget. While a search is being edited (pending), the part of
 * the bar it would spend is highlighted and its cost shown, amber when it's
 * more than what's left and red when it's more than the whole budget.
 */
function BudgetLine({
  budget,
  lastCost,
  lastRuntimeCost,
  pending,
}: {
  budget: SearchBudget | null;
  lastCost: number | null;
  lastRuntimeCost: number | null;
  pending: number | null;
}) {
  if (!budget) return null;
  const frac = (n: number) => (budget.limit > 0 ? Math.max(0, Math.min(1, n / budget.limit)) : 0);
  const left = frac(budget.remaining);
  const spend = pending != null ? Math.min(left, frac(pending)) : 0;
  const tooComplex = pending != null && pending > budget.limit;
  const short = !tooComplex && pending != null && pending > budget.remaining;
  return (
    <div className="flex items-center gap-2 text-2xs text-muted-foreground" title="Searches spend from a budget that refills over time. Complex searches cost more.">
      <span>Search budget</span>
      <div className="relative h-1.5 w-32 rounded-full bg-zinc-800 overflow-hidden">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", left > 0.25 ? "bg-primary/70" : "bg-amber-500/80")} style={{ width: `${left * 100}%` }} />
        {spend > 0 && (
          <div
            className={cn("absolute inset-y-0 rounded-r-full", tooComplex ? "bg-red-400" : short ? "bg-amber-300" : "bg-sky-200")}
            style={{ left: `${(left - spend) * 100}%`, width: `${spend * 100}%` }}
          />
        )}
      </div>
      <span className="tabular-nums">{Math.floor(budget.remaining)}/{budget.limit}</span>
      {pending != null ? (
        <span className={cn("tabular-nums font-medium", tooComplex ? "text-red-300" : short ? "text-amber-200" : "text-foreground/80")}>
          · this search costs {pending}
        </span>
      ) : (
        lastCost != null && (
          <span className="tabular-nums">
            · last search cost {lastCost + (lastRuntimeCost ?? 0)}
            {lastRuntimeCost != null && <span className="text-muted-foreground"> ({lastCost} query + {lastRuntimeCost} runtime)</span>}
          </span>
        )
      )}
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
      {error.link && (
        <p><Link to={error.link} className="underline text-amber-300">{error.linkText ?? "Learn more"}</Link></p>
      )}
      {error.loginRequired && (
        <p><Link to="/login" className="underline text-amber-300">Log in</Link> to run this search.</p>
      )}
    </div>
  );
}
