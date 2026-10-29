import { useQuery } from "@tanstack/react-query";
import { IMAGES } from "./startPageStyle";

/** The pre-rendered hero clips' manifest (#1416). Media paths resolve against it, so they may be relative. */
export const CLIPS_URL = `${IMAGES}/clips/clips.json`;

/** One clip's files: H.264 and VP9/AV1 encodes and its first frame. */
export interface HeroClipMedia {
  mp4: string;
  webm: string;
  poster: string;
}

/** A row of the clip pull's damage meter; `share` is a fraction of the total (0–1). */
export interface HeroClipMeterRow {
  name: string;
  class: string;
  dps: number;
  share: number;
}

/** The clip pull's first player death; `at_ms` is from the pull's start. */
export interface HeroClipDeath {
  victim: string;
  class: string;
  at_ms: number;
  ability: string;
  amount: number;
  source: string;
}

/** The clip pull's real numbers, so the glass meter matches what plays. */
export interface HeroClipMeter {
  total: number;
  dps: number;
  rows: HeroClipMeterRow[];
  death: HeroClipDeath | null;
}

/** One entry of clips.json: a looping replay clip of a boss pull, landscape and a portrait crop for phones. */
export interface HeroClip extends HeroClipMedia {
  slug: string;
  instance_name: string;
  boss: string;
  portrait: HeroClipMedia;
  meter: HeroClipMeter;
}

function resolveMedia(media: HeroClipMedia, base: string): HeroClipMedia {
  return {
    mp4: new URL(media.mp4, base).pathname,
    webm: new URL(media.webm, base).pathname,
    poster: new URL(media.poster, base).pathname,
  };
}

/** The manifest with every media path made absolute. */
export function resolveClips(clips: HeroClip[], base: string): HeroClip[] {
  return clips.map((clip) => ({ ...clip, ...resolveMedia(clip, base), portrait: resolveMedia(clip.portrait, base) }));
}

// Its own module, not queries.ts, like useLandingFeatured: /start's first paint must not wait for the queries chunk.
export function useHeroClips() {
  return useQuery({
    queryKey: ["landing-hero-clips"],
    queryFn: async () => {
      const response = await fetch(CLIPS_URL);
      if (!response.ok) throw new Error("Failed to fetch hero clips");
      return resolveClips(await response.json() as HeroClip[], new URL(CLIPS_URL, window.location.origin).href);
    },
    staleTime: Infinity,
  });
}

/**
 * The clip index.html picked for this visit (it rotates per visit, and paints that clip's poster before the
 * bundle loads): its slug and posters, from the html element's data attributes.
 */
export function visitClip(): { slug: string; poster: string; posterPortrait: string } | null {
  const { heroClip, heroPoster, heroPosterPortrait } = document.documentElement.dataset;
  return heroClip && heroPoster && heroPosterPortrait ? { slug: heroClip, poster: heroPoster, posterPortrait: heroPosterPortrait } : null;
}
