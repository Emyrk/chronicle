import type { ReactNode } from "react";
import { Pin, Video, X } from "lucide-react";
import type { EmbeddedPanelRender } from "../useEmbeddedPanel";

const FRAME_WIDTH = 176;
// The target's target hangs off the target frame's right, a little lower,
// smaller and without auras, as WoW draws it.
const TARGETS_TARGET_WIDTH = 120;

interface TargetFramesProps {
  /** The clicked unit (selected), or null. */
  target: string | null;
  /** The unit the selected one last started a spell on (its target), or null. */
  targetOfTarget: string | null;
  /** The unit that one last started a spell on (WoW's target's target), or null. */
  targetsTarget: string | null;
  /** The map's Raid Frames render: health, power and casts (`u:<guid>`). */
  raidFrames: EmbeddedPanelRender;
  /** The map's Unit Auras render (`u:<guid>`). */
  auras: EmbeddedPanelRender;
  /** Turns a frame into a movable inspect box. */
  onPin: (guid: string) => void;
  onClear: () => void;
  /** The unit the camera follows, if any. */
  followGuid?: string | null;
  /** Follows a frame's unit with the camera (again to stop); absent when the map cannot follow (no 3D map). */
  onFollow?: (guid: string) => void;
}

/**
 * WoW-style unit frames over the map: the selected unit just left of centre,
 * below the middle; its target just right of centre; and that one's target
 * (target's target) hanging off the target's right, smaller and without
 * auras. Drawn by the same panels as the inspect boxes (Raid Frames' inspect
 * frame over Unit Auras) but on the map itself, with no box behind them.
 * The pin turns one into a movable inspect box.
 */
export function TargetFrames({ target, targetOfTarget, targetsTarget, raidFrames, auras, onPin, onClear, followGuid = null, onFollow }: TargetFramesProps) {
  if (!target) return null;
  const follow = (guid: string) => onFollow ? { on: followGuid === guid, toggle: () => onFollow(guid) } : undefined;
  return (
    <>
      <TargetFrame
        label="Selected"
        className="right-1/2 top-[65%] z-30 mr-20 -translate-y-1/2"
        width={FRAME_WIDTH}
        onPin={() => onPin(target)}
        follow={follow(target)}
        onClear={onClear}
      >
        {raidFrames(`u:${target}`)}
        {auras(`u:${target}`)}
      </TargetFrame>
      {targetOfTarget && (
        <TargetFrame
          label="Target"
          className="left-1/2 top-[65%] z-30 ml-20 -translate-y-1/2"
          width={FRAME_WIDTH}
          onPin={() => onPin(targetOfTarget)}
          follow={follow(targetOfTarget)}
        >
          {raidFrames(`u:${targetOfTarget}`)}
          {auras(`u:${targetOfTarget}`)}
          {targetsTarget && (
            <TargetFrame
              label="Target's target"
              className="left-full top-6 ml-2"
              width={TARGETS_TARGET_WIDTH}
              onPin={() => onPin(targetsTarget)}
              follow={follow(targetsTarget)}
            >
              {raidFrames(`u:${targetsTarget}`)}
            </TargetFrame>
          )}
        </TargetFrame>
      )}
    </>
  );
}

function TargetFrame({
  label,
  className,
  width,
  onPin,
  follow,
  onClear,
  children,
}: {
  label: string;
  /** Where the frame sits (it is absolutely positioned). */
  className: string;
  width: number;
  onPin: () => void;
  follow?: { on: boolean; toggle: () => void };
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={`absolute flex flex-col gap-1 text-white [text-shadow:0_0_2px_#000,0_0_3px_#000,0_1px_2px_#000] ${className}`}
      style={{ width }}
    >
      <div className="absolute right-0 top-0 z-10 flex gap-0.5">
        <button
          type="button"
          onClick={onPin}
          title="Pin: keep this frame and move it anywhere"
          aria-label={`Pin ${label.toLowerCase()}`}
          className="rounded p-0.5 text-white/60 hover:text-amber-300"
        >
          <Pin className="h-3 w-3" />
        </button>
        {follow && (
          <button
            type="button"
            onClick={follow.toggle}
            aria-pressed={follow.on}
            title={follow.on ? "Stop following (back to the group)" : "Follow: keep the camera on this unit"}
            aria-label={`Follow ${label.toLowerCase()}`}
            className={`rounded p-0.5 ${follow.on ? "text-sky-300" : "text-white/60 hover:text-sky-300"}`}
          >
            <Video className="h-3 w-3" />
          </button>
        )}
        {onClear && (
          <button type="button" onClick={onClear} title="Clear selection" aria-label="Clear selection" className="rounded p-0.5 text-white/60 hover:text-red-300">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
