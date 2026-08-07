const YOUTUBE_SYNC_V2_CHANNEL_PREFIX = "chronicle-youtube-sync-v2"

export function getYouTubeSyncV2Channel(sessionId: string): string {
  return `${YOUTUBE_SYNC_V2_CHANNEL_PREFIX}:${sessionId}`
}

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
