import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { LandingFeaturedBoss } from "@/api/typesGenerated";

/** The ticker's drift, in px per second. */
const TICKER_SPEED = 30;
/** The rail's gap between chips (gap-2), also between the chips and their copy. */
const GAP_PX = 8;

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Whether `group` (the chips) overflows `rail`, and while it does (and `enabled`), drifts the rail's scroll left like a
 * news ticker, wrapping seamlessly onto the chips' copy after them. Holds still while `paused` or with reduced motion;
 * a manual scroll is kept and carried on from.
 */
function useTicker(
  rail: React.RefObject<HTMLDivElement | null>,
  group: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  paused: boolean,
) {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const railElement = rail.current;
    const groupElement = group.current;
    if (!enabled || !railElement || !groupElement) {
      setOverflows(false);
      return;
    }
    const measure = () => {
      const style = getComputedStyle(railElement);
      const inner = railElement.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setOverflows(groupElement.offsetWidth > inner);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(railElement);
    observer.observe(groupElement);
    return () => observer.disconnect();
  }, [enabled, group, rail]);

  const ticking = enabled && overflows;
  useEffect(() => {
    const railElement = rail.current;
    const groupElement = group.current;
    if (!ticking || paused || !railElement || !groupElement) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = performance.now();
    // Sub-pixel progress: scrollLeft rounds, so keep our own position.
    let position = railElement.scrollLeft;
    let frame = requestAnimationFrame(function tick(now) {
      const period = groupElement.offsetWidth + GAP_PX;
      if (Math.abs(railElement.scrollLeft - position) > 2) position = railElement.scrollLeft;
      position += (Math.min(now - last, 100) / 1000) * TICKER_SPEED;
      if (position >= period) position -= period;
      railElement.scrollLeft = position;
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [group, paused, rail, ticking]);
  return ticking;
}

/**
 * Every boss pull of the playing run as a row of chips under the replay; picking one re-scopes the hero to that pull.
 * One fixed height, held while the featured runs load (`bosses` undefined), so the sections below never shift.
 * `ticker`: when the chips overflow they drift past like a news ticker (looping), pausing under the pointer, focus or touch.
 */
export function BossRail({ bosses, selectedId, onPick, label = true, ticker = false, overlay = false }: {
  bosses: readonly LandingFeaturedBoss[] | undefined;
  selectedId: string | null;
  onPick: (encounterId: string) => void;
  /** The "Bosses" caption before the chips. */
  label?: boolean;
  ticker?: boolean;
  /** Inside the hero, over the replay: no band of its own (background, border, page gutter). */
  overlay?: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const ticking = useTicker(railRef, groupRef, ticker && !!bosses?.length, hovered || focused || touched);

  if (bosses && bosses.length === 0) return null;

  const chips = (copy: boolean) => bosses?.map((boss) => {
    const selected = boss.id === selectedId;
    return (
      <button
        key={boss.id}
        type="button"
        aria-pressed={copy ? undefined : selected}
        tabIndex={copy ? -1 : undefined}
        onClick={() => onPick(boss.id)}
        className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-l-[3px] py-2 pl-2.5 pr-3 text-left text-[13px] font-semibold tracking-wide text-foreground hover:brightness-125 lg:min-h-0 ${
          selected ? "border-l-primary bg-primary-darker" : boss.kill ? "border-l-[#22c55e] bg-card" : "border-l-[#f0a8a8] bg-card"
        }`}
      >
        {boss.kill
          ? <CircleCheck className="h-3.5 w-3.5 text-[#22c55e]" aria-label="Kill" />
          : <CircleX className="h-3.5 w-3.5 text-[#f0a8a8]" aria-label="Wipe" />}
        <span>{boss.name}</span>
        <span className="font-mono text-[11px] font-normal text-muted-foreground">{formatDuration(boss.end_offset_ms - boss.start_offset_ms)}</span>
      </button>
    );
  });

  return (
    <section aria-label="Bosses of this run" className={overlay ? undefined : "border-b bg-background"}>
      <div
        ref={railRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
        className={`flex h-16 items-center gap-2 overflow-x-auto ${overlay ? "" : "mx-auto max-w-[1180px] px-4 lg:px-8"} ${
          ticker ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "styled-scrollbar"
        } ${ticking ? "[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]" : ""}`}
      >
        {bosses && label && <span className="mr-1 whitespace-nowrap text-xs text-muted-foreground">Bosses</span>}
        <div ref={groupRef} className="flex shrink-0 items-center gap-2">{chips(false)}</div>
        {/* The ticker's copy after the chips, so the loop wraps without a gap; hidden from assistive tech. */}
        {ticking && <div aria-hidden className="flex shrink-0 items-center gap-2">{chips(true)}</div>}
      </div>
    </section>
  );
}
