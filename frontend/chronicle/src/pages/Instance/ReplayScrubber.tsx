import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { fractionAt, timeAtFraction, type ScrubAria, type ScrubKeyOptions, type ScrubPhase, type ScrubberSource } from "./replayScrubberModel";
import { trackScrubberFocus, trackScrubberPointer } from "./replayScrubberTrack";

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
export interface TrackProps extends CommonProps {
  variant: "track";
  aria: ScrubAria & { label: string; valueText?: string };
  /** Focusable, and seeks with the keys these options allow. */
  keyboard?: ScrubKeyOptions;
  tabIndex?: number;
  /** The element whose box maps the pointer to the track (default: the slider itself). */
  measureRef?: RefObject<HTMLElement | null>;
  /** Prevent the browser's default on press (text selection, touch gestures). */
  preventDefaultOnPress?: boolean;
  /** A mouse or touch press focuses the slider (default). Off: only Tab focuses it, so a click leaves focus where it was. */
  focusOnPress?: boolean;
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

function TrackScrubber(props: TrackProps) {
  const { source, aria, className, style, children } = props;
  const draggingRef = useRef(false);
  const fraction = fractionAt(source.nowMs, source.bounds);
  const focus = trackScrubberFocus(props);
  // The drag state is read only inside the pointer handlers, never while rendering.
  const pointer = () => trackScrubberPointer(props, draggingRef);
  return (
    <div
      role="slider"
      tabIndex={focus.tabIndex}
      aria-label={aria.label}
      aria-valuemin={aria.valueMin}
      aria-valuemax={aria.valueMax}
      aria-valuenow={aria.valueNow}
      aria-valuetext={aria.valueText}
      className={className}
      style={style}
      onMouseDown={focus.onMouseDown}
      onPointerDown={(event) => pointer().onPointerDown(event)}
      onPointerMove={(event) => pointer().onPointerMove(event)}
      onPointerUp={(event) => pointer().onPointerUp(event)}
      onPointerCancel={() => pointer().onPointerCancel()}
      onKeyDown={focus.onKeyDown}
    >
      {typeof children === "function" ? children({ fraction, percent: fraction * 100 }) : children}
    </div>
  );
}
