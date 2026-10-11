import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { withOverrideBuffCasts } from "../../../EventsPanels/RotationTimeline/derive";
import { RotationTimeline, SegButton, Segmented } from "../../../EventsPanels/RotationTimeline/RotationTimeline";
import { SLOT_TEXT_COLORS } from "../../../EventsPanels/RotationTimeline/format";
import { normalizeSpellName, useRotationView } from "../../../EventsPanels/RotationTimeline/useRotationView";
import type { SpellMeta } from "../../../EventsPanels/RotationTimeline/useSpellMeta";
import { AuraSection } from "../AuraSection";
import { raisedAuraOverrides } from "../useRaisedAuras";
import { CALLOUT_SECTIONS, type Callout } from "./callouts";
import {
  HELP_DURATION_MS,
  HELP_RAISED_BUFF,
  HELP_SPELLS,
  helpCooldownInfo,
  helpGcd,
  helpPlayers,
  helpUnitName,
} from "./fixture";

/** Anchored callouts in reading order; their position here is their number. */
const NUMBERED = CALLOUT_SECTIONS.flatMap((s) => s.callouts).filter((c): c is Callout & { anchor: string } => c.anchor != null);
const numberOf = (callout: Callout) => NUMBERED.indexOf(callout as Callout & { anchor: string }) + 1;

interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where each callout's anchor is, relative to the container: the first
 * element with its data-help token that is visible inside the container.
 * Re-measured on resize and whenever the timeline's DOM changes (zoom, pan,
 * hover), at most once per frame.
 */
function useAnchorRects(container: HTMLElement | null): Map<string, AnchorRect> {
  const [rects, setRects] = useState<Map<string, AnchorRect>>(new Map());
  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = container.getBoundingClientRect();
      const next = new Map<string, AnchorRect>();
      for (const { anchor } of NUMBERED) {
        for (const el of container.querySelectorAll(`[data-help~="${anchor}"]`)) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 && r.height <= 0) continue;
          if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
          // Clip to the container so off-screen parts (a tint running past the view) don't stretch the box.
          const left = Math.max(r.left, box.left);
          const right = Math.min(r.right, box.right);
          next.set(anchor, { left: left - box.left, top: r.top - box.top, width: right - left, height: r.height });
          break;
        }
      }
      setRects(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule, true);
    };
  }, [container]);
  return rects;
}

/** Callouts for every marked element under a point, smallest element first, at most this many. */
const MAX_HOVERED = 3;

function calloutsAt(container: HTMLElement, x: number, y: number): (Callout & { anchor: string })[] {
  const hits: { area: number; callouts: (Callout & { anchor: string })[] }[] = [];
  for (const el of container.querySelectorAll<HTMLElement>("[data-help]")) {
    const r = el.getBoundingClientRect();
    // Thin lines (rails, idle gaps) get a few pixels of slack so they can be hovered.
    const slack = r.height < 6 ? 4 : 0;
    if (x < r.left || x > r.right || y < r.top - slack || y > r.bottom + slack) continue;
    const tokens = (el.dataset.help ?? "").split(" ");
    const callouts = NUMBERED.filter((c) => tokens.includes(c.anchor));
    if (callouts.length > 0) hits.push({ area: r.width * Math.max(r.height, 1), callouts });
  }
  hits.sort((a, b) => a.area - b.area);
  const out: (Callout & { anchor: string })[] = [];
  for (const hit of hits) for (const c of hit.callouts) if (!out.includes(c)) out.push(c);
  return out.slice(0, MAX_HOVERED);
}

interface PlayerTimelineHelpProps {
  onExit: () => void;
}

/**
 * Help for the Player Timeline: the real timeline and Buffs & debuffs on a
 * hard-coded fight, fully interactive, with numbered callouts on every
 * feature and a legend explaining each one.
 */
export function PlayerTimelineHelp({ onExit }: PlayerTimelineHelpProps) {
  const iconBaseUrl = useIconBaseUrl();
  const spellMeta = useCallback(
    (id: number | null): SpellMeta => {
      const spell = id != null ? HELP_SPELLS[id] : undefined;
      return {
        spell: null,
        icon: iconUrl(spell?.icon ?? "inv_misc_questionmark", iconBaseUrl),
        school: spell?.school ?? "physical",
      };
    },
    [iconBaseUrl],
  );

  // Raising is local to the help page, so trying it never touches the viewer's saved list.
  const [raised, setRaised] = useState<string[]>([HELP_RAISED_BUFF]);
  const isRaised = useCallback((name: string) => raised.some((n) => normalizeSpellName(n) === normalizeSpellName(name)), [raised]);
  const toggleRaised = useCallback(
    (name: string) =>
      setRaised((list) =>
        list.some((n) => normalizeSpellName(n) === normalizeSpellName(name))
          ? list.filter((n) => normalizeSpellName(n) !== normalizeSpellName(name))
          : [...list, name],
      ),
    [],
  );
  const players = useMemo(() => {
    const base = helpPlayers();
    const idsByName = new Map<string, number[]>();
    for (const p of base) {
      for (const seg of p.data.aurasOn) if (seg.spellId != null) idsByName.set(normalizeSpellName(seg.spellName), [seg.spellId]);
    }
    const overrides = raisedAuraOverrides(raised, idsByName);
    return base.map((p) => ({ ...p, data: withOverrideBuffCasts(p.data, overrides, HELP_DURATION_MS) }));
  }, [raised]);

  const view = useRotationView(HELP_DURATION_MS);
  const [debuffTarget, setDebuffTarget] = useState<string | null>(null);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const rects = useAnchorRects(container);
  const [active, setActive] = useState<string | null>(null);
  const [showCallouts, setShowCallouts] = useState(true);
  const activeRect = active ? rects.get(active) : undefined;
  // What the pointer is over in the example, for the description bar.
  const [hovered, setHovered] = useState<(Callout & { anchor: string })[]>([]);
  const hoverFrame = useRef(0);
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { clientX, clientY, currentTarget } = e;
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => setHovered(calloutsAt(currentTarget, clientX, clientY)));
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(hoverFrame.current);
    setHovered([]);
  };
  // A hovered badge or legend entry wins over what is under the pointer.
  const described = active ? NUMBERED.filter((c) => c.anchor === active) : hovered;

  const header = (
    <div className="flex items-center gap-2.5">
      <div data-help="players" className="flex items-center gap-2.5 text-[13px] font-semibold">
        <span style={{ color: SLOT_TEXT_COLORS[0] }}>{players[0].name}</span>
        <span className="text-xs font-normal text-muted-foreground">vs</span>
        <span style={{ color: SLOT_TEXT_COLORS[1] }}>{players[1].name}</span>
      </div>
      <Segmented label="" title="Damage or healing view" help="metric">
        <SegButton active={view.metric === "damage"} onClick={() => view.setMetric("damage")}>
          DPS
        </SegButton>
        <SegButton active={view.metric === "healing"} onClick={() => view.setMetric("healing")}>
          HPS
        </SegButton>
      </Segmented>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-[52px] flex-shrink-0 items-center gap-3.5 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" onClick={onExit} className="text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to the timeline
        </Button>
        <div className="h-5 w-px bg-border" />
        <span className="font-wow text-[15px]">Player Timeline</span>
        <span className="font-mono text-[11px] text-muted-foreground">Help · example fight</span>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setShowCallouts((v) => !v)}>
          {showCallouts ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {showCallouts ? "Hide callouts" : "Show callouts"}
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          A made-up 40 second fight between a mage and a rogue. Everything works like the real page: hover, zoom, pan and
          click. Hover a number, or an entry below, to highlight what it describes.
        </p>

        <div ref={setContainer} className="relative" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
          <div className="overflow-hidden rounded-lg border border-border">
            <RotationTimeline
              players={players}
              view={view}
              spellMeta={spellMeta}
              gcd={helpGcd}
              cooldownInfo={helpCooldownInfo}
              unitName={helpUnitName}
              headerStart={header}
            >
              <AuraSection
                players={players}
                view={view}
                spellMeta={spellMeta}
                unitName={helpUnitName}
                pickedTarget={debuffTarget}
                onPickTarget={setDebuffTarget}
                isRaised={isRaised}
                onToggleRaised={toggleRaised}
                otherOpenByDefault
              />
            </RotationTimeline>
          </div>

          {activeRect && (
            <div
              className="pointer-events-none absolute z-40 rounded-[4px] ring-2 ring-school-holy shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-school-holy)_25%,transparent)]"
              style={{
                left: activeRect.left - 3,
                top: activeRect.top - 3,
                width: activeRect.width + 6,
                height: Math.max(2, activeRect.height) + 6,
              }}
            />
          )}
          {showCallouts &&
            NUMBERED.map((c, i) => {
              const r = rects.get(c.anchor);
              if (!r) return null;
              return (
                <button
                  key={c.anchor}
                  type="button"
                  onPointerEnter={() => setActive(c.anchor)}
                  onPointerLeave={() => setActive(null)}
                  onClick={() => document.getElementById(`help-${c.anchor}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  title={c.title}
                  className={cn(
                    "absolute z-40 flex size-[18px] items-center justify-center rounded-full border border-background font-mono text-[10px] font-bold shadow",
                    active === c.anchor ? "bg-foreground text-background" : "bg-school-holy text-background",
                  )}
                  style={{ left: Math.max(0, r.left - 9), top: Math.max(0, r.top - 9) }}
                >
                  {i + 1}
                </button>
              );
            })}
        </div>

        {/* Room for the description bar, so it never covers the last legend entries. */}
        <div className="columns-1 gap-6 pb-24 md:columns-2 xl:columns-3">
          {CALLOUT_SECTIONS.map((section) => (
            <section key={section.title} className="mb-5 break-inside-avoid">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
              <ul className="flex flex-col gap-1">
                {section.callouts.map((c) => {
                  const n = numberOf(c);
                  const found = c.anchor != null && rects.has(c.anchor);
                  return (
                    <li
                      key={c.title}
                      id={c.anchor ? `help-${c.anchor}` : undefined}
                      onPointerEnter={() => c.anchor && setActive(c.anchor)}
                      onPointerLeave={() => setActive(null)}
                      className={cn(
                        "flex gap-2.5 rounded-md px-2 py-1.5 text-sm",
                        c.anchor && active === c.anchor ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                          n > 0 ? (found ? "bg-school-holy text-background" : "bg-muted text-muted-foreground") : "bg-transparent",
                        )}
                      >
                        {n > 0 ? n : "•"}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{c.title}</span>
                        <span className="ml-1.5 text-muted-foreground">{c.body}</span>
                        {n > 0 && !found && c.reveal && <span className="ml-1.5 text-[11px] italic text-school-holy">{c.reveal}.</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {showCallouts && described.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-3xl flex-col gap-2 rounded-lg border-2 border-school-holy/70 bg-zinc-950/95 px-4 py-3 shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-school-holy)_15%,transparent),0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur">
            {described.map((c) => (
              <div key={c.anchor} className="flex gap-2.5 text-sm">
                <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-school-holy font-mono text-[10px] font-bold text-background">
                  {numberOf(c)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{c.title}</span>
                  <span className="ml-1.5 text-muted-foreground">{c.body}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
