import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, MonitorPlay } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { YTPlayer } from "@/types/youtube"
import {
  type PlayerCommand,
  type PlayerEvent,
} from "./channel"

const WINDOW_STORAGE_KEY = "chronicle-youtube-sync-v2-window"

function readControlWindowSize(): { width: number; height: number } {
  try {
    const stored = JSON.parse(localStorage.getItem(WINDOW_STORAGE_KEY) || "null")
    if (stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)) {
      return { width: Math.max(420, stored.width), height: Math.max(600, stored.height) }
    }
  } catch {
    // Use defaults.
  }
  return { width: 560, height: 900 }
}

export function YouTubeSyncV2Player({
  channelName,
  sessionId,
  controlsPath = "/youtube-sync-v2",
  productName = "YouTube Sync V2",
}: {
  channelName: string
  sessionId: string
  controlsPath?: string
  productName?: string
}) {
  const playerRef = useRef<YTPlayer | null>(null)
  const playerReadyRef = useRef(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const pendingVideoIdRef = useRef<string | null>(null)
  const lastControllerHelloRef = useRef(0)
  const [controllerConnected, setControllerConnected] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [capturePickerActive, setCapturePickerActive] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)

  const postState = useCallback(() => {
    const player = playerRef.current
    const message: PlayerEvent = {
      type: "player-state",
      currentTime: player && playerReadyRef.current ? player.getCurrentTime() : 0,
      duration: player && playerReadyRef.current ? player.getDuration() : 0,
      isPlaying:
        Boolean(player && playerReadyRef.current) &&
        player!.getPlayerState() === window.YT.PlayerState.PLAYING,
      ready: playerReadyRef.current,
    }
    channelRef.current?.postMessage(message)
  }, [])

  const createPlayer = useCallback((videoId: string) => {
    if (playerRef.current) {
      if (playerReadyRef.current) playerRef.current.loadVideoById(videoId)
      else pendingVideoIdRef.current = videoId
      setVideoLoaded(true)
      return
    }

    playerRef.current = new window.YT.Player("yt-sync-v2-player", {
      videoId,
      playerVars: {
        playsinline: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true
          const pendingVideoId = pendingVideoIdRef.current
          if (pendingVideoId) {
            playerRef.current?.loadVideoById(pendingVideoId)
            pendingVideoIdRef.current = null
          }
          postState()
        },
        onStateChange: postState,
      },
    })
    setVideoLoaded(true)
  }, [postState])

  const loadVideo = useCallback((videoId: string) => {
    if (window.YT?.Player) {
      createPlayer(videoId)
      return
    }
    pendingVideoIdRef.current = videoId
  }, [createPlayer])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<PlayerCommand>) => {
      const message = event.data
      if (message.type === "controller-hello") {
        lastControllerHelloRef.current = Date.now()
        setControllerConnected(true)
        channel.postMessage({ type: "player-hello" } satisfies PlayerEvent)
        postState()
        return
      }
      if (message.type === "load-video") {
        loadVideo(message.videoId)
        return
      }
      if (message.type === "capture-picker") {
        setCapturePickerActive(message.active)
        return
      }
      const player = playerRef.current
      if (!player || !playerReadyRef.current) return
      if (message.type === "seek") player.seekTo(message.time, true)
      if (message.type === "play") player.playVideo()
      if (message.type === "pause") player.pauseVideo()
    }

    const stateTimer = window.setInterval(postState, 250)
    const connectionTimer = window.setInterval(() => {
      if (Date.now() - lastControllerHelloRef.current > 2500) setControllerConnected(false)
    }, 1000)
    return () => {
      window.clearInterval(stateTimer)
      window.clearInterval(connectionTimer)
      channel.close()
      channelRef.current = null
    }
  }, [channelName, loadVideo, postState])

  useEffect(() => {
    if (document.getElementById("youtube-iframe-api")) {
      if (window.YT?.Player && pendingVideoIdRef.current) createPlayer(pendingVideoIdRef.current)
      return
    }
    const script = document.createElement("script")
    script.id = "youtube-iframe-api"
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
    window.onYouTubeIframeAPIReady = () => {
      const pendingVideoId = pendingVideoIdRef.current
      if (pendingVideoId) createPlayer(pendingVideoId)
    }
  }, [createPlayer])

  useEffect(() => {
    document.title = "Chronicle YouTube Player — select this window"
  }, [])

  const openControls = () => {
    const { width, height } = readControlWindowSize()
    const popup = window.open(
      `${controlsPath}?role=controls&session=${encodeURIComponent(sessionId)}`,
      `chronicle-youtube-sync-v2-controls-${sessionId}`,
      `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=yes`
    )
    setPopupBlocked(!popup)
    popup?.focus()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
      <div id="yt-sync-v2-player" className="absolute inset-0 h-full w-full" />

      {!videoLoaded && (
        <div className="relative z-10 mx-5 max-w-lg rounded-xl border border-white/15 bg-slate-950/90 p-8 text-center text-white shadow-2xl backdrop-blur">
          <MonitorPlay className="mx-auto size-10 text-cyan-300" />
          <h1 className="mt-4 text-2xl font-bold">{productName}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This window is only the YouTube player. Open the control desk, then paste the URL and manage the entire sync from there.
          </p>
          <Button className="mt-6 w-full" onClick={openControls}>
            Open control desk
            <ExternalLink className="size-4" />
          </Button>
          {popupBlocked && (
            <p className="mt-3 text-sm text-red-300">The popup was blocked. Allow popups for this site and try again.</p>
          )}
        </div>
      )}

      {capturePickerActive && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg border border-cyan-300/40 bg-slate-950/95 px-5 py-3 text-center text-sm font-semibold text-cyan-100 shadow-2xl">
          Select “Chronicle YouTube Player” in the capture picker
        </div>
      )}

      {videoLoaded && !controllerConnected && (
        <Button className="absolute right-4 top-4 z-20 shadow-xl" onClick={openControls}>
          Reopen controls
          <ExternalLink className="size-4" />
        </Button>
      )}
    </main>
  )
}
