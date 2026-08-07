export const YOUTUBE_SYNC_V2_CHANNEL = "chronicle-youtube-sync-v2"

export type PlayerCommand =
  | { type: "controller-hello" }
  | { type: "load-video"; videoId: string }
  | { type: "seek"; time: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "capture-picker"; active: boolean }

export type PlayerEvent =
  | { type: "player-state"; currentTime: number; duration: number; isPlaying: boolean; ready: boolean }
  | { type: "player-hello" }
