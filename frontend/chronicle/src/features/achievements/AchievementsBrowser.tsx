import { LogIn, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AchievementIcon } from "./AchievementIcon";
import { AchievementRow, AchievementSeriesCard } from "./AchievementRow";
import { CompletionRate, PointsShield } from "./AchievementParts";
import { filterEntries, formatEarnedDate, type AchievementFilter, type AchievementsModel, type CategoryView } from "./achievementsModel";
import type { AchievementsBrowserState } from "./achievementsState";

const FILTER_LABELS: Record<AchievementFilter, string> = {
  all: "All",
  earned: "Earned",
  incomplete: "Not earned",
  rewards: "Has reward",
};

/**
 * The full achievements page body. Pure: everything it shows comes from `model`
 * and `state`, so Storybook and the routed page render the exact same UI.
 */
export function AchievementsBrowser({
  model,
  state,
  onStateChange,
  isMac,
}: {
  model: AchievementsModel;
  state: AchievementsBrowserState;
  onStateChange: (next: AchievementsBrowserState) => void;
  isMac: boolean;
}) {
  const selected = model.categories.find((category) => category.category.id === state.category);
  const searching = state.search.trim() !== "" || state.filter !== "all";
  const set = (patch: Partial<AchievementsBrowserState>) => onStateChange({ ...state, ...patch });

  return (
    <div className="space-y-4">
      <AchievementsHeader model={model} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <CategoryNav model={model} selectedId={selected?.category.id ?? ""} onSelect={(category) => set({ category })} />

        <main className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={state.search}
                onChange={(event) => set({ search: event.target.value })}
                placeholder="Search achievements…"
                className="pl-9"
                aria-label="Search achievements"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto styled-scrollbar" role="radiogroup" aria-label="Filter achievements">
              {(Object.keys(FILTER_LABELS) as AchievementFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="radio"
                  aria-checked={state.filter === filter}
                  onClick={() => set({ filter })}
                  className={cn(
                    "whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs",
                    state.filter === filter ? "border-amber-400/50 bg-amber-400/15 text-amber-100" : "border-border text-muted-foreground hover:text-foreground",
                    !model.signedIn && (filter === "earned" || filter === "incomplete") && "hidden",
                  )}
                >
                  {FILTER_LABELS[filter]}
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <CategoryContent category={selected} filter={state.filter} search={state.search} isMac={isMac} />
          ) : searching ? (
            <SearchResults model={model} filter={state.filter} search={state.search} isMac={isMac} />
          ) : (
            <Overview model={model} onSelect={(category) => set({ category })} />
          )}
        </main>
      </div>
    </div>
  );
}

function AchievementsHeader({ model }: { model: AchievementsModel }) {
  const percent = model.totalPoints > 0 ? (model.earnedPoints / model.totalPoints) * 100 : 0;
  return (
    <header className="flex flex-col gap-4 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.08] via-card to-card p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex-1">
        <h1 className="text-xl font-semibold">Achievements</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A guided tour of Chronicle. Each achievement teaches a workflow; points record how much of Chronicle you have explored.
        </p>
      </div>
      {model.signedIn ? (
        <div className="flex items-center gap-4 sm:min-w-72">
          <PointsShield points={model.earnedPoints} earned className="h-14 w-12 text-base" />
          <div className="flex-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold tabular-nums text-amber-100">
                {model.earnedPoints} <span className="font-normal text-muted-foreground">/ {model.totalPoints} points</span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {model.earnedCount}/{model.totalCount}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <a href="/login" className="inline-flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/20">
          <LogIn className="h-4 w-4" /> Sign in to track your progress
        </a>
      )}
    </header>
  );
}

function CategoryNav({
  model,
  selectedId,
  onSelect,
}: {
  model: AchievementsModel;
  selectedId: string;
  onSelect: (categoryId: string) => void;
}) {
  const item = (id: string, label: string, icon: string, count?: string) => (
    <button
      key={id || "summary"}
      type="button"
      onClick={() => onSelect(id)}
      aria-current={selectedId === id ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm lg:w-full",
        selectedId === id ? "bg-amber-400/15 text-amber-100" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <AchievementIcon icon={icon} earned={selectedId === id} size="sm" className="h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5" />
      <span className="min-w-0 flex-1 whitespace-nowrap lg:truncate">{label}</span>
      {count && <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground lg:inline">{count}</span>}
    </button>
  );

  return (
    <nav
      aria-label="Achievement categories"
      className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1.5 styled-scrollbar lg:sticky lg:top-4 lg:w-64 lg:flex-col lg:overflow-visible"
    >
      {item("", "Summary", "trophy")}
      {model.categories.map((category) =>
        item(
          category.category.id,
          category.category.name,
          category.category.icon,
          model.signedIn ? `${category.earnedCount}/${category.totalCount}` : `${category.totalCount}`,
        ),
      )}
    </nav>
  );
}

function CategoryContent({
  category,
  filter,
  search,
  isMac,
}: {
  category: CategoryView;
  filter: AchievementFilter;
  search: string;
  isMac: boolean;
}) {
  const entries = filterEntries(category.entries, filter, search);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{category.category.name}</h2>
        <p className="text-sm text-muted-foreground">{category.category.description}</p>
      </div>
      {entries.length === 0 ? (
        <Empty />
      ) : (
        entries.map((entry) =>
          entry.kind === "series" ? (
            <AchievementSeriesCard key={entry.view.series.id} view={entry.view} categoryIcon={category.category.icon} isMac={isMac} />
          ) : (
            <AchievementRow key={entry.view.achievement.id} view={entry.view} categoryIcon={category.category.icon} isMac={isMac} />
          ),
        )
      )}
    </section>
  );
}

function SearchResults({
  model,
  filter,
  search,
  isMac,
}: {
  model: AchievementsModel;
  filter: AchievementFilter;
  search: string;
  isMac: boolean;
}) {
  const sections = model.categories
    .map((category) => ({ category, entries: filterEntries(category.entries, filter, search) }))
    .filter((section) => section.entries.length > 0);
  if (sections.length === 0) return <Empty />;
  return (
    <div className="space-y-6">
      {sections.map(({ category, entries }) => (
        <CategoryContent key={category.category.id} category={{ ...category, entries }} filter="all" search="" isMac={isMac} />
      ))}
    </div>
  );
}

function Overview({ model, onSelect }: { model: AchievementsModel; onSelect: (categoryId: string) => void }) {
  return (
    <div className="space-y-4">
      {model.signedIn && model.recent.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Recently earned</h2>
          <ul className="divide-y divide-border/50">
            {model.recent.slice(0, 5).map((view) => {
              const category = model.categories.find((candidate) => candidate.category.id === view.achievement.category_id);
              return (
                <li key={view.achievement.id} className="flex items-center gap-3 py-2">
                  <AchievementIcon icon={view.achievement.icon || category?.category.icon} earned size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-amber-100">{view.achievement.name}</div>
                    <CompletionRate rate={view.achievement.completion_rate} compact />
                  </div>
                  <span className="text-xs text-muted-foreground">{formatEarnedDate(view.progress!.earned_at!)}</span>
                  <PointsShield points={view.achievement.points} earned className="h-8 w-7 text-xs" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid gap-2 sm:grid-cols-2">
        {model.categories.map((category) => {
          const percent = category.totalCount > 0 ? (category.earnedCount / category.totalCount) * 100 : 0;
          return (
            <button
              key={category.category.id}
              type="button"
              onClick={() => onSelect(category.category.id)}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:border-amber-400/30"
            >
              <AchievementIcon icon={category.category.icon} earned={category.earnedCount > 0} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{category.category.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {model.signedIn ? `${category.earnedCount}/${category.totalCount}` : `${category.totalCount} achievements`}
                  </span>
                </div>
                {model.signedIn ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${percent}%` }} />
                  </div>
                ) : (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{category.category.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function Empty() {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No achievements match.</div>;
}
