import type { HeroPlayback } from "./LandingHero";

/** What the live 3D hero reports to the shell's scrubber once it plays. */
export interface HeroReplay extends HeroPlayback {
  /** Where the replay is, in ms from the instance's start (the featured run's offsets). */
  currentMs: number;
}
