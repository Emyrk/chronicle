import type { ReactNode } from "react";
import { MAP_CONTROL_KEYBINDS } from "@/pages/Instance/EventsPanels/Map/mapControls";
import { healthBarColor, MAX_HEALTH_BARS, RECENT_HEALTH_MS } from "@/pages/Instance/EventsPanels/Map/mapModel";
import { BAR_ABSORB, BAR_BACKGROUND, BAR_DEAD, BAR_HEAL, hexCss, WALK_AVATAR_COLOR } from "@/pages/Instance/EventsPanels/Map/mapPalette";
import { ABOVE_DISC_MODES, CAST_MODES } from "@/pages/Instance/EventsPanels/Map/mapViewSettings";
import { HEAL_COLOR, HEAL_CRIT_COLOR, OVERHEAL_COLOR, SCHOOL_TOKENS, schoolColor } from "@/pages/Instance/EventsPanels/Map/replayEffects";
import { DASH_ART_SIZE, DISPEL_COLORS, DISPEL_ORDER, HALO_COLORS, OWNER_LINE, TARGET_LINE, TOKEN_LAYOUT, type HaloKind } from "@/pages/Instance/EventsPanels/Map/unitTokenArt";
import { participantColor } from "@/pages/Instance/liveSessionProtocol";
import { POWER_COLORS } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrameShared";
import { At, BossToken, Ground, Token, useClock } from "./legendArt";
import {
  BoltDemo,
  CastIconDemo,
  CombatTextDemo,
  DEMO_SLOWDOWN,
  EFFECT_TIMINGS,
  HealDemo,
  HitDemo,
  MeleeDemo,
  StreakDemo,
} from "./legendEffects";

/**
 * What everything on the replay map's 3D view means: tokens, halos, target
 * lines, effects, bars and controls. Shown in two places: the /map-legend
 * page (Tools & FAQ) and the Map panel's "?" explainer. Drawn with the map's
 * own token art and constants so it stays in step with the map; keep it that
 * way with the replay-map skill (.agents/skills/replay-map).
 */

const halo = (kind: HaloKind) => hexCss(HALO_COLORS[kind]);
const cycle = (seconds: number, period: number) => (seconds % period) / period;
const ms = (value: number) => (value >= 1000 ? `${value / 1000}s` : `${value}ms`);

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="mb-1 text-xl font-semibold">{title}</h2>
      {note && <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>;
}

function Card({ title, children, demo, timing }: { title: string; children: ReactNode; demo: ReactNode; timing?: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      {demo}
      <figcaption className="flex flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2 text-sm font-semibold">
          {title}
          {timing && <span className="font-mono text-[11px] font-normal text-muted-foreground">{timing}</span>}
        </span>
        <span className="text-xs text-muted-foreground">{children}</span>
      </figcaption>
    </figure>
  );
}

function Swatch({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-3 w-3 shrink-0 rounded-sm border border-black/50" style={{ background: color }} />
      {label}
    </span>
  );
}

// A target line drawn as the map draws it: a ribbon of repeating dashes (drawDash) moving toward the target.
function TargetLine({ from, to, color, dotted, seconds }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; dotted?: boolean; seconds: number }) {
  const scale = 0.06;
  const period = DASH_ART_SIZE.width * scale * (dotted ? 0.6 : 1);
  const dash = (dotted ? 16 : 36) / DASH_ART_SIZE.width;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={color}
      strokeWidth={(dotted ? TARGET_LINE.targetsTargetWidth : TARGET_LINE.width) * 8}
      strokeDasharray={`${period * dash} ${period * (1 - dash)}`}
      strokeDashoffset={-seconds * TARGET_LINE.speed * period * (dotted ? 1 / 0.6 : 1)}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      opacity={dotted ? TARGET_LINE.targetsTargetOpacity : TARGET_LINE.opacity}
    />
  );
}

// An owner line as the map draws it: thin, the owner's colour, dimmed unless lit.
function OwnerLine({ from, to, color, lit = false }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; lit?: boolean }) {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={color}
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      opacity={OWNER_LINE.opacity}
      style={lit ? undefined : { filter: `brightness(${OWNER_LINE.dim})` }}
    />
  );
}

function Lines({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">{children}</svg>;
}

function HealthBar({ fraction, healed = 0, absorb = 0, dead = false }: { fraction: number; healed?: number; absorb?: number; dead?: boolean }) {
  return (
    <div className="relative h-2.5 w-28 overflow-hidden rounded-[2px] border border-black" style={{ background: hexCss(dead ? BAR_DEAD : BAR_BACKGROUND) }}>
      {!dead && (
        <>
          <div className="absolute inset-y-0 left-0" style={{ width: `${fraction * 100}%`, background: healthBarColor(fraction) }} />
          {healed > 0 && <div className="absolute inset-y-0" style={{ left: `${(fraction - healed) * 100}%`, width: `${healed * 100}%`, background: hexCss(BAR_HEAL) }} />}
          {absorb > 0 && <div className="absolute inset-y-0" style={{ left: `${fraction * 100}%`, width: `${absorb * 100}%`, background: hexCss(BAR_ABSORB) }} />}
        </>
      )}
    </div>
  );
}

const MAGE = { ring: "var(--color-class-mage)", icon: "/c/icons/spec_mage_frost.png" };
const PALADIN = { ring: "var(--color-class-paladin)", icon: "/c/icons/spec_paladin_holy.png" };
const SHAMAN = { ring: "var(--color-class-shaman)", icon: "/c/icons/spec_shaman_restoration.png" };
const WARRIOR = { ring: "var(--color-class-warrior)", icon: "/c/icons/class_warrior.png" };
const HUNTER = { ring: "var(--color-class-hunter)", icon: "/c/icons/spec_hunter_beastmastery.png" };

export function MapLegend() {
  const seconds = useClock();
  const castFraction = cycle(seconds, 2.5);
  const frost = schoolColor(6);
  const nature = schoolColor(5);
  const bob = { x: 50, y: 34 };
  const tank = { x: 66, y: 50 };
  const caster = { x: 22, y: 70 };
  const healer = { x: 80, y: 74 };
  return (
    <div>
      <Section id="overview" title="On the map" note="A selected mage (white halo) casting Frostbolt at the boss (orange), which is hitting its tank (purple, dashed). The healer is pinned (gold).">
        <Ground height={260}>
          <Lines>
            <TargetLine from={caster} to={bob} color={frost} seconds={seconds} />
            <TargetLine from={bob} to={tank} color={halo("targetsTarget")} dotted seconds={seconds} />
          </Lines>
          <At x={bob.x} y={bob.y}><BossToken seconds={seconds} facing={130} halo="target" model={false} /></At>
          <At x={tank.x} y={tank.y}><Token ring="var(--color-class-warrior)" icon="/c/icons/class_warrior.png" facing={-50} halo="targetsTarget" /></At>
          <At x={caster.x} y={caster.y}><Token {...MAGE} facing={55} halo="selected" cast={{ fraction: castFraction, color: frost }} /></At>
          <At x={healer.x} y={healer.y}><Token {...SHAMAN} facing={-80} pinned cast={{ fraction: cycle(seconds + 1, 3), color: nature }} /></At>
          <At x={10} y={40}><Token {...HUNTER} dead facing={70} /></At>
          <At x={38} y={58}><Token kind="pet" ring="#67e8f9" facing={20} /></At>
        </Ground>
      </Section>

      <Section id="tokens" title="Unit tokens" note="Flat discs that lie on the ground, so the space above them stays free for one live value.">
        <Grid>
          <Card title="Player" demo={<Ground><At x={50} y={55}><Token {...MAGE} facing={20} /></At></Ground>}>
            A ring in their class colour around their spec&apos;s icon (their class icon when the spec is unknown), with a coin-like edge and a shadow.
          </Card>
          <Card title="Guardian" demo={<Ground><At x={50} y={55}><Token kind="pet" ring="#67e8f9" facing={20} /></At></Ground>}>
            Anything a player owns (pets, summons, totems): a smaller disc with a paw.
          </Card>
          <Card title="Enemy" demo={<Ground><At x={50} y={55}><Token kind="hostile" ring="#fb7185" facing={200} /></At></Ground>}>
            Enemy red, with a dark red well instead of an icon. Units with a 3D model show the model instead.
          </Card>
          <Card title="Facing" demo={<Ground><At x={50} y={55}><Token {...MAGE} facing={(seconds * 40) % 360} /></At></Ground>}>
            The notch on the ring points where the unit faces and turns on the ground. When the log doesn&apos;t record facing, enemies face whoever they last hit and everyone else shows no notch.
          </Card>
          <Card title="Casting" demo={<Ground><At x={50} y={55}><Token {...SHAMAN} cast={{ fraction: cycle(seconds, 3), color: nature }} /></At></Ground>}>
            An arc fills clockwise round the ring in the spell school&apos;s colour as the cast bar runs.
          </Card>
          <Card title="Dead" demo={<Ground><At x={50} y={55}><Token {...HUNTER} dead facing={100} /></At></Ground>}>
            The ring and edge go grey, the icon darkens and a skull sits on it, until the unit is resurrected.
          </Card>
          <Card title="Muted" demo={<Ground><At x={35} y={55}><Token {...MAGE} /></At><At x={68} y={55}><Token {...PALADIN} muted /></At></Ground>}>
            While players are selected in the page&apos;s filter, everyone else fades to {Math.round(TOKEN_LAYOUT.mutedOpacity * 100)}%.
          </Card>
        </Grid>
      </Section>

      <Section id="debuffs" title="Debuffs" note={`A player with a dispellable debuff takes its colour: a wash over the icon and a glow round the ring. With several, the first of ${DISPEL_ORDER.join(", ")} shows.`}>
        <Grid min={170}>
          {DISPEL_ORDER.map((kind) => (
            <Card key={kind} title={kind[0].toUpperCase() + kind.slice(1)} demo={<Ground height={120}><At x={50} y={55}><Token {...[MAGE, PALADIN, HUNTER, SHAMAN][DISPEL_ORDER.indexOf(kind)]} dispel={kind} /></At></Ground>}>
              <Swatch color={DISPEL_COLORS[kind]} label={DISPEL_COLORS[kind]} />
            </Card>
          ))}
        </Grid>
      </Section>

      <Section id="bosses" title="Bosses" note="A sigil, not a disc: bigger than a player, enemy red, its tick ring turning slowly. The three diamonds and the notch turn with its facing.">
        <Grid min={200}>
          <Card title="With a model" demo={<Ground height={170}><At x={50} y={70}><BossToken seconds={seconds} facing={200} /></At></Ground>}>
            The boss&apos;s model stands on the sigil.
          </Card>
          <Card title="No model" demo={<Ground height={170}><At x={50} y={75}><BossToken seconds={seconds} facing={200} model={false} /></At></Ground>}>
            A hexagon pin rises from the sigil so the boss still reads as a figure.
          </Card>
          <Card title="Casting" demo={<Ground height={170}><At x={50} y={75}><BossToken seconds={seconds} model={false} cast={{ fraction: cycle(seconds, 3), color: nature }} /></At></Ground>}>
            The cast arc wraps the sigil.
          </Card>
          <Card title="Dead" demo={<Ground height={170}><At x={50} y={75}><BossToken seconds={seconds} model={false} dead /></At></Ground>}>
            Sigil and pin go grey.
          </Card>
        </Grid>
      </Section>

      <Section id="halos" title="Halos and pins" note="Click a unit (on the map or in the raid frames) to select it. Its target and its target's target light up too, as in the unit frames at the bottom of the map.">
        <Grid min={190}>
          <Card title="Selected" demo={<Ground><At x={50} y={55}><Token {...MAGE} halo="selected" /></At></Ground>}>
            White. One unit at a time; it drives the target lines and the Selected frame.
          </Card>
          <Card title="Target" demo={<Ground><At x={50} y={55}><Token {...PALADIN} halo="target" /></At></Ground>}>
            Orange: the unit the selected one last started a spell on.
          </Card>
          <Card title="Target's target" demo={<Ground><At x={50} y={55}><Token {...HUNTER} halo="targetsTarget" /></At></Ground>}>
            Purple and dashed: who that target is acting on, one step removed.
          </Card>
          <Card title="Pinned" demo={<Ground><At x={50} y={55}><Token {...SHAMAN} pinned /></At></Ground>}>
            Gold with a diamond. Pin a unit frame to keep it as a movable box; several can be pinned, on top of the other halos.
          </Card>
        </Grid>
      </Section>

      <Section id="lines" title="Lines" note="Target lines run only along the selected chain, never from pinned units; their dashes run toward the target. Owner lines tie every guardian to its player.">
        <Grid min={300}>
          <Card title="Selected → target" demo={
            <Ground height={150}>
              <Lines><TargetLine from={{ x: 22, y: 70 }} to={{ x: 74, y: 36 }} color={frost} seconds={seconds} /></Lines>
              <At x={22} y={70}><Token {...MAGE} facing={55} halo="selected" cast={{ fraction: castFraction, color: frost }} /></At>
              <At x={74} y={36}><Token kind="hostile" ring="#fb7185" halo="target" facing={230} /></At>
            </Ground>
          }>
            Dashes in the cast&apos;s school colour while the selected unit casts, its class colour otherwise.
          </Card>
          <Card title="Target → target's target" demo={
            <Ground height={150}>
              <Lines><TargetLine from={{ x: 30, y: 40 }} to={{ x: 76, y: 70 }} color={halo("targetsTarget")} dotted seconds={seconds} /></Lines>
              <At x={30} y={40}><Token kind="hostile" ring="#fb7185" halo="target" facing={120} /></At>
              <At x={76} y={70}><Token ring="var(--color-class-warrior)" icon="/c/icons/class_warrior.png" halo="targetsTarget" facing={-60} /></At>
            </Ground>
          }>
            The second hop: a thinner purple dotted line.
          </Card>
          <Card title="Guardian → owner" demo={
            <Ground height={150}>
              <Lines>
                <OwnerLine from={{ x: 16, y: 72 }} to={{ x: 34, y: 42 }} color="var(--color-class-hunter)" />
                <OwnerLine from={{ x: 64, y: 74 }} to={{ x: 82, y: 40 }} color="var(--color-class-warlock)" lit />
              </Lines>
              <At x={16} y={72}><Token kind="pet" ring="#67e8f9" facing={30} /></At>
              <At x={34} y={42}><Token {...HUNTER} facing={150} /></At>
              <At x={64} y={74}><Token kind="pet" ring="#67e8f9" facing={30} /></At>
              <At x={82} y={40}><Token ring="var(--color-class-warlock)" icon="/c/icons/class_warlock.png" halo="selected" facing={200} /></At>
            </Ground>
          }>
            A thin line in the owner&apos;s colour from each pet, summon or totem to its player: faint, and bright while either one is selected, a target or pinned.
          </Card>
        </Grid>
      </Section>

      <Section id="above" title="Above the token" note={<>Optionally, health rises as a column from every player's token, with power (mana, rage, energy) in a thinner, shorter one beside it (off by default). Turn it on in Map settings → Display → <em>Above the token</em>.</>}>
        <Grid min={240}>
          {ABOVE_DISC_MODES.map((mode) => (
            <Card key={mode.value} title={mode.label} demo={
              <Ground height={150}>
                {[0.92, 0.54, 0.18].map((value, index) => (
                  <At key={value} x={22 + index * 28} y={82}>
                    <Token
                      {...[PALADIN, MAGE, WARRIOR][index]}
                      column={mode.value === "health" ? { value, color: healthBarColor(value), power: { value: [0.35, 0.8, 0.6][index], color: POWER_COLORS[["mana", "mana", "rage"][index]] } } : null}
                    />
                  </At>
                ))}
              </Ground>
            }>
              {mode.title}.
            </Card>
          ))}
        </Grid>
      </Section>

      <Section id="effects" title="Combat effects" note={`Short animations replay what happened at each moment of the fight (shown here at 1/${DEMO_SLOWDOWN} speed; the times are the map's). Turn them off, or limit them to selected players, in Map settings → Effects.`}>
        <Grid>
          <Card title="Spell" timing={ms(EFFECT_TIMINGS.bolt)} demo={<BoltDemo seconds={seconds} color={frost} />}>
            A bolt in the spell&apos;s school colour flies from caster to target; thicker on crits.
          </Card>
          <Card title="Ranged auto-attack" timing={ms(EFFECT_TIMINGS.streak)} demo={<StreakDemo seconds={seconds} />}>
            A short thin white streak.
          </Card>
          <Card title="Melee" timing={`${ms(EFFECT_TIMINGS.lunge)} · ${ms(EFFECT_TIMINGS.slash)}`} demo={<MeleeDemo seconds={seconds} />}>
            The attacker lunges in and back and a slash sweeps across the target; melee abilities also burst under it.
          </Card>
          <Card title="Hit" timing={ms(EFFECT_TIMINGS.hit)} demo={<HitDemo seconds={seconds} />}>
            The target shakes and flashes in the damage&apos;s colour ({ms(EFFECT_TIMINGS.meleeFlash)} for melee).
          </Card>
          <Card title="Interrupt" timing={ms(EFFECT_TIMINGS.interrupt)} demo={<HitDemo seconds={seconds} interrupt />}>
            A strong white shake on the interrupted caster.
          </Card>
          <Card title="Heal" timing={ms(EFFECT_TIMINGS.heal)} demo={<HealDemo seconds={seconds} />}>
            A green bolt to the target and a ring rising up it, bigger for bigger heals.
          </Card>
          <Card title="Critical heal" timing={ms(EFFECT_TIMINGS.heal)} demo={<HealDemo seconds={seconds} crit />}>
            The rising ring turns gold. Overheal can be shown too, in grey (Map settings → Effects).
          </Card>
        </Grid>
      </Section>

      <Section id="casts" title="Cast icons" note={<>The spell&apos;s icon floats over a caster (slowed down here too). Who gets them is set in Map settings → Effects → <em>Cast icons</em>: {CAST_MODES.map((mode) => `${mode.label} (${mode.title.toLowerCase()})`).join("; ")}.</>}>
        <Grid>
          <Card title="Casting" demo={<CastIconDemo seconds={seconds} mode="casting" />}>
            Grows in, then an outline sweeps round the icon as the cast bar runs.
          </Card>
          <Card title="Cast goes off" timing={ms(EFFECT_TIMINGS.castIcon)} demo={<CastIconDemo seconds={seconds} mode="instant" />}>
            Pops with a white ring flash, then fades.
          </Card>
          <Card title="Interrupted" timing={ms(EFFECT_TIMINGS.interruptedIcon)} demo={<CastIconDemo seconds={seconds} mode="interrupted" />}>
            Greys out with a wiggle; the outline freezes where it was cut and enemy casts are labelled.
          </Card>
        </Grid>
      </Section>

      <Section id="text" title="Combat text" note={`Text floats up over the target for ${ms(EFFECT_TIMINGS.combatText)}.`}>
        <Grid min={300}>
          <Card title="Spell names and heals" demo={<CombatTextDemo seconds={seconds} />}>
            Damage shows the spell&apos;s name in its school colour (larger on crits; never for auto-attacks, and not for casters showing cast icons).
            Heals show the amount healed in green, or the overheal in grey.
          </Card>
          <div className="flex flex-col justify-center gap-2 text-sm">
            <Swatch color={HEAL_COLOR} label="Healing" />
            <Swatch color={HEAL_CRIT_COLOR} label="Critical heal (pulse)" />
            <Swatch color={OVERHEAL_COLOR} label="Overheal" />
          </div>
        </Grid>
      </Section>

      <Section id="bars" title="Health bars" note={`Over bosses, selected players and units whose health changed in the last ${ms(RECENT_HEALTH_MS)}, up to ${MAX_HEALTH_BARS} at once. Toggle them in Map settings → Display.`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Healthy", bar: <HealthBar fraction={0.95} /> },
            { label: "Hurt: the fill runs green to amber to red", bar: <HealthBar fraction={0.42} /> },
            { label: "Just healed: the pale chunk at the end of the fill", bar: <HealthBar fraction={0.7} healed={0.15} /> },
            { label: "Absorb shield, after the fill", bar: <HealthBar fraction={0.6} absorb={0.2} /> },
            { label: "Dead", bar: <HealthBar fraction={0} dead /> },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">{row.bar}<span className="text-muted-foreground">{row.label}</span></div>
          ))}
        </div>
      </Section>

      <Section id="schools" title="Spell school colours" note="Bolts, hits, cast arcs, combat text and the selected unit's target line are coloured by spell school.">
        <div className="flex flex-wrap gap-4">
          {Object.values(SCHOOL_TOKENS).map((name) => (
            <Swatch key={name} color={`var(--color-school-${name})`} label={name[0].toUpperCase() + name.slice(1)} />
          ))}
        </div>
      </Section>

      <Section id="frames" title="Unit frames" note="Selecting a unit also opens WoW-style frames over the map.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li><strong className="text-foreground">Selected</strong>, left of centre: health, power, cast bar and auras.</li>
          <li><strong className="text-foreground">Target</strong>, right of centre: whoever the selected unit last started a spell on.</li>
          <li><strong className="text-foreground">Target&apos;s target</strong>, a small frame off the Target&apos;s right, without auras.</li>
          <li>The pin on a frame keeps it as a box you can drag anywhere; the X clears the selection.</li>
          <li>The camera button follows that unit with the camera (on the 3D map); press it again, or drag the camera, to stop. Double-clicking a unit does the same.</li>
        </ul>
      </Section>

      <Section id="walk" title="Walk mode and live sessions">
        <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
          <p>
            <Swatch color={hexCss(WALK_AVATAR_COLOR)} label={<strong className="text-foreground">Walk mode</strong>} /> (press G over the map, or the footprints button)
            puts you on the ground as a gold figure to join the fight; zoom all the way in for first person.
          </p>
          <p>
            <span className="inline-flex gap-1 align-middle">
              {["leader", "a1b2c3", "f9e8d7"].map((id) => <span key={id} className="h-3 w-3 rounded-sm" style={{ background: participantColor(id) }} />)}
            </span>{" "}
            <strong className="text-foreground">Live sessions</strong>: everyone else in the session shows in their cursor colour with their name,
            as a camera pointing where they look, or as a figure while they walk. Coloured dots on the panel edge show who is currently viewing the map;
            hover them for the participant list. Their shared page cursor is hidden over the 3D map because the map already shows their presence.
          </p>
        </div>
      </Section>

      <Section id="controls" title="Controls" note="With the pointer over the map (or while walking).">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {MAP_CONTROL_KEYBINDS.map((bind) => (
                <tr key={bind.keys} className="border-b last:border-0">
                  <td className="w-44 whitespace-nowrap px-3 py-2 font-mono text-xs">{bind.keys}</td>
                  <td className="px-3 py-2 text-muted-foreground">{bind.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
