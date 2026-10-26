import type { HeroPlayback } from "./LandingHero";

/** One beat in a death card's last-ten-seconds strip. */
export interface HeroDeathBeat {
  /** How long before the death it landed, in ms (0 is the death). */
  beforeMs: number;
  kind: "hit" | "heal" | "killing_blow";
  amount: number;
}

/** A player death's recap, from the Instance page's deaths processor. */
export interface HeroDeathRecap {
  /** Ms from the instance's start, like the featured payload's death offsets. */
  offsetMs: number;
  victimName: string;
  /** The ability that landed the killing blow, when the log names it. */
  killingBlow: string | null;
  beats: HeroDeathBeat[];
}

/** What the live 3D hero reports to the shell's scrubber once it plays. */
export interface HeroReplay extends HeroPlayback {
  /** Where the replay is, in ms from the instance's start (the featured run's offsets). */
  currentMs: number;
  /** The player deaths' recaps once processed (from streams the replay already fetched); null until then. */
  deathRecaps: HeroDeathRecap[] | null;
}
