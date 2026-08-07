import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useInstance } from "@/api/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card"
import { cn } from "@/lib/utils"
import { YouTubeSyncOverlapTimeline } from "../YouTubeSyncV2/YouTubeSyncOverlapTimeline"
import { getRaidBounds, inferVideoRange } from "../YouTubeSyncV2/timeline"
import type { YTPlayer } from "@/types/youtube"

// Types
interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

interface SyncResult {
  videoTime: number
  videoTimeFormatted: string
  imageDataUrl: string | null
  serverTime: string | null
  rawOCR: string | null
  confidence: number
  status: "success" | "error" | "pending"
  error: string | null
}

// Helper functions
function parseYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

function parseServerTime(ocrText: string): { success: boolean; time: string | null } {
  // Clean up OCR text - fix common misreadings
  const text = ocrText
    .replace(/O/g, "0")
    .replace(/l/g, "1")
    .replace(/I/g, "1")
    .replace(/\|/g, "1")

  // Time patterns (ordered by specificity)
  const patterns = [
    // 12-hour with seconds: "2:30:45 PM"
    {
      regex: /(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM|am|pm)/,
      parse: (m: RegExpMatchArray) => {
        let hour = parseInt(m[1])
        const isPM = m[4].toUpperCase() === "PM"
        if (isPM && hour !== 12) hour += 12
        if (!isPM && hour === 12) hour = 0
        return { hour, minute: parseInt(m[2]), second: parseInt(m[3]) }
      },
    },
    // 24-hour with seconds: "14:30:45"
    {
      regex: /(\d{1,2}):(\d{2}):(\d{2})/,
      parse: (m: RegExpMatchArray) => ({
        hour: parseInt(m[1]),
        minute: parseInt(m[2]),
        second: parseInt(m[3]),
      }),
    },
    // 12-hour without seconds: "2:30 PM"
    {
      regex: /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/,
      parse: (m: RegExpMatchArray) => {
        let hour = parseInt(m[1])
        const isPM = m[3].toUpperCase() === "PM"
        if (isPM && hour !== 12) hour += 12
        if (!isPM && hour === 12) hour = 0
        return { hour, minute: parseInt(m[2]), second: 0 }
      },
    },
    // 24-hour without seconds: "14:30"
    {
      regex: /(\d{1,2}):(\d{2})/,
      parse: (m: RegExpMatchArray) => ({
        hour: parseInt(m[1]),
        minute: parseInt(m[2]),
        second: 0,
      }),
    },
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern.regex)
    if (match) {
      const parsed = pattern.parse(match)

      if (parsed.hour < 0 || parsed.hour > 23) continue
      if (parsed.minute < 0 || parsed.minute > 59) continue
      if (parsed.second < 0 || parsed.second > 59) continue

      const timeStr = `${parsed.hour.toString().padStart(2, "0")}:${parsed.minute.toString().padStart(2, "0")}:${parsed.second.toString().padStart(2, "0")}`
      return { success: true, time: timeStr }
    }
  }

  return { success: false, time: null }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Apply a time offset to convert server time to UTC.
 * @param serverTime - Time string in "HH:MM:SS" format
 * @param offsetHours - Hours to subtract (e.g., 1 if server is UTC+1)
 * @returns UTC time string in "HH:MM:SS" format
 */
function applyTimeOffset(serverTime: string, offsetHours: number): string {
  const match = serverTime.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return serverTime

  let hour = parseInt(match[1], 10) - offsetHours
  const minute = match[2]
  const second = match[3]

  // Handle day wraparound
  if (hour < 0) hour += 24
  if (hour >= 24) hour -= 24

  return `${hour.toString().padStart(2, "0")}:${minute}:${second}`
}

interface PersistedSyncSettings {
  videoUrl?: string
  cropRegion?: CropRegion
  ocrUrl?: string
  interval?: number
  syncMethod?: "ocr" | "manual"
  chronicleUrl?: string
  instanceId?: string
  timeOffsetHours?: number
}

function readPersistedSettings(key?: string): PersistedSyncSettings {
  if (!key) return {}
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as PersistedSyncSettings
  } catch {
    return {}
  }
}

export interface YouTubeSyncPageProps {
  initialVideoUrl?: string
  initialInstanceId?: string
  initialTimeOffsetHours?: number
  initialIntervalSeconds?: number
  controlsOnly?: boolean
  remoteControlChannel?: string
  capturedTimeIsUtc?: boolean
  settingsStorageKey?: string
}

export function YouTubeSyncPage({
  initialVideoUrl = "",
  initialInstanceId = "",
  initialTimeOffsetHours,
  initialIntervalSeconds = 60,
  controlsOnly = false,
  remoteControlChannel,
  settingsStorageKey,
  capturedTimeIsUtc = false,
}: YouTubeSyncPageProps = {}) {
  const persistedSettings = useRef(readPersistedSettings(settingsStorageKey)).current
  // State
  const [videoUrl, setVideoUrl] = useState(persistedSettings.videoUrl ?? initialVideoUrl)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const [videoWidth, setVideoWidth] = useState(1280)
  const [videoHeight, setVideoHeight] = useState(720)
  const [panMode, setPanMode] = useState(false)
  const [videoPosition, setVideoPosition] = useState({ x: 0, y: 0 })

  const [captureActive, setCaptureActive] = useState(false)
  const [cropRegion, setCropRegion] = useState<CropRegion>(
    persistedSettings.cropRegion ?? { x: 0, y: 0, width: 200, height: 50 }
  )
  const [capturePreview, setCapturePreview] = useState<string | null>(null)

  const [selectingRegion, setSelectingRegion] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)

  const [ocrUrl, setOcrUrl] = useState(persistedSettings.ocrUrl ?? "/ocr")
  const [interval, setIntervalSec] = useState(
    persistedSettings.interval ?? initialIntervalSeconds
  )
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)

  const [syncMethod, setSyncMethod] = useState<"ocr" | "manual">(
    persistedSettings.syncMethod ?? "ocr"
  )
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [statusText, setStatusText] = useState("")
  const [results, setResults] = useState<SyncResult[]>([])
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  const [chronicleUrl, setChronicleUrl] = useState(
    persistedSettings.chronicleUrl ?? window.location.origin
  )
  const [instanceId, setInstanceId] = useState(
    persistedSettings.instanceId ?? initialInstanceId
  )
  const [lookupInstanceId, setLookupInstanceId] = useState(
    persistedSettings.instanceId ?? initialInstanceId
  )
  const [chronicleExporting, setChronicleExporting] = useState(false)
  const localOffsetHours = (() => {
    const offset = -new Date().getTimezoneOffset() / 60
    return Number.isFinite(offset) ? offset : 0
  })()
  // Time offset in hours to convert server_time to UTC (e.g., 1 means server is UTC+1)
  const [timeOffsetHours, setTimeOffsetHours] = useState(
    persistedSettings.timeOffsetHours ?? initialTimeOffsetHours ?? localOffsetHours
  )

  const effectiveTimeOffsetHours = capturedTimeIsUtc ? 0 : timeOffsetHours
  const instanceQuery = useInstance(lookupInstanceId, {
    enabled: controlsOnly && lookupInstanceId.length > 0,
  })
  const raidBounds = useMemo(() => getRaidBounds(instanceQuery.data), [instanceQuery.data])
  const timelineAnchor = useMemo(
    () => [...results]
      .sort((left, right) => left.videoTime - right.videoTime)
      .find((result) => result.status === "success" && result.serverTime),
    [results]
  )
  const inferredVideoRange = useMemo(() => {
    if (!raidBounds || !timelineAnchor?.serverTime) return null
    return inferVideoRange(
      raidBounds,
      duration,
      {
        videoTimeSeconds: timelineAnchor.videoTime,
        serverTime: timelineAnchor.serverTime,
      },
      effectiveTimeOffsetHours
    )
  }, [duration, effectiveTimeOffsetHours, raidBounds, timelineAnchor])

  // Refs
  const playerRef = useRef<YTPlayer | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const playerReadyRef = useRef(false)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const captureVideoRef = useRef<HTMLVideoElement | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const regionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const regionImageDataRef = useRef<ImageData | null>(null)
  const syncAbortedRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const remoteChannelRef = useRef<BroadcastChannel | null>(null)
  const lastRemoteMessageRef = useRef(0)
  const remoteStateRef = useRef({ currentTime: 0, duration: 0, isPlaying: false })
  const [remoteConnected, setRemoteConnected] = useState(false)

  // Manual sync state
  const [manualPrompt, setManualPrompt] = useState<{ videoTime: number; videoTimeFormatted: string } | null>(null)
  const [manualTimeInput, setManualTimeInput] = useState("")
  const manualResolveRef = useRef<((value: string | null) => void) | null>(null)

  useEffect(() => {
    if (!remoteControlChannel) return

    const channel = new BroadcastChannel(remoteControlChannel)
    remoteChannelRef.current = channel
    playerRef.current = {
      playVideo: () => channel.postMessage({ type: "play" }),
      pauseVideo: () => channel.postMessage({ type: "pause" }),
      seekTo: (seconds) => channel.postMessage({ type: "seek", time: seconds }),
      getCurrentTime: () => remoteStateRef.current.currentTime,
      getDuration: () => remoteStateRef.current.duration,
      getPlayerState: () => remoteStateRef.current.isPlaying ? 1 : 2,
      loadVideoById: (videoId) => channel.postMessage({ type: "load-video", videoId }),
      destroy: () => undefined,
    }
    playerReadyRef.current = true

    channel.onmessage = (event: MessageEvent<{
      type: string
      currentTime?: number
      duration?: number
      isPlaying?: boolean
      ready?: boolean
    }>) => {
      const message = event.data
      lastRemoteMessageRef.current = Date.now()
      if (message.type === "player-hello") {
        setRemoteConnected(true)
        return
      }
      if (message.type !== "player-state" || message.ready !== true) return
      remoteStateRef.current = {
        currentTime: message.currentTime ?? 0,
        duration: message.duration ?? 0,
        isPlaying: message.isPlaying ?? false,
      }
      setCurrentTime(remoteStateRef.current.currentTime)
      setDuration(remoteStateRef.current.duration)
      setIsPlaying(remoteStateRef.current.isPlaying)
      setRemoteConnected(true)
    }

    const announce = () => channel.postMessage({ type: "controller-hello" })
    announce()
    const announceTimer = window.setInterval(announce, 1000)
    const connectionTimer = window.setInterval(() => {
      if (Date.now() - lastRemoteMessageRef.current > 1500) setRemoteConnected(false)
    }, 500)
    return () => {
      window.clearInterval(announceTimer)
      window.clearInterval(connectionTimer)
      channel.close()
      remoteChannelRef.current = null
      playerRef.current = null
      playerReadyRef.current = false
    }
  }, [remoteControlChannel])

  useEffect(() => {
    if (!settingsStorageKey) return
    const settings: PersistedSyncSettings = {
      videoUrl,
      cropRegion,
      ocrUrl,
      interval,
      syncMethod,
      chronicleUrl,
      instanceId,
      timeOffsetHours,
    }
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [
    settingsStorageKey,
    videoUrl,
    cropRegion,
    ocrUrl,
    interval,
    syncMethod,
    chronicleUrl,
    instanceId,
    timeOffsetHours,
  ])

  // Load YouTube IFrame API
  useEffect(() => {
    if (remoteControlChannel) return
    if (document.getElementById("youtube-iframe-api")) return

    const tag = document.createElement("script")
    tag.id = "youtube-iframe-api"
    tag.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(tag)
  }, [remoteControlChannel])

  // Time update interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && playerReadyRef.current) {
        setCurrentTime(playerRef.current.getCurrentTime())
        setDuration(playerRef.current.getDuration())
      }
    }, 250)
    return () => clearInterval(interval)
  }, [])

  // Load video
  const loadVideo = useCallback(() => {
    const videoId = parseYouTubeVideoId(videoUrl)
    if (!videoId) {
      alert("Invalid YouTube URL")
      return
    }

    // If player exists and is ready, load new video
    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.loadVideoById(videoId)
      if (remoteControlChannel) setVideoLoaded(true)
      return
    }

    // If player is being initialized, wait for it
    if (playerRef.current && !playerReadyRef.current) {
      return
    }

    // Show the video container first so the div exists
    setVideoLoaded(true)

    // Wait for YT API and DOM to be ready
    const initPlayer = () => {
      // Use setTimeout to ensure the div is rendered
      setTimeout(() => {
        playerRef.current = new window.YT.Player("yt-player", {
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
            },
            onStateChange: (event) => {
              setIsPlaying(event.data === window.YT.PlayerState.PLAYING)
            },
          },
        })
      }, 0)
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      window.onYouTubeIframeAPIReady = initPlayer
    }
  }, [remoteControlChannel, videoUrl])

  // Playback controls
  const seekRelative = (delta: number) => {
    if (!playerRef.current || !playerReadyRef.current) return
    const newTime = Math.max(0, playerRef.current.getCurrentTime() + delta)
    playerRef.current.seekTo(newTime, true)
  }

  const togglePlayPause = () => {
    if (!playerRef.current || !playerReadyRef.current) return
    if (isPlaying) {
      playerRef.current.pauseVideo()
    } else {
      playerRef.current.playVideo()
    }
  }

  // Video panning
  const handleVideoDragStart = (e: React.MouseEvent) => {
    if (!panMode) return
    dragStartRef.current = { x: e.clientX - videoPosition.x, y: e.clientY - videoPosition.y }
  }

  const handleVideoDrag = useCallback(
    (e: MouseEvent) => {
      if (!dragStartRef.current || !panMode) return

      const viewportWidth = 800
      const viewportHeight = 450

      let newX = e.clientX - dragStartRef.current.x
      let newY = e.clientY - dragStartRef.current.y

      // Constrain
      newX = Math.min(0, Math.max(viewportWidth - videoWidth, newX))
      newY = Math.min(0, Math.max(viewportHeight - videoHeight, newY))

      setVideoPosition({ x: newX, y: newY })
    },
    [panMode, videoWidth, videoHeight]
  )

  const handleVideoDragEnd = useCallback(() => {
    dragStartRef.current = null
  }, [])

  useEffect(() => {
    document.addEventListener("mousemove", handleVideoDrag)
    document.addEventListener("mouseup", handleVideoDragEnd)
    return () => {
      document.removeEventListener("mousemove", handleVideoDrag)
      document.removeEventListener("mouseup", handleVideoDragEnd)
    }
  }, [handleVideoDrag, handleVideoDragEnd])

  // Screen capture
  const startCapture = async () => {
    remoteChannelRef.current?.postMessage({ type: "capture-picker", active: true })
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen capture not available. Use HTTPS or localhost.")
      }

      const captureOptions = controlsOnly
        ? ({
            video: {
              cursor: "never",
              displaySurface: "browser",
            } as MediaTrackConstraints,
            audio: false,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude",
            surfaceSwitching: "include",
          } as DisplayMediaStreamOptions)
        : ({
            video: { cursor: "never" } as MediaTrackConstraints,
            audio: false,
            preferCurrentTab: true,
          } as DisplayMediaStreamOptions)

      const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions)
      const captureTrack = stream.getVideoTracks()[0]
      if (controlsOnly && captureTrack.label.toLowerCase().includes("youtube sync controls")) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error('Select the window named "Chronicle YouTube Player", not the controls window.')
      }

      captureStreamRef.current = stream
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream
        await new Promise<void>((resolve) => {
          captureVideoRef.current!.onloadedmetadata = () => resolve()
        })
      }

      stream.getVideoTracks()[0].onended = () => stopCapture()
      setCaptureActive(true)
    } catch (err) {
      alert("Failed to start screen capture: " + (err as Error).message)
    } finally {
      remoteChannelRef.current?.postMessage({ type: "capture-picker", active: false })
    }
  }

  const stopCapture = () => {
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((track) => track.stop())
      captureStreamRef.current = null
    }
    setCaptureActive(false)
    setCapturePreview(null)
  }

  // Capture frame
  const captureFrame = useCallback((): string => {
    const video = captureVideoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || !captureStreamRef.current) {
      throw new Error("Screen capture not active")
    }

    const ctx = canvas.getContext("2d")!
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // Crop
    const cropCanvas = document.createElement("canvas")
    cropCanvas.width = cropRegion.width
    cropCanvas.height = cropRegion.height
    const cropCtx = cropCanvas.getContext("2d")!

    cropCtx.drawImage(
      canvas,
      cropRegion.x,
      cropRegion.y,
      cropRegion.width,
      cropRegion.height,
      0,
      0,
      cropRegion.width,
      cropRegion.height
    )

    // Convert to B&W
    const imageData = cropCtx.getImageData(0, 0, cropRegion.width, cropRegion.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const bw = gray > 128 ? 255 : 0
      data[i] = bw
      data[i + 1] = bw
      data[i + 2] = bw
    }
    cropCtx.putImageData(imageData, 0, 0)

    return cropCanvas.toDataURL("image/png")
  }, [cropRegion])

  const testCapture = () => {
    try {
      const dataUrl = captureFrame()
      setCapturePreview(dataUrl)
    } catch (err) {
      alert("Capture failed: " + (err as Error).message)
    }
  }

  // Region selection
  const openRegionSelector = () => {
    if (!captureVideoRef.current || !captureStreamRef.current) return
    setSelectingRegion(true)
  }

  // Draw to region canvas when it becomes visible
  useEffect(() => {
    if (!selectingRegion) return

    const video = captureVideoRef.current
    const canvas = regionCanvasRef.current
    if (!canvas || !video) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      // Store the image data so we can restore it on each mouse move
      regionImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
  }, [selectingRegion])

  const handleRegionMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = regionCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    setSelectionStart({
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    })
  }

  const handleRegionMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectionStart) return

    const canvas = regionCanvasRef.current
    if (!canvas || !regionImageDataRef.current) return

    const ctx = canvas.getContext("2d")!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const currentX = Math.round((e.clientX - rect.left) * scaleX)
    const currentY = Math.round((e.clientY - rect.top) * scaleY)

    // Restore original image
    ctx.putImageData(regionImageDataRef.current, 0, 0)

    // Draw selection
    const x = Math.min(selectionStart.x, currentX)
    const y = Math.min(selectionStart.y, currentY)
    const w = Math.abs(currentX - selectionStart.x)
    const h = Math.abs(currentY - selectionStart.y)

    ctx.strokeStyle = "#22c55e"
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, w, h)
    ctx.fillStyle = "rgba(34, 197, 94, 0.2)"
    ctx.fillRect(x, y, w, h)
  }

  const handleRegionMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectionStart) return

    const canvas = regionCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const endX = Math.round((e.clientX - rect.left) * scaleX)
    const endY = Math.round((e.clientY - rect.top) * scaleY)

    const x = Math.min(selectionStart.x, endX)
    const y = Math.min(selectionStart.y, endY)
    const w = Math.abs(endX - selectionStart.x)
    const h = Math.abs(endY - selectionStart.y)

    if (w > 10 && h > 10) {
      setCropRegion({ x, y, width: w, height: h })
    }

    setSelectionStart(null)
    setSelectingRegion(false)
    testCapture()
  }

  // OCR
  const sendToOCR = async (imageDataUrl: string): Promise<string> => {
    const base64Data = imageDataUrl.split(",")[1]

    const response = await fetch(`${ocrUrl}/base64`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Data, trim: "\n" }),
      credentials: "include", // Include auth cookies when using proxied /ocr endpoint
    })

    if (!response.ok) {
      throw new Error(`OCR failed: ${response.status}`)
    }

    const data = await response.json()
    return data.result || data.text || ""
  }

  // Sync
  const runSync = async () => {
    if (!playerRef.current || !playerReadyRef.current) {
      alert("Load a video first")
      return
    }
    if (!captureStreamRef.current) {
      alert("Start screen capture first")
      return
    }

    const videoDuration = playerRef.current.getDuration()
    const effectiveEnd = endTime > 0 ? endTime : videoDuration

    setSyncRunning(true)
    syncAbortedRef.current = false
    setResults([])
    setLastResult(null)
    setSyncProgress(0)

    playerRef.current.pauseVideo()

    const totalSteps = Math.ceil((effectiveEnd - startTime) / interval)
    let step = 0

    for (let time = startTime; time < effectiveEnd && !syncAbortedRef.current; time += interval) {
      step++
      setSyncProgress(step / totalSteps)
      setStatusText(`Processing ${formatTime(time)} (${step}/${totalSteps})...`)

      playerRef.current.seekTo(time, true)
      await sleep(1500)

      // Get actual video time from player (has sub-second precision)
      const actualTime = playerRef.current.getCurrentTime()

      const result: SyncResult = {
        videoTime: actualTime,
        videoTimeFormatted: formatTime(actualTime),
        imageDataUrl: null,
        serverTime: null,
        rawOCR: null,
        confidence: 0,
        status: "pending",
        error: null,
      }

      try {
        const imageDataUrl = captureFrame()
        result.imageDataUrl = imageDataUrl

        const ocrText = await sendToOCR(imageDataUrl)
        result.rawOCR = ocrText

        const parsed = parseServerTime(ocrText)
        if (parsed.success) {
          result.serverTime = parsed.time
          result.confidence = 1.0
          result.status = "success"
        } else {
          result.status = "error"
          result.error = "Could not parse time"
        }
      } catch (err) {
        result.status = "error"
        result.error = (err as Error).message
      }

      setResults((prev) => [...prev, result])
      setLastResult(result)
      await sleep(500)
    }

    setSyncRunning(false)
    setStatusText(syncAbortedRef.current ? "Sync aborted" : `Done! ${step} frames processed.`)
  }

  const stopSync = () => {
    syncAbortedRef.current = true
    manualResolveRef.current?.(null)
    manualResolveRef.current = null
  }

  const waitForManualInput = (): Promise<string | null> => {
    return new Promise((resolve) => {
      manualResolveRef.current = resolve
      setManualTimeInput("")
    })
  }

  const submitManualTime = () => {
    manualResolveRef.current?.(manualTimeInput || null)
    manualResolveRef.current = null
  }

  const skipManualTime = () => {
    manualResolveRef.current?.(null)
    manualResolveRef.current = null
  }

  const runManualSync = async () => {
    if (!playerRef.current || !playerReadyRef.current) {
      alert("Load a video first")
      return
    }

    const videoDuration = playerRef.current.getDuration()
    const effectiveEnd = endTime > 0 ? endTime : videoDuration

    setSyncRunning(true)
    syncAbortedRef.current = false
    setResults([])
    setLastResult(null)
    setSyncProgress(0)
    playerRef.current.pauseVideo()

    const totalSteps = Math.ceil((effectiveEnd - startTime) / interval)
    let step = 0

    for (let time = startTime; time < effectiveEnd && !syncAbortedRef.current; time += interval) {
      step++
      setSyncProgress(step / totalSteps)
      setStatusText(`Step ${step}/${totalSteps} — waiting for input...`)

      playerRef.current.seekTo(time, true)
      await sleep(1000)
      const actualTime = playerRef.current.getCurrentTime()

      setManualPrompt({ videoTime: actualTime, videoTimeFormatted: formatTime(actualTime) })
      const userInput = await waitForManualInput()
      setManualPrompt(null)

      if (syncAbortedRef.current) break

      const result: SyncResult = {
        videoTime: actualTime,
        videoTimeFormatted: formatTime(actualTime),
        imageDataUrl: null,
        serverTime: null,
        rawOCR: userInput,
        confidence: 0,
        status: "pending",
        error: null,
      }

      if (userInput) {
        const parsed = parseServerTime(userInput)
        if (parsed.success) {
          result.serverTime = parsed.time
          result.confidence = 1.0
          result.status = "success"
        } else {
          result.status = "error"
          result.error = "Could not parse time"
        }
      } else {
        result.status = "error"
        result.error = "Skipped"
      }

      setResults((prev) => [...prev, result])
      setLastResult(result)
    }

    setSyncRunning(false)
    setStatusText(syncAbortedRef.current ? "Sync aborted" : `Done! ${step} frames processed.`)
  }

  // Export
  const exportJSON = () => {
    const data = {
      url: videoUrl,
      exported_at: new Date().toISOString(),
      results: results.map((r) => ({
        video_time_seconds: Math.round(r.videoTime),
        raw_ocr: r.rawOCR,
        server_time: r.serverTime,
        confidence: r.confidence,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "youtube-sync.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportCSV = () => {
    const lines = ["Video Time,Video Seconds,Server Time,Raw OCR,Status"]
    for (const r of results) {
      lines.push(
        [
          r.videoTimeFormatted,
          r.videoTime,
          r.serverTime || "",
          `"${(r.rawOCR || "").replace(/"/g, '""')}"`,
          r.status,
        ].join(",")
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "youtube-sync.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportToChronicle = async () => {
    if (!instanceId.trim()) {
      alert("Please enter an Instance ID")
      return
    }

    if (results.length === 0) {
      alert("No results to export")
      return
    }

    setChronicleExporting(true)
    try {
      // Check if logged in
      const whoamiRes = await fetch(`${chronicleUrl}/api/v1/whoami`, {
        credentials: "include",
      })
      if (!whoamiRes.ok) {
        alert(`Not logged in to ${chronicleUrl}. Please log in first.`)
        setChronicleExporting(false)
        return
      }

      const data = {
        url: videoUrl,
        exported_at: new Date().toISOString(),
        results: results.map((r) => ({
          video_time_seconds: Math.round(r.videoTime),
          raw_ocr: r.rawOCR,
          server_time: r.serverTime,
          utc_time: r.serverTime
            ? applyTimeOffset(r.serverTime, effectiveTimeOffsetHours)
            : undefined,
          confidence: r.confidence,
        })),
      }

      const response = await fetch(
        `${chronicleUrl}/api/v1/raidlogs/instances/${encodeURIComponent(instanceId.trim())}/youtube`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      alert("Successfully exported to Chronicle!")
    } catch (err) {
      alert(`Failed to export: ${(err as Error).message}`)
    } finally {
      setChronicleExporting(false)
    }
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)

        // Set video URL if present
        if (json.url) {
          setVideoUrl(json.url)
        }

        // Convert imported results to SyncResult format
        if (Array.isArray(json.results)) {
          const imported: SyncResult[] = json.results.map(
            (r: {
              video_time_seconds?: number
              raw_ocr?: string | null
              server_time?: string | null
              confidence?: number
              error?: string | null
            }) => ({
              videoTime: r.video_time_seconds ?? 0,
              videoTimeFormatted: formatTime(r.video_time_seconds ?? 0),
              imageDataUrl: null,
              serverTime: r.server_time ?? null,
              rawOCR: r.raw_ocr ?? null,
              confidence: r.confidence ?? 0,
              status: r.error ? "error" : r.server_time ? "success" : "pending",
              error: r.error ?? null,
            })
          )
          setResults(imported)
          setStatusText(`Imported ${imported.length} results from file`)
        }
      } catch (err) {
        alert(`Failed to parse JSON: ${(err as Error).message}`)
      }
    }
    reader.readAsText(file)

    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      {/* Video or remote control header */}
      <div
        className={cn(
          "left-0 right-0 z-50 border-b border-border bg-card p-4",
          controlsOnly ? "sticky top-0" : "fixed top-0"
        )}
      >
        {controlsOnly && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              YouTube Sync V2 control desk
            </span>
            <span className={cn("rounded-full px-2 py-1", remoteConnected
              ? "bg-green-500/15 text-green-300"
              : "bg-amber-500/15 text-amber-300")}
            >
              {remoteConnected ? "Player connected" : "Waiting for main window"}
            </span>
          </div>
        )}

        {!controlsOnly && !videoLoaded && (
          <div className="flex gap-3 items-center">
            <Input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadVideo()}
              placeholder="Paste YouTube URL and press Enter..."
              className="min-w-0 flex-1"
            />
            <Button onClick={loadVideo}>Load</Button>
          </div>
        )}

        {videoLoaded && !controlsOnly && (
          <div className="w-[800px] h-[450px] bg-black rounded-md overflow-hidden border border-border relative">
            <div
              className={cn(
                "absolute",
                panMode && "cursor-grab active:cursor-grabbing [&_iframe]:pointer-events-none"
              )}
              style={{
                width: videoWidth,
                height: videoHeight,
                left: videoPosition.x,
                top: videoPosition.y,
              }}
              onMouseDown={handleVideoDragStart}
            >
              <div id="yt-player" className="w-full h-full" />
            </div>
          </div>
        )}

        {videoLoaded && (
          <div className="flex gap-3 items-center mt-3 flex-wrap">
            <div className="flex gap-2 items-center">
              <Button variant="secondary" size="sm" onClick={() => seekRelative(-60)}>-60s</Button>
              <Button variant="secondary" size="sm" onClick={() => seekRelative(-10)}>-10s</Button>
              <Button variant="secondary" size="sm" onClick={togglePlayPause}>
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => seekRelative(10)}>+10s</Button>
              <Button variant="secondary" size="sm" onClick={() => seekRelative(60)}>+60s</Button>
              <span className="font-mono bg-muted px-3 py-1.5 rounded text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {!controlsOnly && (
              <>
                <div className="w-px h-6 bg-border" />
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={videoWidth}
                    onChange={(e) => setVideoWidth(Number(e.target.value))}
                    className="w-[70px]"
                  />
                  <span className="text-muted-foreground">×</span>
                  <Input
                    type="number"
                    value={videoHeight}
                    onChange={(e) => setVideoHeight(Number(e.target.value))}
                    className="w-[70px]"
                  />
                  <Button
                    variant={panMode ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setPanMode(!panMode)}
                    title="Toggle pan mode"
                  >
                    🖐
                  </Button>
                </div>
              </>
            )}

            {!controlsOnly && (
              <>
                <div className="w-px h-6 bg-border" />
                <div className="flex gap-2 items-center">
                  {!captureActive ? (
                    <Button onClick={startCapture}>Start Capture</Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={stopCapture}>Stop</Button>
                      <Button variant="secondary" onClick={openRegionSelector}>Select Region</Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className={cn(
        "px-3 pb-5 mx-auto space-y-5",
        controlsOnly ? "max-w-3xl pt-4" : "max-w-5xl pt-[540px]"
      )}>
        {controlsOnly && (
          <WorkflowSteps
            videoReady={videoLoaded && duration > 0}
            captureReady={captureActive}
            clockReady={syncMethod === "manual" || Boolean(capturePreview)}
            syncReady={results.length > 0}
          />
        )}

        {controlsOnly && (
          <Card>
            <CardHeader>
              <StepCardTitle
                step={1}
                title="Load the video"
                complete={videoLoaded && duration > 0}
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="workflow-video-url">YouTube URL</Label>
                <div className="flex gap-3">
                  <Input
                    id="workflow-video-url"
                    type="text"
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && loadVideo()}
                    placeholder="https://youtu.be/…"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    onClick={loadVideo}
                    disabled={!remoteConnected}
                  >
                    {videoLoaded ? "Load another" : "Load video"}
                  </Button>
                </div>
                {!remoteConnected && (
                  <p className="text-xs text-amber-300">Waiting for the main player window to connect.</p>
                )}
              </div>

              <div className="border-t border-border pt-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Raid context</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional. Load an instance to compare the raid and video on the same timeline.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Optional
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <Label htmlFor="early-instance-id">Instance ID</Label>
                  <Input
                    id="early-instance-id"
                    value={instanceId}
                    onChange={(event) => setInstanceId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setLookupInstanceId(instanceId.trim())
                    }}
                    placeholder="Optional instance ID"
                    className="mt-1 font-mono"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setLookupInstanceId(instanceId.trim())}
                  disabled={!instanceId.trim() || instanceQuery.isFetching}
                >
                  {instanceQuery.isFetching ? "Loading…" : "Load raid"}
                </Button>
              </div>
              {instanceQuery.isError && (
                <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-300">
                  Could not load that instance. Check the ID and your access.
                </p>
              )}
                {instanceQuery.data && !raidBounds && (
                  <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-200">
                    The instance loaded, but it does not contain usable start and end timestamps.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {controlsOnly && (
          <Card className={cn(!videoLoaded && "opacity-70")}>
            <CardHeader>
              <StepCardTitle
                step={2}
                title="Share the YouTube player window"
                complete={captureActive}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Share the main window named “Chronicle YouTube Player”. The controls window is excluded from the picker where the browser supports it.
              </p>
              {!captureActive ? (
                <Button onClick={startCapture} disabled={!videoLoaded}>
                  Capture YouTube window
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-green-500/15 px-3 py-1 text-sm text-green-300">
                    ✓ YouTube window shared
                  </span>
                  <Button variant="secondary" onClick={stopCapture}>Change window</Button>
                </div>
              )}
              {!videoLoaded && (
                <p className="text-xs text-amber-300">Complete step 1 by loading a video first.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Capture Section */}
        {captureActive && syncMethod === "ocr" && (
          <Card>
            <CardHeader>
              {controlsOnly ? (
                <StepCardTitle
                  step={3}
                  title="Select and test the clock"
                  complete={Boolean(capturePreview)}
                />
              ) : (
                <CardTitle>📷 Capture Region</CardTitle>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">
                  Draw a tight box around the in-game clock, then test that the preview is readable.
                </p>
                <Button variant="secondary" onClick={openRegionSelector} disabled={syncRunning}>
                  Select clock region
                </Button>
              </div>
              <div className="flex gap-5">
                <div className="flex-1 min-h-[100px] max-h-[200px] bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {capturePreview ? (
                    <img src={capturePreview} alt="Preview" className="max-w-full max-h-[200px]" />
                  ) : (
                    <span className="text-muted-foreground">Select a region to capture</span>
                  )}
                </div>
                {!syncRunning && (
                  <div className="grid grid-cols-2 gap-2 min-w-[180px]">
                    <div>
                      <Label>X</Label>
                      <Input
                        type="number"
                        value={cropRegion.x}
                        onChange={(e) =>
                          setCropRegion({ ...cropRegion, x: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <Label>Y</Label>
                      <Input
                        type="number"
                        value={cropRegion.y}
                        onChange={(e) =>
                          setCropRegion({ ...cropRegion, y: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <Label>Width</Label>
                      <Input
                        type="number"
                        value={cropRegion.width}
                        onChange={(e) =>
                          setCropRegion({ ...cropRegion, width: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <Label>Height</Label>
                      <Input
                        type="number"
                        value={cropRegion.height}
                        onChange={(e) =>
                          setCropRegion({ ...cropRegion, height: Number(e.target.value) })
                        }
                      />
                    </div>
                    <Button variant="secondary" className="col-span-2" onClick={testCapture}>
                      Test Capture
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {controlsOnly && syncMethod === "ocr" && !captureActive && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
            Complete step 2 before configuring automatic OCR synchronization.
          </p>
        )}

        {/* Sync Settings */}
        <Card>
          <CardHeader>
            {controlsOnly ? (
              <StepCardTitle
                step={4}
                title="Choose timing and run sync"
                complete={results.length > 0}
              />
            ) : (
              <CardTitle>⚡ Sync Settings</CardTitle>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-center mb-4">
              <Label>Method</Label>
              <div className="flex gap-2">
                <Button
                  variant={syncMethod === "ocr" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncMethod("ocr")}
                  disabled={syncRunning}
                >
                  OCR (Automatic)
                </Button>
                <Button
                  variant={syncMethod === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSyncMethod("manual")}
                  disabled={syncRunning}
                >
                  Manual
                </Button>
              </div>
            </div>
            <div className="flex gap-4 items-end flex-wrap">
              {syncMethod === "ocr" && (
              <div>
                <Label>OCR Service URL</Label>
                <Input
                  type="text"
                  value={ocrUrl}
                  onChange={(e) => setOcrUrl(e.target.value)}
                  className="w-[200px]"
                />
              </div>
              )}
              <div>
                <Label>Interval (sec)</Label>
                <Input
                  type="number"
                  value={interval}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  className="w-[80px]"
                />
              </div>
              <div>
                <Label>Start (sec)</Label>
                <Input
                  type="number"
                  value={startTime}
                  onChange={(e) => setStartTime(Number(e.target.value))}
                  className="w-[80px]"
                />
              </div>
              <div>
                <Label>End (sec, 0=end)</Label>
                <Input
                  type="number"
                  value={endTime}
                  onChange={(e) => setEndTime(Number(e.target.value))}
                  className="w-[80px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={syncMethod === "manual" ? runManualSync : runSync}
                  disabled={syncMethod === "ocr" ? (!captureActive || syncRunning) : (!videoLoaded || syncRunning)}
                >
                  Start Sync
                </Button>
                <Button variant="destructive" onClick={stopSync} disabled={!syncRunning}>
                  Stop
                </Button>
              </div>
            </div>

            {syncRunning && (
              <div className="space-y-2">
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${syncProgress * 100}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{statusText}</p>
              </div>
            )}

            {manualPrompt && (
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium">
                  Video at <span className="font-mono text-primary">{manualPrompt.videoTimeFormatted}</span> —
                  enter the server time you see:
                </p>
                <div className="flex gap-2 items-end">
                  <Input
                    type="text"
                    placeholder="HH:MM:SS"
                    value={manualTimeInput}
                    onChange={(e) => setManualTimeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManualTime()}
                    className="w-[160px] font-mono"
                    autoFocus
                  />
                  <Button onClick={submitManualTime}>Submit</Button>
                  <Button variant="ghost" onClick={skipManualTime}>Skip</Button>
                </div>
              </div>
            )}

            {lastResult && (
              <div className="bg-muted rounded-lg p-4 mt-4">
                <div className="flex gap-5 items-center">
                  {lastResult.imageDataUrl && (
                    <img
                      src={lastResult.imageDataUrl}
                      alt="Last capture"
                      className="max-h-[60px] rounded"
                    />
                  )}
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground block">Video Time</span>
                    <span className="font-mono text-lg">{lastResult.videoTimeFormatted}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground block">
                      {capturedTimeIsUtc ? "UTC Time" : "Server Time"}
                    </span>
                    <span className="font-mono text-lg">{lastResult.serverTime || "-"}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground block">OCR Text</span>
                    <span className="font-mono text-lg">{lastResult.rawOCR || "-"}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            {controlsOnly ? (
              <StepCardTitle
                step={5}
                title="Review and export"
                complete={results.length > 0}
              />
            ) : (
              <CardTitle>📊 Results</CardTitle>
            )}
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="text-center py-5">
                <p className="text-muted-foreground mb-3">No results yet</p>
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  Import JSON
                </Button>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                        Video Time
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                        Image
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                        {capturedTimeIsUtc ? "UTC Time" : "Server Time"}
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                        Raw OCR
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-3 font-mono">{r.videoTimeFormatted}</td>
                        <td className="py-2 px-3">
                          {r.imageDataUrl && (
                            <img
                              src={r.imageDataUrl}
                              alt={`Frame ${i}`}
                              className="max-h-[30px] rounded hover:scale-200 hover:relative hover:z-10 transition-transform"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono">{r.serverTime || "-"}</td>
                        <td className="py-2 px-3 font-mono">{r.rawOCR || "-"}</td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-xs",
                              r.status === "success"
                                ? "bg-green-900/50 text-green-300"
                                : "bg-red-900/50 text-red-300"
                            )}
                          >
                            {r.status === "success" ? "OK" : r.error || "Error"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-2 mt-4">
                  <Button variant="secondary" onClick={exportJSON}>
                    Export JSON
                  </Button>
                  <Button variant="secondary" onClick={exportCSV}>
                    Export CSV
                  </Button>
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                    Import JSON
                  </Button>
                  <Button variant="secondary" onClick={() => setResults([])}>
                    Clear
                  </Button>
                </div>

                {/* Chronicle Export */}
                <div className="mt-6 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-3">Export to Chronicle</h4>
                  <div className={cn(
                    "grid gap-4 mb-3",
                    capturedTimeIsUtc ? "grid-cols-2" : "grid-cols-3"
                  )}>
                    <div>
                      <Label htmlFor="chronicle-url" className="text-xs">
                        Chronicle URL
                      </Label>
                      <Input
                        id="chronicle-url"
                        value={chronicleUrl}
                        onChange={(e) => setChronicleUrl(e.target.value)}
                        placeholder="https://chronicle.example.com"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="export-instance-id" className="text-xs">
                        Instance ID
                      </Label>
                      <Input
                        id="export-instance-id"
                        value={instanceId}
                        onChange={(e) => setInstanceId(e.target.value)}
                        placeholder="abc123..."
                        className="mt-1"
                      />
                    </div>
                    {!capturedTimeIsUtc && (
                      <div>
                        <Label htmlFor="export-time-offset" className="text-xs">
                          Time Offset (hours)
                        </Label>
                        <Input
                          id="export-time-offset"
                          type="number"
                          value={timeOffsetHours}
                          onChange={(e) => setTimeOffsetHours(Number(e.target.value))}
                          placeholder="0"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Applied only to the captured video clock when converting it to UTC. Raid timestamps are already UTC.
                        </p>
                      </div>
                    )}
                  </div>
                  <Button onClick={exportToChronicle} disabled={chronicleExporting}>
                    {chronicleExporting ? "Exporting..." : "Export to Chronicle"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {controlsOnly && raidBounds && (
          <YouTubeSyncOverlapTimeline
            raid={raidBounds}
            video={inferredVideoRange}
            instanceName={instanceQuery.data?.name}
          />
        )}
      </div>

      {/* Region selector overlay */}
      {selectingRegion && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center">
          <div className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg mb-5">
            Click and drag to select the clock region. Press Escape to cancel.
          </div>
          <canvas
            ref={regionCanvasRef}
            className="max-w-[95vw] max-h-[85vh] border-2 border-primary rounded cursor-crosshair"
            onMouseDown={handleRegionMouseDown}
            onMouseMove={handleRegionMouseMove}
            onMouseUp={handleRegionMouseUp}
            onKeyDown={(e) => e.key === "Escape" && setSelectingRegion(false)}
            tabIndex={0}
          />
        </div>
      )}

      {/* Hidden elements */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileImport}
        className="hidden"
      />
      <video ref={captureVideoRef} className="hidden" autoPlay />
      <canvas ref={captureCanvasRef} className="hidden" />
    </div>
  )
}

function StepCardTitle({
  step,
  title,
  complete,
  optional = false,
}: {
  step: number
  title: string
  complete: boolean
  optional?: boolean
}) {
  return (
    <CardTitle className="flex items-center gap-3 text-base">
      <span className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold",
        complete
          ? "border-green-400/40 bg-green-400/15 text-green-300"
          : "border-primary/40 bg-primary/10 text-primary"
      )}>
        {complete ? "✓" : step}
      </span>
      <span>{title}</span>
      {optional && (
        <span className="ml-auto text-xs font-normal text-muted-foreground">Optional</span>
      )}
    </CardTitle>
  )
}

function WorkflowSteps({
  videoReady,
  captureReady,
  clockReady,
  syncReady,
}: {
  videoReady: boolean
  captureReady: boolean
  clockReady: boolean
  syncReady: boolean
}) {
  const steps = [
    { label: "Load video", complete: videoReady },
    { label: "Share window", complete: captureReady },
    { label: "Select clock", complete: clockReady },
    { label: "Run sync", complete: syncReady },
    { label: "Export", complete: false },
  ]

  return (
    <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-border bg-card">
      {steps.map((step, index) => {
        const previousComplete = index === 0 || steps[index - 1].complete
        const active = !step.complete && previousComplete
        return (
          <div
            key={step.label}
            className={cn(
              "relative min-w-0 border-r border-border px-2 py-3 text-center last:border-r-0",
              step.complete && "bg-green-500/5",
              active && "bg-primary/10"
            )}
          >
            <div className={cn(
              "mx-auto flex size-6 items-center justify-center rounded-full border font-mono text-[11px] font-bold",
              step.complete
                ? "border-green-400/40 bg-green-400/15 text-green-300"
                : active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
            )}>
              {step.complete ? "✓" : index + 1}
            </div>
            <p className={cn(
              "mt-1 truncate text-[10px] sm:text-xs",
              active ? "font-semibold text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}
