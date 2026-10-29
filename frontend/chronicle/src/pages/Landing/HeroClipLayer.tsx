import { useEffect, useRef, useState } from "react";
import type { HeroClip } from "./heroClips";

/** Below the lg breakpoint the hero is taller than wide: the portrait crop plays, as the poster's <source> picks. */
const PORTRAIT_QUERY = "(max-width: 1023px)";

/**
 * The pre-rendered replay clip over the poster: muted, inline, one pass per
 * clip (`onEnded` moves on to the next; a lone clip loops). It mounts only
 * once `start` is set (the poster has painted), so its bytes never compete
 * with the LCP image, and never with reduced motion (the poster stays).
 * The video's own poster is the clip's first frame, so the swap is invisible.
 */
export function HeroClipLayer({ clip, start, paused, loop, onEnded }: {
  clip: HeroClip;
  start: boolean;
  /** The live 3D covers the clip: stop decoding it. */
  paused: boolean;
  loop: boolean;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portrait] = useState(() => window.matchMedia?.(PORTRAIT_QUERY).matches ?? false);
  const [reducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const media = portrait ? clip.portrait : clip;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (paused) video.pause();
    // A refused autoplay (iOS Low Power Mode) leaves the first frame up.
    else video.play().catch(() => {});
  }, [paused, media, start]);

  if (reducedMotion || !start) return null;
  return (
    <video
      // A new element per clip: its sources and poster load together.
      key={media.mp4}
      ref={ref}
      aria-hidden
      muted
      playsInline
      loop={loop}
      preload="metadata"
      poster={media.poster}
      onEnded={onEnded}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_55%]"
    >
      <source src={media.webm} type="video/webm" />
      <source src={media.mp4} type="video/mp4" />
    </video>
  );
}
