import { useEffect, useState } from "react"
import { YouTubeSyncPage } from "../YouTubeSync/YouTubeSyncPage"
import { YouTubeSyncV2Player } from "./YouTubeSyncV2Player"
import { getYouTubeSyncV2Channel } from "./channel"

const WINDOW_STORAGE_KEY = "chronicle-youtube-sync-v2-window"
const SETTINGS_STORAGE_KEY = "chronicle-youtube-sync-v2-settings-v4"
const SESSION_STORAGE_KEY = "chronicle-youtube-sync-v2-session"
const ACTIVE_SESSION_STORAGE_KEY = "chronicle-youtube-sync-v2-active-session"

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function YouTubeSyncV2Controls({ channelName }: { channelName: string }) {
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
      remoteControlChannel={channelName}
      settingsStorageKey={SETTINGS_STORAGE_KEY}
      initialTimeOffsetHours={0}
      initialIntervalSeconds={600}
    />
  )
}

function YouTubeSyncV2PlayerRoute() {
  const [sessionId] = useState(() => {
    const storedSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (storedSessionId) return storedSessionId
    const newSessionId = createSessionId()
    sessionStorage.setItem(SESSION_STORAGE_KEY, newSessionId)
    return newSessionId
  })

  useEffect(() => {
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId)
  }, [sessionId])

  return (
    <YouTubeSyncV2Player
      channelName={getYouTubeSyncV2Channel(sessionId)}
      sessionId={sessionId}
    />
  )
}

export function YouTubeSyncV2Page() {
  const params = new URLSearchParams(window.location.search)
  const role = params.get("role")

  if (role === "controls") {
    const sessionId = params.get("session") || localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
    if (!sessionId) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground dark">
          <p className="max-w-md text-center text-muted-foreground">
            This control window is not paired with a player. Reopen it from the main YouTube Sync V2 window.
          </p>
        </main>
      )
    }
    if (!params.get("session")) {
      const repairedUrl = new URL(window.location.href)
      repairedUrl.searchParams.set("role", "controls")
      repairedUrl.searchParams.set("session", sessionId)
      window.history.replaceState(null, "", repairedUrl)
    }
    return <YouTubeSyncV2Controls channelName={getYouTubeSyncV2Channel(sessionId)} />
  }

  return <YouTubeSyncV2PlayerRoute />
}
