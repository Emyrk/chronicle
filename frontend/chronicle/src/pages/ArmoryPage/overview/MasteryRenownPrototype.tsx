import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpenText,
  Calculator,
  ChevronRight,
  CircleDot,
  Crown,
  Flame,
  Gem,
  History,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { MASTERY_PLAYERS, type MasteryPlayer, type MasteryScope } from "./MasteryRenown.fixtures";
import { calculateMastery, masteryCeiling, type MasteryInputs, type MasteryResult } from "./masteryRenownModel";

interface MasteryRenownPrototypeProps {
  initialPlayerId?: string;
  initialScopeId?: string;
}

const confidenceStops = [1, 2, 3, 5, 8, 14];

export function MasteryRenownPrototype({ initialPlayerId = "port", initialScopeId = "all" }: MasteryRenownPrototypeProps) {
  const [selectedId, setSelectedId] = useState(initialPlayerId);
  const [scopeId, setScopeId] = useState(initialScopeId);
  const selected = MASTERY_PLAYERS.find((player) => player.id === selectedId) ?? MASTERY_PLAYERS[0];
  const selectPlayer = (id: string) => {
    setSelectedId(id);
    setScopeId("all");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b0d] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 16% 8%, rgba(28,122,95,.20), transparent 30rem), radial-gradient(circle at 84% 18%, rgba(186,133,45,.15), transparent 28rem), linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 42px 42px, 42px 42px",
        }}
      />

      <div className="relative mx-auto max-w-[92rem] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <Hero />
        <PlayerLedger selected={selected} onSelect={selectPlayer} />
        <PlayerCaseStudy player={selected} scopeId={scopeId} onScopeChange={setScopeId} />
        <ConfidenceStory />
        <ComparisonLedger selectedId={selected.id} onSelect={selectPlayer} />
        <MethodNote />
      </div>
    </main>
  );
}

function Hero() {
  return (
    <header className="relative mb-10 overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[#0c1212]/90 px-6 py-10 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:px-10 lg:px-14 lg:py-14">
      <div className="absolute -top-32 -right-20 size-96 rounded-full border border-amber-300/10" />
      <div className="absolute -top-16 -right-4 size-72 rounded-full border border-amber-300/10" />
      <div className="absolute right-14 bottom-0 h-44 w-px bg-gradient-to-b from-transparent via-amber-300/30 to-transparent" />
      <div className="relative grid items-end gap-10 lg:grid-cols-[1fr_25rem]">
        <div>
          <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.28em] text-emerald-300 uppercase">
            <span className="h-px w-9 bg-emerald-300/70" />
            Chronicle field notes · rating concept
          </div>
          <h1 className="max-w-4xl font-wow text-4xl leading-[1.02] text-balance sm:text-6xl lg:text-7xl">
            A parse is a moment.
            <span className="block text-amber-200">Mastery is proof.</span>
          </h1>
          <p className="mt-6 max-w-3xl font-serif text-lg leading-8 text-zinc-300 sm:text-xl">
            Every locked parse records how close you came to the best. Mastery asks whether you can do it again.
            Renown remembers the career that formed around it.
          </p>
        </div>
        <div className="border-l border-white/10 pl-6 text-sm leading-6 text-zinc-400">
          <div className="mb-3 flex items-center gap-2 font-wow text-lg text-zinc-100">
            <BookOpenText className="size-4 text-amber-300" />
            Two words, two promises
          </div>
          <p><strong className="text-zinc-100">Mastery</strong> stays normalized. It measures demonstrated command.</p>
          <p className="mt-3"><strong className="text-zinc-100">Renown</strong> grows with a career. It measures how much of your story Azeroth has witnessed.</p>
        </div>
      </div>
    </header>
  );
}

function PlayerLedger({ selected, onSelect }: { selected: MasteryPlayer; onSelect: (id: string) => void }) {
  return (
    <section aria-label="Choose an Octo player" className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Production-derived examples</Eyebrow>
          <h2 className="font-wow text-2xl">Four careers, four different truths</h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-zinc-500">
          Curated from deduplicated OctoWoW DPS parses on N&apos;Zoth, sampled July–October 2026.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MASTERY_PLAYERS.map((player) => {
          const active = player.id === selected.id;
          return (
            <button
              key={player.id}
              type="button"
              aria-pressed={active}
              aria-label={`Show ${player.name}'s Mastery story`}
              onClick={() => onSelect(player.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border px-5 py-5 text-left transition duration-300",
                active
                  ? "border-amber-200/45 bg-amber-200/[.07] shadow-[0_18px_45px_rgba(0,0,0,.32)]"
                  : "border-white/8 bg-white/[.025] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.045]",
              )}
            >
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: player.classColor }} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-wow text-xl" style={{ color: player.classColor }}>{player.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{player.specialization} {player.playerClass}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-bold text-zinc-100">{player.mastery.estimate.toFixed(1)}</div>
                  <div className="text-[10px] tracking-[.18em] text-zinc-600 uppercase">Mastery</div>
                  <div className="mt-1 text-[10px] text-zinc-600">ranked {player.mastery.rankedMastery.toFixed(1)}</div>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-xs">
                <span className="text-zinc-400">{player.archetype}</span>
                <ChevronRight className={cn("size-4 transition-transform", active && "translate-x-1 text-amber-300")} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PlayerCaseStudy({
  player,
  scopeId,
  onScopeChange,
}: {
  player: MasteryPlayer;
  scopeId: string;
  onScopeChange: (scopeId: string) => void;
}) {
  const encounter = useMemo(() => calculateMastery(player.featuredEncounter), [player]);
  const selectedScope = player.scopes.find((scope) => scope.id === scopeId);
  const performance = selectedScope?.performance ?? player.performance;
  const mastery = calculateMastery(performance);
  const scopeName = selectedScope?.name ?? "All raids";

  return (
    <section className="space-y-6">
      <ScopeSelector player={player} selectedScopeId={scopeId} onScopeChange={onScopeChange} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,.75fr)]">
        <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#101516] shadow-[0_25px_80px_rgba(0,0,0,.32)]">
          <div className="relative grid gap-8 border-b border-white/8 px-6 py-8 sm:px-9 lg:grid-cols-[18rem_1fr] lg:px-11 lg:py-10">
            <div
              className="pointer-events-none absolute inset-0 opacity-35"
              style={{ background: `radial-gradient(circle at 12% 40%, ${player.classColor}55, transparent 28rem)` }}
            />
            <div className="relative flex justify-center lg:justify-start">
              <MasterySeal mastery={mastery} scopeName={scopeName} />
            </div>
            <div className="relative self-center">
              <Eyebrow>{player.archetype}</Eyebrow>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="font-wow text-4xl sm:text-5xl" style={{ color: player.classColor }}>{player.name}</h2>
                <span className="text-sm text-zinc-500">&lt;{player.guild}&gt; · {player.realm}</span>
              </div>
              <p className="mt-5 max-w-2xl font-serif text-lg leading-8 text-zinc-300">{player.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {player.distinctions.map((distinction) => (
                  <span key={distinction} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300">
                    {distinction}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1fr_1.08fr]">
            <div className="border-b border-white/8 px-6 py-8 sm:px-9 lg:border-r lg:border-b-0 lg:px-11">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <Eyebrow>{scopeName} signal</Eyebrow>
                  <h3 className="font-wow text-2xl">What the parses say</h3>
                </div>
                <Sparkles className="size-5 text-amber-300" />
              </div>
              <div className="space-y-5">
                <MetricBar label="Peak" value={mastery.peak} weight="30%" description="Best locked parse" />
                <MetricBar label="Form" value={mastery.form} weight="50%" description="Typical recent performance" />
                <MetricBar label="Floor" value={mastery.floor} weight="20%" description="Reliable lower quartile" />
              </div>
              <div className="mt-7 flex items-center justify-between border-t border-dashed border-white/10 pt-5">
                <span className="text-sm text-zinc-400">Mastery estimate</span>
                <strong className="font-mono text-2xl">{mastery.estimate.toFixed(1)}</strong>
              </div>
            </div>

            <div className="px-6 py-8 sm:px-9 lg:px-11">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <Eyebrow>Evidence adjustment</Eyebrow>
                  <h3 className="font-wow text-2xl">What the record can prove</h3>
                </div>
                <ShieldCheck className="size-5 text-emerald-300" />
              </div>
              <div className="rounded-2xl border border-emerald-200/10 bg-emerald-200/[.035] p-5">
                <div className="flex items-end justify-between gap-5">
                  <div>
                    <div className="text-sm text-zinc-400">Average evidence per boss</div>
                    <div className="mt-1 font-mono text-3xl font-bold">{performance.kills.toFixed(1)} <span className="text-sm font-normal text-zinc-500">kills</span></div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl text-emerald-200">{Math.round(mastery.confidence * 100)}%</div>
                    <div className="text-[10px] tracking-[.18em] text-zinc-500 uppercase">confidence</div>
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/35">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-800 via-emerald-400 to-amber-200" style={{ width: `${mastery.confidence * 100}%` }} />
                </div>
                <div className="mt-4 flex justify-between text-xs text-zinc-500">
                  <span>Provisional</span>
                  <span>Established</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat label="Ranked ceiling" value={mastery.rankedCeiling.toFixed(1)} />
                <Stat label="Ranked Mastery" value={mastery.rankedMastery.toFixed(1)} accent />
              </div>
              <p className="mt-5 text-sm leading-6 text-zinc-400">
                Mastery reports what the parses suggest. Confidence only discounts the separate Ranked Mastery used for comparison.
              </p>
            </div>
          </div>
        </article>

        <aside className="flex flex-col gap-6">
          <RenownCard player={player} />
          <EncounterProof player={player} encounter={encounter} />
          <RaidLedger player={player} selectedScopeId={scopeId} onScopeChange={onScopeChange} />
        </aside>
      </div>
      <MasteryLab key={`${player.id}-${scopeId}`} initial={performance} playerName={player.name} scopeName={scopeName} />
    </section>
  );
}

function ScopeSelector({
  player,
  selectedScopeId,
  onScopeChange,
}: {
  player: MasteryPlayer;
  selectedScopeId: string;
  onScopeChange: (scopeId: string) => void;
}) {
  const scopes: Array<Pick<MasteryScope, "id" | "name">> = [
    { id: "all", name: "All raids" },
    ...player.scopes,
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-[#0d1213] p-2" aria-label="Mastery instance scope">
      <span className="px-3 text-[10px] font-semibold tracking-[.18em] text-zinc-600 uppercase">Scope</span>
      {scopes.map((scope) => (
        <button
          key={scope.id}
          type="button"
          aria-pressed={selectedScopeId === scope.id}
          onClick={() => onScopeChange(scope.id)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm transition-colors",
            selectedScopeId === scope.id
              ? "bg-amber-200 text-stone-950 shadow-sm"
              : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
          )}
        >
          {scope.name}
        </button>
      ))}
    </div>
  );
}

function MasterySeal({ mastery, scopeName }: { mastery: MasteryResult; scopeName: string }) {
  const color = parseHexColor(mastery.estimate);
  return (
    <div className="relative flex size-64 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(${color} ${mastery.estimate * 3.6}deg, rgba(255,255,255,.07) 0)` }}>
      <div className="absolute inset-3 rounded-full border border-white/10" />
      <div className="relative flex size-full flex-col items-center justify-center rounded-full bg-[#0b1011] shadow-[inset_0_0_45px_rgba(255,255,255,.035)]">
        <Crown className="mb-2 size-6 text-amber-200" />
        <div className="font-mono text-6xl font-bold tracking-[-.08em]" style={{ color }}>{mastery.estimate.toFixed(1)}</div>
        <div className="mt-2 max-w-40 truncate text-[11px] font-semibold tracking-[.22em] text-zinc-500 uppercase">{scopeName} Mastery</div>
        <div className="mt-4 rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">ranked {mastery.rankedMastery.toFixed(1)} · {Math.round(mastery.confidence * 100)}%</div>
      </div>
    </div>
  );
}

function RenownCard({ player }: { player: MasteryPlayer }) {
  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-amber-200/15 bg-gradient-to-br from-[#21190d] via-[#15130f] to-[#0d1010] px-6 py-7 shadow-[0_24px_70px_rgba(0,0,0,.3)]">
      <div className="absolute -top-10 -right-8 size-36 rotate-12 rounded-3xl border border-amber-200/10" />
      <div className="relative flex items-start justify-between gap-5">
        <div>
          <Eyebrow>Career record</Eyebrow>
          <h3 className="font-wow text-3xl text-amber-100">Renown</h3>
        </div>
        <Gem className="size-7 text-amber-300" />
      </div>
      <div className="relative mt-7 flex items-end justify-between gap-5">
        <div>
          <div className="font-mono text-5xl font-bold text-amber-100">{player.renown.toLocaleString()}</div>
          <div className="mt-2 text-sm text-amber-200/60">{player.renownTitle} on N&apos;Zoth</div>
        </div>
        <div className="text-right text-xs leading-5 text-zinc-500">
          {player.kills} kills<br />{player.bosses} bosses<br />{player.raids} raids
        </div>
      </div>
      <p className="relative mt-6 border-t border-amber-200/10 pt-5 text-sm leading-6 text-zinc-400">
        Renown can grow. It rewards witnessed history and breadth without pretending that longevity is skill.
      </p>
    </article>
  );
}

function EncounterProof({ player, encounter }: { player: MasteryPlayer; encounter: ReturnType<typeof calculateMastery> }) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-[#101516] px-6 py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>One boss, fully explained</Eyebrow>
          <h3 className="font-wow text-xl">{player.featuredEncounter.encounterName}</h3>
          <p className="mt-1 text-xs text-zinc-500">{player.featuredEncounter.instanceName}</p>
        </div>
        <Swords className="size-5 text-zinc-500" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Peak" value={encounter.peak} />
        <MiniStat label="Form" value={encounter.form} />
        <MiniStat label="Floor" value={encounter.floor} />
      </div>
      <div className="mt-5 flex items-center justify-between rounded-xl bg-black/25 px-4 py-3">
        <span className="text-xs text-zinc-500">{encounter.kills} kill{encounter.kills === 1 ? "" : "s"} · ranked {encounter.rankedMastery.toFixed(1)}</span>
        <strong className="font-mono" style={{ color: parseHexColor(encounter.estimate) }}>{encounter.estimate.toFixed(1)} Mastery</strong>
      </div>
    </article>
  );
}

function RaidLedger({
  player,
  selectedScopeId,
  onScopeChange,
}: {
  player: MasteryPlayer;
  selectedScopeId: string;
  onScopeChange: (scopeId: string) => void;
}) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-[#101516] px-6 py-7">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <Eyebrow>Portfolio</Eyebrow>
          <h3 className="font-wow text-xl">Raid Mastery</h3>
        </div>
        <History className="size-5 text-zinc-500" />
      </div>
      <div className="space-y-2">
        {player.scopes.map((scope) => {
          const mastery = calculateMastery(scope.performance);
          return (
            <button
              key={scope.id}
              type="button"
              onClick={() => onScopeChange(scope.id)}
              aria-pressed={selectedScopeId === scope.id}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left transition-colors",
                selectedScopeId === scope.id ? "bg-amber-200/[.07]" : "hover:bg-white/[.035]",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-zinc-300">
                  <ChevronRight className={cn("size-3 shrink-0 text-zinc-600 transition-transform", selectedScopeId === scope.id && "translate-x-0.5 text-amber-300")} />
                  {scope.name}
                </span>
                <span className="font-mono text-zinc-400">{mastery.estimate.toFixed(1)} <span className="text-[9px] text-zinc-600">ranked {mastery.rankedMastery.toFixed(1)}</span></span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/35">
                <div className="h-full rounded-full" style={{ width: `${mastery.estimate}%`, background: parseHexColor(mastery.estimate) }} />
              </div>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function MasteryLab({
  initial,
  playerName,
  scopeName,
}: {
  initial: MasteryInputs;
  playerName: string;
  scopeName: string;
}) {
  const [inputs, setInputs] = useState<MasteryInputs>(initial);
  const result = calculateMastery(inputs);
  const predictionKills = [inputs.kills + 1, inputs.kills + 3, Math.max(inputs.kills + 6, 14)];

  const setInput = (key: keyof MasteryInputs, value: number) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  return (
    <article className="overflow-hidden rounded-[2rem] border border-emerald-200/15 bg-[#0d1414] shadow-[0_28px_80px_rgba(0,0,0,.28)]">
      <div className="grid lg:grid-cols-[.8fr_1.2fr]">
        <div className="border-b border-white/8 px-7 py-9 sm:px-10 lg:border-r lg:border-b-0 lg:px-12 lg:py-12">
          <div className="flex items-start justify-between gap-5">
            <div>
              <Eyebrow>Interactive breakdown</Eyebrow>
              <h2 className="font-wow text-3xl sm:text-4xl">Mastery workshop</h2>
              <p className="mt-3 text-sm text-zinc-500">Starting from {playerName} · {scopeName}</p>
            </div>
            <Calculator className="size-6 text-emerald-300" />
          </div>

          <div className="mt-8 space-y-7">
            <MasterySlider label="Peak" description="Best locked parse" value={inputs.peak} onChange={(value) => setInput("peak", value)} />
            <MasterySlider label="Form" description="Typical performance" value={inputs.form} onChange={(value) => setInput("form", value)} />
            <MasterySlider label="Floor" description="Lower-quartile reliability" value={inputs.floor} onChange={(value) => setInput("floor", value)} />
            <MasterySlider label="Kills" description="Average evidence per boss" value={inputs.kills} max={20} step={1} onChange={(value) => setInput("kills", value)} />
          </div>

          <button
            type="button"
            onClick={() => setInputs(initial)}
            className="mt-8 rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100"
          >
            Reset to {playerName}&apos;s {scopeName} record
          </button>
        </div>

        <div className="px-7 py-9 sm:px-10 lg:px-12 lg:py-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <LabResult label="Mastery estimate" value={result.estimate} detail="what the parses suggest" featured />
            <LabResult label="Confidence" value={result.confidence * 100} detail={`${inputs.kills.toFixed(0)} kills per boss`} />
            <LabResult label="Ranked Mastery" value={result.rankedMastery} detail={`ceiling ${result.rankedCeiling.toFixed(1)}`} />
          </div>

          <div className="mt-7 rounded-2xl border border-white/8 bg-black/20 p-5">
            <div className="text-[10px] tracking-[.18em] text-zinc-600 uppercase">Live equation</div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm text-zinc-400">
              <FormulaToken value={inputs.peak * 0.3} label="30% Peak" />
              <span>+</span>
              <FormulaToken value={inputs.form * 0.5} label="50% Form" />
              <span>+</span>
              <FormulaToken value={inputs.floor * 0.2} label="20% Floor" />
              <span>=</span>
              <strong className="text-zinc-100">{result.estimate.toFixed(1)} Mastery</strong>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4 font-mono text-sm text-zinc-400">
              <span>{result.estimate.toFixed(1)}</span>
              <span>×</span>
              <span>{result.confidenceMultiplier.toFixed(3)} evidence</span>
              <span>=</span>
              <strong style={{ color: parseHexColor(result.rankedMastery) }}>{result.rankedMastery.toFixed(1)} Ranked Mastery</strong>
            </div>
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] tracking-[.18em] text-zinc-600 uppercase">Prediction</div>
                <h3 className="mt-1 font-wow text-xl">If this performance profile holds</h3>
              </div>
              <span className="text-xs text-zinc-600">No parse inflation assumed</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {predictionKills.map((kills, index) => {
                const projected = calculateMastery({ ...inputs, kills });
                const gain = projected.rankedMastery - result.rankedMastery;
                return (
                  <div key={`${kills}-${index}`} className="rounded-2xl border border-white/8 bg-white/[.025] p-4">
                    <div className="text-xs text-zinc-500">At {kills.toFixed(0)} kills</div>
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <strong className="font-mono text-2xl" style={{ color: parseHexColor(projected.rankedMastery) }}>{projected.rankedMastery.toFixed(1)}</strong>
                      <span className="font-mono text-xs text-emerald-300">+{gain.toFixed(1)}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${projected.confidence * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function MasterySlider({
  label,
  description,
  value,
  onChange,
  max = 100,
  step = 0.1,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-end justify-between gap-4">
        <span><strong className="text-sm text-zinc-200">{label}</strong><span className="ml-2 text-xs text-zinc-600">{description}</span></span>
        <span className="font-mono text-lg" style={{ color: label === "Kills" ? undefined : parseHexColor(value) }}>{value.toFixed(label === "Kills" ? 0 : 1)}</span>
      </span>
      <input
        type="range"
        aria-label={`${label} calculator input`}
        min={label === "Kills" ? 1 : 0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-black/35 accent-amber-200"
      />
    </label>
  );
}

function LabResult({ label, value, detail, featured = false }: { label: string; value: number; detail: string; featured?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-5", featured ? "border-amber-200/25 bg-amber-200/[.055]" : "border-white/8 bg-black/15")}>
      <div className="text-[10px] tracking-[.16em] text-zinc-600 uppercase">{label}</div>
      <div className="mt-2 font-mono text-3xl font-bold" style={{ color: featured ? parseHexColor(value) : undefined }}>{value.toFixed(1)}</div>
      <div className="mt-1 text-xs text-zinc-600">{detail}</div>
    </div>
  );
}

function FormulaToken({ value, label }: { value: number; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help rounded-lg border border-white/8 bg-white/[.035] px-2.5 py-1.5 text-zinc-300">{value.toFixed(1)}</span>
      </TooltipTrigger>
      <TooltipContent>{label} contributes {value.toFixed(1)} points.</TooltipContent>
    </Tooltip>
  );
}

function ConfidenceStory() {
  return (
    <section className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d1213]">
      <div className="grid lg:grid-cols-[.8fr_1.2fr]">
        <div className="border-b border-white/8 px-7 py-9 sm:px-10 lg:border-r lg:border-b-0 lg:px-12 lg:py-12">
          <Eyebrow>The sellable promise</Eyebrow>
          <h2 className="font-wow text-3xl leading-tight sm:text-4xl">One brilliant kill opens the door. Repetition raises the roof.</h2>
          <p className="mt-5 font-serif text-lg leading-8 text-zinc-400">
            A perfect locked parse remains visible forever, and its Mastery estimate can still be 100. Until it is repeated, Ranked Mastery stays conservative.
          </p>
          <div className="mt-7 rounded-2xl border border-amber-200/10 bg-amber-200/[.035] p-5 text-sm leading-6 text-zinc-300">
            <strong className="text-amber-200">The visual rule:</strong> never hide the estimate. Show Mastery, Confidence, and Ranked Mastery together so the discount is explainable.
          </div>
        </div>
        <div className="px-7 py-9 sm:px-10 lg:px-12 lg:py-12">
          <div className="flex min-h-56 items-end gap-3 sm:gap-5">
            {confidenceStops.map((kills) => {
              const ceiling = masteryCeiling(kills);
              return (
                <Tooltip key={kills}>
                  <TooltipTrigger asChild>
                    <div className="group flex min-w-0 flex-1 cursor-help flex-col items-center">
                      <div className="mb-2 font-mono text-xs text-zinc-500 group-hover:text-amber-200">{ceiling.toFixed(0)}</div>
                      <div className="flex h-44 w-full items-end overflow-hidden rounded-t-lg border-x border-t border-white/8 bg-black/20">
                        <div className="w-full bg-gradient-to-t from-emerald-900 via-emerald-500 to-amber-200 transition-[height] duration-500" style={{ height: `${ceiling}%` }} />
                      </div>
                      <div className="mt-3 text-center">
                        <div className="font-mono text-sm text-zinc-200">{kills}</div>
                        <div className="text-[10px] tracking-[.16em] text-zinc-600 uppercase">kill{kills === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{kills} kill{kills === 1 ? "" : "s"}: a 100 Mastery estimate can earn at most {ceiling.toFixed(1)} Ranked Mastery.</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-white/8" />
            Confidence has diminishing returns
            <span className="h-px flex-1 bg-white/8" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonLedger({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <section className="mt-10">
      <div className="mb-5">
        <Eyebrow>Same language, different careers</Eyebrow>
        <h2 className="font-wow text-3xl">The rating explains itself</h2>
      </div>
      <div className="relative overflow-x-auto styled-scrollbar rounded-[2rem] border border-white/10 bg-[#0e1314]">
        <div className="sticky left-0 border-b border-white/8 bg-[#0e1314] px-7 py-3 text-[10px] tracking-[.16em] text-zinc-600 uppercase sm:hidden">
          Swipe to compare every measure →
        </div>
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 text-[10px] tracking-[.2em] text-zinc-600 uppercase">
              <th className="px-7 py-5 font-medium">Player</th>
              <th className="px-5 py-5 font-medium">Peak</th>
              <th className="px-5 py-5 font-medium">Typical</th>
              <th className="px-5 py-5 font-medium">Floor</th>
              <th className="px-5 py-5 font-medium">Evidence</th>
              <th className="px-5 py-5 font-medium">Mastery</th>
              <th className="px-5 py-5 font-medium">Ranked</th>
              <th className="px-5 py-5 font-medium">Renown</th>
            </tr>
          </thead>
          <tbody>
            {MASTERY_PLAYERS.map((player) => (
              <tr
                key={player.id}
                className={cn("border-b border-white/6 transition-colors last:border-0", selectedId === player.id ? "bg-amber-200/[.045]" : "hover:bg-white/[.025]")}
              >
                <td className="px-7 py-5">
                  <button type="button" onClick={() => onSelect(player.id)} className="flex items-center gap-3 text-left" aria-label={`Inspect ${player.name}`}>
                    <span className="size-2 rounded-full" style={{ background: player.classColor }} />
                    <span><strong className="font-wow text-lg" style={{ color: player.classColor }}>{player.name}</strong><span className="block text-xs text-zinc-600">{player.archetype}</span></span>
                  </button>
                </td>
                <ScoreCell value={player.mastery.peak} />
                <ScoreCell value={player.mastery.form} />
                <ScoreCell value={player.mastery.floor} />
                <td className="px-5 py-5"><span className="font-mono text-zinc-300">{player.performance.kills.toFixed(1)}</span><span className="ml-1 text-xs text-zinc-600">/ boss</span></td>
                <ScoreCell value={player.mastery.estimate} />
                <td className="px-5 py-5"><strong className="font-mono text-lg" style={{ color: parseHexColor(player.mastery.rankedMastery) }}>{player.mastery.rankedMastery.toFixed(1)}</strong></td>
                <td className="px-5 py-5"><strong className="font-mono text-amber-200">{player.renown.toLocaleString()}</strong><span className="ml-2 text-xs text-zinc-600">{player.renownTitle}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MethodNote() {
  return (
    <footer className="mt-10 grid gap-5 border-t border-white/8 py-8 text-xs leading-5 text-zinc-600 sm:grid-cols-[1fr_auto]">
      <p className="max-w-4xl">
        Concept prototype. Octo player names and summary statistics are real public ranking data; aggregate scope values use an illustrative average-per-boss approximation, not the proposed production aggregation. Parse values are persisted score results from the cohort and window used at scoring time—not immutable cohort snapshots.
      </p>
      <div className="flex items-center gap-2 text-zinc-500"><CircleDot className="size-3" /> Snapshot: October 31, 2026</div>
    </footer>
  );
}

function MetricBar({ label, value, weight, description }: { label: string; value: number; weight: string; description: string }) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div><span className="text-sm text-zinc-200">{label}</span><span className="ml-2 text-xs text-zinc-600">{description}</span></div>
        <div className="font-mono"><strong style={{ color: parseHexColor(value) }}>{value.toFixed(1)}</strong><span className="ml-2 text-[10px] text-zinc-600">× {weight}</span></div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full" style={{ width: `${value}%`, background: parseHexColor(value) }} /></div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={cn("rounded-xl border p-4", accent ? "border-amber-200/20 bg-amber-200/[.05]" : "border-white/8 bg-black/15")}><div className="text-[10px] tracking-[.16em] text-zinc-600 uppercase">{label}</div><div className={cn("mt-1 font-mono text-2xl font-bold", accent && "text-amber-200")}>{value}</div></div>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/8 bg-black/15 px-2 py-3"><div className="font-mono font-bold" style={{ color: parseHexColor(value) }}>{value.toFixed(1)}</div><div className="mt-1 text-[9px] tracking-[.14em] text-zinc-600 uppercase">{label}</div></div>;
}

function ScoreCell({ value }: { value: number }) {
  return <td className="px-5 py-5 font-mono" style={{ color: parseHexColor(value) }}>{value.toFixed(1)}</td>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[.24em] text-emerald-300/75 uppercase"><Flame className="size-3" />{children}</div>;
}
