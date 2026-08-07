import { useEffect, useState } from "react"
import { YouTubeSyncPage } from "../YouTubeSync/YouTubeSyncPage"
import { YouTubeSyncV2Player } from "../YouTubeSyncV2/YouTubeSyncV2Player"
import { getYouTubeSyncV2Channel } from "../YouTubeSyncV2/channel"

const SETTINGS_KEY = "chronicle-youtube-sync-v3-settings"
const SESSION_KEY = "chronicle-youtube-sync-v3-session"
const ACTIVE_SESSION_KEY = "chronicle-youtube-sync-v3-active-session"

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function Controls({ channelName }: { channelName: string }) {
  useEffect(() => {
    document.title = "Chronicle YouTube Sync V3 Wizard"
  }, [])

  return (
    <YouTubeSyncPage
      controlsOnly
      wizardMode
      remoteControlChannel={channelName}
      settingsStorageKey={SETTINGS_KEY}
      initialTimeOffsetHours={0}
      initialIntervalSeconds={600}
    />
  )
}

function Player() {
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return stored
    const created = createSessionId()
    sessionStorage.setItem(SESSION_KEY, created)
    return created
  })

  useEffect(() => {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId)
  }, [sessionId])

  return (
    <YouTubeSyncV2Player
      channelName={getYouTubeSyncV2Channel(`v3-${sessionId}`)}
      sessionId={sessionId}
      controlsPath="/youtube-sync-v3"
      productName="YouTube Sync V3 Wizard"
    />
  )
}

export function YouTubeSyncV3Page() {
  const params = new URLSearchParams(window.location.search)
  if (params.get("role") === "controls") {
    const sessionId = params.get("session") || localStorage.getItem(ACTIVE_SESSION_KEY)
    if (!sessionId) return <main className="p-8 text-center">Reopen the wizard from the main player window.</main>
    return <Controls channelName={getYouTubeSyncV2Channel(`v3-${sessionId}`)} />
  }
  return <Player />
}
