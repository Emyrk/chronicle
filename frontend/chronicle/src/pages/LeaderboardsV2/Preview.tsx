import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, FlaskConical, Search } from "lucide-react";
import { useLeaderboardConfiguration } from "@/api/leaderboardConfiguration";
import { useLeaderboardV2, useLeaderboardV2Cohorts } from "@/api/leaderboardV2";
import type {
  LeaderboardConfiguration,
  LeaderboardV2Response,
} from "@/api/typesGenerated";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function LeaderboardsV2Preview() {
  const query = useLeaderboardConfiguration();
  if (query.isPending)
    return (
      <p role="status" className="p-8">
        Loading tenant configuration…
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="p-8">
        {query.error.message}
      </p>
    );
  return <PreviewConfiguration data={query.data} />;
}

export function PreviewConfiguration({
  data,
}: {
  data: LeaderboardConfiguration;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const instances = data.rows
    .filter((row) => row.kind === "instance")
    .map((row) => row.instance_name);
  const instance = instances.includes(selected) ? selected : instances[0];
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
      <Link
        to="/leaderboards/configuration"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Configuration inspector
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            All-time / tenant preview
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Leaderboards v2</h1>
          <p className="mt-2 text-muted-foreground">{data.tenant_name}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {data.leaderboard_flavor.join(" + ")}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <FlaskConical size={14} /> Preview
        </span>
      </header>
      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Scores read current benchmarks and awards over stored summaries. This
        preview does not populate evidence or run refresh workers. Existing
        leaderboards are unchanged.
      </p>
      {!data.tenant_id ? (
        <p role="status" className="rounded-xl border p-8">
          Open a tenant site to view its leaderboard. The root site does not own
          a tenant's evidence.
        </p>
      ) : data.conflict ? (
        <p role="alert" className="rounded-xl border border-destructive p-8">
          Configuration conflict: {data.conflict}. No scores are shown.
        </p>
      ) : !instance ? (
        <p className="p-8">No configured instances.</p>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-card p-3">
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Search size={16} />
              <input
                aria-label="Search instances"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search instances"
                className="min-w-0 w-full bg-transparent text-sm outline-none"
              />
            </label>
            <nav
              aria-label="Instances"
              className="styled-scrollbar mt-3 max-h-96 space-y-1 overflow-y-auto"
            >
              {instances
                .filter((name) =>
                  name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelected(name)}
                    aria-current={name === instance ? "page" : undefined}
                    className={`w-full rounded-md px-3 py-2.5 text-left text-sm ${name === instance ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
                  >
                    {name}
                  </button>
                ))}
            </nav>
          </aside>
          <InstancePreview key={instance} data={data} instance={instance} />
        </div>
      )}
    </main>
  );
}

function InstancePreview({
  data,
  instance,
}: {
  data: LeaderboardConfiguration;
  instance: string;
}) {
  const rows = data.rows.filter((row) => row.instance_name === instance);
  const variants = rows.filter((row) => row.kind === "variant");
  const [variantIndex, setVariantIndex] = useState(0);
  const variant = variants[variantIndex];
  const variantParams = new URLSearchParams({
    instance,
    difficulty: variant?.difficulty_name ?? "",
    max_players: String(variant?.max_players ?? 0),
  });
  return (
    <section className="min-w-0 space-y-5">
      <h2 className="text-2xl font-semibold">{instance}</h2>
      {variants.length > 0 ? (
        <label className="block max-w-sm space-y-1 text-sm">
          <span>Instance variant</span>
          <select
            className={fieldClass}
            value={variantIndex}
            onChange={(e) => setVariantIndex(Number(e.target.value))}
          >
            {variants.map((v, index) => (
              <option
                key={`${v.difficulty_name}/${v.max_players}`}
                value={index}
              >
                {v.difficulty_name} · {v.max_players} players
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          Vanilla identity: no difficulty variant. Scores use the exact
          empty-difficulty / size-0 cohort.
        </p>
      )}
      <BoardControls
        key={variantParams.toString()}
        data={data}
        instance={instance}
        variantParams={variantParams.toString()}
      />
    </section>
  );
}

function BoardControls({
  data,
  instance,
  variantParams,
}: {
  data: LeaderboardConfiguration;
  instance: string;
  variantParams: string;
}) {
  const [subject, setSubject] = useState("player");
  const [score, setScore] = useState("mastery");
  const [scope, setScope] = useState("");
  const [cohortIndex, setCohortIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [realm, setRealm] = useState("");
  const cohorts = useLeaderboardV2Cohorts(
    variantParams,
    subject === "player" && score !== "renown",
  );
  const cohort = cohorts.data?.[cohortIndex];
  const rows = data.rows.filter((row) => row.instance_name === instance);
  const choices = [
    ...rows
      .filter((row) => row.kind === "set")
      .map((row) => ({
        value: `set:${row.set_key}`,
        label: row.set_name || row.set_key,
      })),
    ...rows
      .filter((row) => row.kind === "boss")
      .map((row) => ({
        value: `boss:${row.encounter_name}`,
        label: row.encounter_name,
      })),
  ];
  if (subject === "guild")
    choices.unshift({ value: "clear:", label: "Full instance clear" });
  const selection = choices.some((c) => c.value === scope)
    ? scope
    : (choices[0]?.value ?? "");
  const renown = score === "renown";
  const params = new URLSearchParams(variantParams);
  params.set("subject", subject);
  params.set("score", score);
  params.set(
    "kind",
    renown ? "renown" : selection.startsWith("clear:") ? "clear" : "boss",
  );
  if (!renown && !selection.startsWith("clear:")) {
    const colon = selection.indexOf(":");
    params.set(selection.slice(0, colon), selection.slice(colon + 1));
  }
  if (!renown && subject === "player" && cohort) {
    params.set("class", cohort.player_class);
    params.set("spec", cohort.player_spec);
    params.set("sub_spec", cohort.player_sub_spec);
    params.set("metric", cohort.metric);
  }
  if (realm.trim()) params.set("realm", realm.trim());
  if (search.trim()) params.set("search", search.trim());
  const ready = renown || (selection && (subject === "guild" || cohort));
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Choose a board</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Subject</span>
            <select
              className={fieldClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="player">Players</option>
              <option value="guild">Guilds</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Score</span>
            <select
              className={fieldClass}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            >
              <option value="mastery">Mastery</option>
              <option value="peak">Peak</option>
              <option value="renown">Renown</option>
            </select>
          </label>
          {!renown && (
            <label className="space-y-1 text-sm">
              <span>Boss or encounter set</span>
              <select
                className={fieldClass}
                value={selection}
                onChange={(e) => setScope(e.target.value)}
              >
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!renown && subject === "player" && (
            <label className="space-y-1 text-sm">
              <span>Exact performance cohort</span>
              <select
                className={fieldClass}
                value={cohortIndex}
                onChange={(e) => setCohortIndex(Number(e.target.value))}
                disabled={!cohorts.data?.length}
              >
                {cohorts.data?.map((c, i) => (
                  <option
                    key={`${c.player_class}/${c.player_spec}/${c.player_sub_spec}/${c.metric}`}
                    value={i}
                  >
                    {c.player_class} / {c.player_spec}
                    {c.player_sub_spec ? ` / ${c.player_sub_spec}` : ""} /{" "}
                    {c.metric.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-sm">
            <span>Search subject name</span>
            <input
              className={fieldClass}
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or unlinked subject ID"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Realm ID (optional)</span>
            <input
              className={fieldClass}
              value={realm}
              onChange={(e) => setRealm(e.target.value)}
              placeholder="All realms in this tenant"
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {renown
              ? "Renown sums current awards × kill counts across all eligible bosses in this variant. Encounter sets and performance cohorts do not gate Renown."
              : "Bosses have equal weight. Missing evidence for an included boss contributes zero. Benchmarks are tenant-wide, not realm-specific."}
          </p>
        </CardContent>
      </Card>
      {!renown && subject === "player" && cohorts.isPending ? (
        <p role="status">Loading available cohorts…</p>
      ) : !renown && subject === "player" && cohorts.isError ? (
        <p role="alert">{cohorts.error.message}</p>
      ) : !ready ? (
        <p className="rounded-xl border border-dashed p-8 text-muted-foreground">
          No performance cohorts or eligible selections are available yet.
        </p>
      ) : (
        <BoardResults
          key={params.toString()}
          params={params.toString()}
          score={score}
        />
      )}
    </>
  );
}

function BoardResults({ params, score }: { params: string; score: string }) {
  const [cursors, setCursors] = useState([""]);
  const cursor = cursors[cursors.length - 1];
  const query = useLeaderboardV2(
    `${params}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  return (
    <div className="space-y-4">
      {query.isPending ? (
        <p role="status" className="p-8">
          Loading scores…
        </p>
      ) : query.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-destructive p-6"
        >
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ScoreTable data={query.data} score={score} />
      )}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          disabled={cursors.length === 1 || query.isFetching}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          <ArrowLeft size={14} /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Keyset pages, no global rank
        </span>
        <Button
          variant="outline"
          disabled={!query.data?.next_cursor || query.isFetching}
          onClick={() => setCursors([...cursors, query.data!.next_cursor!])}
        >
          Next <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function ScoreTable({
  data,
  score,
}: {
  data: LeaderboardV2Response;
  score: string;
}) {
  if (data.status === "empty_selection")
    return (
      <p role="status" className="rounded-xl border border-dashed p-8">
        Empty encounter set. No eligible bosses are included; no score is
        calculated.
      </p>
    );
  if (!data.entries.length)
    return (
      <p role="status" className="rounded-xl border border-dashed p-8">
        {data.message || "No summaries match this selection."}
      </p>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {score === "renown"
            ? "Renown"
            : score === "peak"
              ? "Peak"
              : "Mastery"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {data.included_bosses.length
            ? `${data.included_bosses.length} eligible bosses`
            : "Instance clear"}{" "}
          · all-time · current policy
        </p>
      </CardHeader>
      <CardContent className="styled-scrollbar overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-3 pr-4">Subject / realm</th>
              <th className="px-3 py-3 text-right">Score</th>
              <th className="px-3 py-3 text-right">
                {score === "renown" ? "Kills" : "Observations"}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((row) => (
              <tr
                key={`${row.realm_id}/${row.subject_id}`}
                className="border-b last:border-0"
              >
                <td className="py-4 pr-4">
                  <p className="font-medium">{row.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {row.realm_id}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Summaries as of {new Date(row.computed_at).toLocaleString()}
                  </p>
                </td>
                <td className="px-3 py-4 text-right font-mono font-semibold tabular-nums text-primary">
                  {row.score.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-4 text-right tabular-nums">
                  {row.sample_count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
