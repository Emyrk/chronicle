import { useEffect } from "react"
import { YouTubeSyncPage } from "../YouTubeSync/YouTubeSyncPage"
import { YouTubeSyncV2Player } from "./YouTubeSyncV2Player"
import { YOUTUBE_SYNC_V2_CHANNEL } from "./channel"

const WINDOW_STORAGE_KEY = "chronicle-youtube-sync-v2-window"
const SETTINGS_STORAGE_KEY = "chronicle-youtube-sync-v2-settings-v2"

function YouTubeSyncV2Controls() {
  useEffect(() => {
    document.title = "Chronicle YouTube Sync Controls"

    const saveWindowSize = () => {
      localStorage.setItem(
        WINDOW_STORAGE_KEY,
        JSON.stringify({ width: window.outerWidth, height: window.outerHeight })
      )
    }
    const timer = window.setTimeout(saveWindowSize, 250)
    window.addEventListener("resize", saveWindowSize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", saveWindowSize)
      saveWindowSize()
    }
  }, [])

  return (
    <YouTubeSyncPage
      controlsOnly
      remoteControlChannel={YOUTUBE_SYNC_V2_CHANNEL}
      settingsStorageKey={SETTINGS_STORAGE_KEY}
      initialIntervalSeconds={600}
    />
  )
}

export function YouTubeSyncV2Page() {
  const role = new URLSearchParams(window.location.search).get("role")
  return role === "controls" ? <YouTubeSyncV2Controls /> : <YouTubeSyncV2Player />
}
