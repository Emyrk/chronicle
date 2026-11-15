import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  fractionAt,
  scrubDrag,
  scrubKeyTarget,
  timeAtFraction,
  type ScrubAria,
  type ScrubKeyOptions,
  type ScrubPhase,
  type ScrubPointerEvent,
  type ScrubberSource,
} from "./replayScrubberModel";

/** What a scrubber's children draw from. */
export interface ReplayScrubberState {
  /** The time's place on the track, 0–1. */
  fraction: number;
  /** The same, 0–100. */
  percent: number;
}

interface CommonProps {
  source: ScrubberSource;
  disabled?: boolean;
  className?: string;
}

/** The page's native range input (the Replay bar and overlay): the browser drags and steps it. */
interface RangeProps extends CommonProps {
  variant: "range";
  ariaLabel?: string;
  /** Drawn before the input inside the wrapper (the death skulls). */
  children?: ReactNode;
}

/** A pointer-driven slider track (the mini map, the Replay strip, the landing hero). */
interface TrackProps extends CommonProps {
  variant: "track";
  aria: ScrubAria & { label: string; valueText?: string };
  /** Focusable, and seeks with the keys these options allow. */
  keyboard?: ScrubKeyOptions;
  tabIndex?: number;
  /** The element whose box maps the pointer to the track (default: the slider itself). */
  measureRef?: RefObject<HTMLElement | null>;
  /** Prevent the browser's default on press (text selection, touch gestures). */
  preventDefaultOnPress?: boolean;
  style?: CSSProperties;
  /** Replaces the default (seek on press and drag, nothing on release) for a host with its own drag handling. */
  onScrub?: (ms: number, phase: ScrubPhase) => void;
  onScrubCancel?: () => void;
  children: ReactNode | ((state: ReplayScrubberState) => ReactNode);
}

export type ReplayScrubberProps = RangeProps | TrackProps;

const RANGE_INPUT_CLASS = "w-full cursor-pointer accent-primary disabled:cursor-default";

/**
 * Every replay scrubber's one behaviour: where the clock's time sits on the
 * track, and seeking it by pointer, keys or the native input. Each host keeps
 * its own look through `className` and children.
 */
export function ReplayScrubber(props: ReplayScrubberProps) {
  if (props.variant === "range") return <RangeScrubber {...props} />;
  return <TrackScrubber {...props} />;
}

function RangeScrubber({ source, disabled = false, className, ariaLabel, children }: RangeProps) {
  const percent = fractionAt(source.nowMs, source.bounds) * 100;
  return (
    <div className={className}>
      {children}
      <input
        type="range"
        value={percent}
        min={0}
        max={100}
        step={0.1}
        onChange={(event) => {
          if (source.bounds) source.seek(timeAtFraction(Number(event.target.value) / 100, source.bounds));
        }}
        disabled={disabled}
        className={RANGE_INPUT_CLASS}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function TrackScrubber({
  source,
  disabled = false,
  className,
  aria,
  keyboard,
  tabIndex,
  measureRef,
  preventDefaultOnPress = false,
  style,
  onScrub,
  onScrubCancel,
  children,
}: TrackProps) {
  const draggingRef = useRef(false);
  const fraction = fractionAt(source.nowMs, source.bounds);

  const rectOf = (event: PointerEvent<HTMLDivElement>) => (measureRef?.current ?? event.currentTarget).getBoundingClientRect();
  const handle = (pointer: ScrubPointerEvent) => {
    const next = scrubDrag(draggingRef.current, pointer, disabled);
    draggingRef.current = next.dragging;
    if (!next.scrub || !source.bounds) return;
    const ms = timeAtFraction(next.scrub.fraction, source.bounds);
    if (onScrub) onScrub(ms, next.scrub.phase);
    else if (next.scrub.phase !== "end") source.seek(ms);
  };

  const onKeyDown = keyboard
    ? (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || !source.bounds) return;
      const target = scrubKeyTarget(event.key, source.nowMs ?? source.bounds.startMs, source.bounds, keyboard);
      if (target === null) return;
      event.preventDefault();
      source.seek(target);
    }
    : undefined;

  return (
    <div
      role="slider"
      tabIndex={tabIndex ?? (keyboard ? 0 : undefined)}
      aria-label={aria.label}
      aria-valuemin={aria.valueMin}
      aria-valuemax={aria.valueMax}
      aria-valuenow={aria.valueNow}
      aria-valuetext={aria.valueText}
      className={className}
      style={style}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        if (preventDefaultOnPress) event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        handle({ type: "down", button: event.button, clientX: event.clientX, rect: rectOf(event) });
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        handle({ type: "move", clientX: event.clientX, rect: rectOf(event) });
      }}
      onPointerUp={(event) => {
        handle({ type: "up", clientX: event.clientX, rect: rectOf(event) });
      }}
      onPointerCancel={() => {
        draggingRef.current = scrubDrag(draggingRef.current, { type: "cancel" }).dragging;
        onScrubCancel?.();
      }}
      onKeyDown={onKeyDown}
    >
      {typeof children === "function" ? children({ fraction, percent: fraction * 100 }) : children}
    </div>
  );
}
