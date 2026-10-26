/**
 * What the live 3D hero reports to the shell's scrubber chrome once it plays.
 * Type-only on the shell side, so the scrubber never imports the 3D chunk.
 */
export interface HeroReplay {
  playing: boolean;
  /** Where the replay is, in run time from the run's start. */
  elapsedMs: number;
  durationMs: number;
  /** Boss pulls: where the tick sits (0-1 of the run) and the chip that jumps there. */
  bosses: { id: string; name: string; fraction: number }[];
  /** The boss pull the replay is in or last passed, or null before the first. */
  activeBossId: string | null;
  /** Player deaths, as 0-1 fractions of the run. */
  deaths: number[];
  togglePlay: () => void;
  jumpToBoss: (id: string) => void;
}
