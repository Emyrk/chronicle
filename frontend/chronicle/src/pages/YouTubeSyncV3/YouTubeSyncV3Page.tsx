import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
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
  const { isAuthenticated, isLoading } = useAuth()
  const params = new URLSearchParams(window.location.search)

  if (isLoading) {
    return <main className="flex h-screen items-center justify-center text-muted-foreground">Loading…</main>
  }

  if (!isAuthenticated) {
    const loginUrl = `/login?from=${encodeURIComponent("/youtube-sync-v3" + window.location.search)}`
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <p className="text-muted-foreground">You need to be logged in to use YouTube Sync.</p>
        <Button asChild>
          <Link to={loginUrl}>Sign in</Link>
        </Button>
      </main>
    )
  }

  if (params.get("role") === "controls") {
    const sessionId = params.get("session") || localStorage.getItem(ACTIVE_SESSION_KEY)
    if (!sessionId) return <main className="p-8 text-center">Reopen the wizard from the main player window.</main>
    return <Controls channelName={getYouTubeSyncV2Channel(`v3-${sessionId}`)} />
  }
  return <Player />
}
