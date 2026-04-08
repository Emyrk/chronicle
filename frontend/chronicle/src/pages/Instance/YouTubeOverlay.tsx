import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Minimize2, Maximize2, Move, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { VideoTimestamp, WoWEncounterWithHostiles } from "@/api/typesGenerated";
import type { YTPlayer } from "@/types/youtube";
import { useSyncModeContextOptional } from "./SyncModeContext";

interface YouTubeOverlayProps {
  videoUrl: string;
  timestamps?: readonly VideoTimestamp[];
  /** ISO timestamp to seek to (e.g., encounter start_time) */
  targetTime?: string;
  /** ISO timestamp to pause at (e.g., encounter end_time) */
  pauseTime?: string;
  onClose: () => void;
  /** List of encounters for auto-selection during video playback */
  encounters?: readonly WoWEncounterWithHostiles[];
  /** Callback when video enters a new encounter boundary */
  onEncounterChange?: (encounterId: string) => void;
}

function parseYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parse a time string "HH:MM:SS" to seconds since midnight
 */
function parseTimeToSeconds(timeStr: string): number | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extract time-of-day in seconds from an ISO timestamp.
 * Uses UTC to match the utc_time field from YouTube sync data.
 */
function isoToTimeOfDaySeconds(isoString: string): number {
  const date = new Date(isoString);
  return date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
}

/**
 * Find the video time to seek to for a given target server time.
 * Uses the timestamps array to interpolate/extrapolate.
 */
function calculateVideoTime(
  targetTimeSeconds: number,
  timestamps: readonly VideoTimestamp[]
): number | null {
  if (timestamps.length === 0) return null;

  // Convert all timestamps to seconds and pair with video time
  // Use utc_time if available (preferred), otherwise fall back to server_time
  const points = timestamps
    .map((ts) => ({
      serverSeconds: parseTimeToSeconds(ts.utc_time ?? ts.server_time),
      videoSeconds: ts.video_time_seconds,
    }))
    .filter((p): p is { serverSeconds: number; videoSeconds: number } => 
      p.serverSeconds !== null
    )
    .sort((a, b) => a.serverSeconds - b.serverSeconds);

  if (points.length === 0) return null;

  // Find the closest point(s) for interpolation
  // If target is before all points, extrapolate from first
  // If target is after all points, extrapolate from last
  // Otherwise, interpolate between two surrounding points

  const first = points[0];
  const last = points[points.length - 1];

  if (targetTimeSeconds <= first.serverSeconds) {
    // Extrapolate backwards from first point
    const diff = first.serverSeconds - targetTimeSeconds;
    return Math.max(0, first.videoSeconds - diff);
  }

  if (targetTimeSeconds >= last.serverSeconds) {
    // Extrapolate forwards from last point
    const diff = targetTimeSeconds - last.serverSeconds;
    return last.videoSeconds + diff;
  }

  // Find surrounding points and interpolate
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (targetTimeSeconds >= p1.serverSeconds && targetTimeSeconds <= p2.serverSeconds) {
      // Linear interpolation
      const serverRange = p2.serverSeconds - p1.serverSeconds;
      const videoRange = p2.videoSeconds - p1.videoSeconds;
      const t = (targetTimeSeconds - p1.serverSeconds) / serverRange;
      return p1.videoSeconds + t * videoRange;
    }
  }

  return null;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Convert video time (seconds) to combat log time (UTC Date).
 * Inverse of calculateVideoTime - uses timestamp sync points to interpolate.
 * 
 * @param videoSeconds - Current position in video (seconds)
 * @param timestamps - Sync points mapping video time to server time
 * @param referenceDate - A reference Date from the encounter (for reconstructing full Date)
 */
function videoTimeToCombatLogTime(
  videoSeconds: number,
  timestamps: readonly VideoTimestamp[],
  referenceDate: Date
): Date | null {
  if (timestamps.length === 0) return null;

  // Convert all timestamps to (videoSeconds, serverSeconds) pairs
  const points = timestamps
    .map((ts) => ({
      serverSeconds: parseTimeToSeconds(ts.utc_time ?? ts.server_time),
      videoSeconds: ts.video_time_seconds,
    }))
    .filter((p): p is { serverSeconds: number; videoSeconds: number } => 
      p.serverSeconds !== null
    )
    .sort((a, b) => a.videoSeconds - b.videoSeconds);

  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];

  let serverSeconds: number;

  if (videoSeconds <= first.videoSeconds) {
    // Extrapolate backwards
    const diff = first.videoSeconds - videoSeconds;
    serverSeconds = first.serverSeconds - diff;
  } else if (videoSeconds >= last.videoSeconds) {
    // Extrapolate forwards
    const diff = videoSeconds - last.videoSeconds;
    serverSeconds = last.serverSeconds + diff;
  } else {
    // Find surrounding points and interpolate
    serverSeconds = first.serverSeconds; // fallback
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (videoSeconds >= p1.videoSeconds && videoSeconds <= p2.videoSeconds) {
        const videoRange = p2.videoSeconds - p1.videoSeconds;
        const serverRange = p2.serverSeconds - p1.serverSeconds;
        const t = (videoSeconds - p1.videoSeconds) / videoRange;
        serverSeconds = p1.serverSeconds + t * serverRange;
        break;
      }
    }
  }

  // Handle day wraparound - track how many days we've crossed
  let daysOffset = 0;
  while (serverSeconds < 0) {
    serverSeconds += 86400;
    daysOffset -= 1;
  }
  while (serverSeconds >= 86400) {
    serverSeconds -= 86400;
    daysOffset += 1;
  }

  // Handle midnight crossing relative to referenceDate
  // If referenceDate is just after midnight (e.g., 00:30) but serverSeconds is 
  // near end of day (e.g., 23:40), we crossed midnight backward → subtract a day
  // If referenceDate is just before midnight (e.g., 23:30) but serverSeconds is
  // near start of day (e.g., 00:20), we crossed midnight forward → add a day
  const refTimeOfDay = 
    referenceDate.getUTCHours() * 3600 + 
    referenceDate.getUTCMinutes() * 60 + 
    referenceDate.getUTCSeconds();
  
  const SIX_HOURS = 6 * 3600;
  const EIGHTEEN_HOURS = 18 * 3600;
  
  if (refTimeOfDay < SIX_HOURS && serverSeconds > EIGHTEEN_HOURS) {
    // Reference is early morning, calculated is late night → went backward over midnight
    daysOffset -= 1;
  } else if (refTimeOfDay > EIGHTEEN_HOURS && serverSeconds < SIX_HOURS) {
    // Reference is late night, calculated is early morning → went forward over midnight
    daysOffset += 1;
  }

  // Reconstruct full Date using reference date
  const result = new Date(referenceDate);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + daysOffset);  // Apply day offset
  result.setUTCSeconds(Math.floor(serverSeconds));
  result.setUTCMilliseconds(Math.round((serverSeconds % 1) * 1000));

  return result;
}

/**
 * Find the encounter that contains the given combat log timestamp.
 * Returns null if the timestamp is outside all encounters.
 */
function findEncounterAtTime(
  combatLogTime: Date,
  encounters: readonly WoWEncounterWithHostiles[]
): WoWEncounterWithHostiles | null {
  const time = combatLogTime.getTime();
  for (const encounter of encounters) {
    const start = new Date(encounter.start_time).getTime();
    const end = new Date(encounter.end_time).getTime();
    if (time >= start && time <= end) {
      return encounter;
    }
  }
  return null;
}

export function YouTubeOverlay({ videoUrl, timestamps, targetTime, pauseTime, onClose, encounters, onEncounterChange }: YouTubeOverlayProps) {
  const isMobile = useIsMobile();
  const syncMode = useSyncModeContextOptional();
  
  // Extract sync mode controls for the Live Sync toggle
  const syncEnabled = syncMode?.enabled ?? false;
  const enableSync = syncMode?.enable;
  const disableSync = syncMode?.disable;
  
  // Wrap onClose to disable sync mode when overlay closes
  const handleClose = useCallback(() => {
    disableSync?.();
    onClose();
  }, [disableSync, onClose]);
  
  // Register YouTube as external driver and enable sync mode when mounted
  // Use setExternalDriver directly as dependency (stable from useCallback) rather than
  // syncMode object which changes on every timestamp update
  const setExternalDriver = syncMode?.setExternalDriver;
  useEffect(() => {
    if (setExternalDriver) {
      setExternalDriver('youtube');
      // Enable sync mode by default when YouTube overlay opens
      enableSync?.();
      return () => setExternalDriver('none');
    }
  }, [setExternalDriver, enableSync]);
  
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [size, setSize] = useState({ width: 480, height: 270 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [pauseAtEnd, setPauseAtEnd] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const pauseVideoTimeRef = useRef<number | null>(null);
  // Track the current encounter based on video position (for auto-selection)
  const currentVideoEncounterRef = useRef<string | null>(null);
  // Ref to checkTime function so onStateChange can call it immediately after seek
  const checkTimeRef = useRef<(() => void) | null>(null);
  // Track whether we're in the middle of a programmatic seek (to avoid seek loop)
  // When true, checkTime should not trigger encounter changes
  const isProgrammaticSeekRef = useRef(false);

  const videoId = parseYouTubeVideoId(videoUrl);
  
  // Compute a reference date for combat log time reconstruction
  const referenceDate = useMemo(() => {
    if (targetTime) return new Date(targetTime);
    return new Date();
  }, [targetTime]);

  // Calculate encounter video times
  const encounterVideoTimes = useMemo(() => {
    if (!timestamps?.length) return null;
    
    let startVideoTime: number | null = null;
    let endVideoTime: number | null = null;
    
    if (targetTime) {
      const startSeconds = isoToTimeOfDaySeconds(targetTime);
      startVideoTime = calculateVideoTime(startSeconds, timestamps);
    }
    
    if (pauseTime) {
      const endSeconds = isoToTimeOfDaySeconds(pauseTime);
      endVideoTime = calculateVideoTime(endSeconds, timestamps);
    }
    
    if (startVideoTime !== null && endVideoTime !== null) {
      // Use combat log duration (always accurate) for display,
      // video times only for seeking. OCR interpolation can distort
      // video duration when segments span loading screens.
      const combatLogDurationSecs = targetTime && pauseTime
        ? (new Date(pauseTime).getTime() - new Date(targetTime).getTime()) / 1000
        : endVideoTime - startVideoTime;
      return {
        start: startVideoTime,
        end: endVideoTime,
        duration: combatLogDurationSecs,
        videoDuration: endVideoTime - startVideoTime,
      };
    }
    return null;
  }, [targetTime, pauseTime, timestamps]);

  // Initialize player callback - defined before effects that use it
  const initPlayer = useCallback(() => {
    if (!videoId || playerRef.current) return;

    playerRef.current = new window.YT.Player("yt-overlay-player", {
      videoId,
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          setPlayerReady(true);
        },
        onStateChange: (event: { data: number }) => {
          // When video starts playing (including after seek), immediately check time
          // YT.PlayerState.PLAYING = 1
          if (event.data === 1) {
            // Use setTimeout to ensure getCurrentTime() returns the new position
            setTimeout(() => checkTimeRef.current?.(), 0);
          }
        },
      },
    });
  }, [videoId]);

  // Load YouTube IFrame API and initialize player
  useEffect(() => {
    // If API already loaded, initialize player
    if (window.YT?.Player) {
      // Small delay to ensure DOM element exists
      const timer = setTimeout(initPlayer, 100);
      return () => clearTimeout(timer);
    }

    // Load API script if not present
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    // Set up callback for when API is ready
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      initPlayer();
    };

    return () => {
      // Restore previous callback if any
      if (previousCallback) {
        window.onYouTubeIframeAPIReady = previousCallback;
      }
    };
  }, [initPlayer]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  // Seek when targetTime changes and calculate pause time
  useEffect(() => {
    if (!playerReady || !playerRef.current || !targetTime || !timestamps?.length) return;

    const targetSeconds = isoToTimeOfDaySeconds(targetTime);
    const videoTime = calculateVideoTime(targetSeconds, timestamps);

    if (videoTime !== null) {
      // Mark that we're doing a programmatic seek - checkTime should ignore position changes
      isProgrammaticSeekRef.current = true;
      
      playerRef.current.seekTo(videoTime, true);
      
      // Update currentVideoEncounterRef to match where we're seeking
      if (encounters) {
        const targetDate = new Date(targetTime);
        const encounter = findEncounterAtTime(targetDate, encounters);
        currentVideoEncounterRef.current = encounter?.id ?? null;
      }
      
      // Clear the programmatic seek flag after a delay to allow seek to complete
      setTimeout(() => {
        isProgrammaticSeekRef.current = false;
      }, 500);
    }

    // Calculate pause time if pauseTime is set AND pauseAtEnd is enabled
    if (pauseTime && pauseAtEnd) {
      const pauseSeconds = isoToTimeOfDaySeconds(pauseTime);
      const pauseVideoTime = calculateVideoTime(pauseSeconds, timestamps);
      pauseVideoTimeRef.current = pauseVideoTime;
    } else {
      pauseVideoTimeRef.current = null;
    }
  }, [targetTime, pauseTime, timestamps, playerReady, pauseAtEnd, encounters]);

  // Monitor video time, update current time state, and auto-pause at encounter end
  // When sync mode is enabled, poll faster (100ms) and report time to sync context
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    const isSyncEnabled = syncMode?.enabled ?? false;
    const pollInterval = isSyncEnabled ? 100 : 500;

    const checkTime = () => {
      if (!playerRef.current) return;
      
      const currentTime = playerRef.current.getCurrentTime();
      setCurrentVideoTime(currentTime);
      
      // Convert video time to combat log time (needed for both sync mode and encounter selection)
      const combatLogTime = timestamps?.length 
        ? videoTimeToCombatLogTime(currentTime, timestamps, referenceDate)
        : null;
      
      // Report video time to sync mode if enabled
      if (isSyncEnabled && combatLogTime && syncMode) {
        syncMode.setTimestamp(combatLogTime);
      }
      
      // Auto-select encounter based on video position (only when sync mode is enabled)
      // When sync is disabled, user is just watching video without affecting panel selection
      // Skip if we're in the middle of a programmatic seek
      if (isSyncEnabled && combatLogTime && encounters && onEncounterChange && !isProgrammaticSeekRef.current) {
        const encounter = findEncounterAtTime(combatLogTime, encounters);
        
        if (encounter) {
          if (encounter.id !== currentVideoEncounterRef.current) {
            currentVideoEncounterRef.current = encounter.id;
            onEncounterChange(encounter.id);
          }
        } else {
          // In a gap between encounters - clear ref so entering next encounter triggers selection
          currentVideoEncounterRef.current = null;
        }
      }
      
      if (pauseVideoTimeRef.current !== null && currentTime >= pauseVideoTimeRef.current) {
        playerRef.current.pauseVideo();
        // Clear the pause time so we don't keep pausing if user resumes
        pauseVideoTimeRef.current = null;
      }
    };

    // Store checkTime in ref so onStateChange can call it immediately after seek
    checkTimeRef.current = checkTime;

    const interval = setInterval(checkTime, pollInterval);
    return () => {
      clearInterval(interval);
      checkTimeRef.current = null;
    };
  }, [playerReady, syncMode, timestamps, referenceDate, encounters, onEncounterChange]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  }, [size]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeStartRef.current) return;
    const dx = e.clientX - resizeStartRef.current.x;
    // Maintain 16:9 aspect ratio based on width change
    const newWidth = Math.max(320, resizeStartRef.current.width + dx);
    const newHeight = Math.max(180, newWidth * (9 / 16));
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
  }, []);

  // Global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("mouseup", handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
      return () => {
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Handle seek bar click
  const handleSeekBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || !encounterVideoTimes || !seekBarRef.current) return;
    
    const rect = seekBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    
    // Map percent through combat log time → video time for accurate seeking
    let seekTime: number;
    if (targetTime && pauseTime && timestamps?.length) {
      const startMs = new Date(targetTime).getTime();
      const endMs = new Date(pauseTime).getTime();
      const targetDate = new Date(startMs + percent * (endMs - startMs));
      const targetSec = targetDate.getUTCHours() * 3600 + targetDate.getUTCMinutes() * 60 + targetDate.getUTCSeconds();
      seekTime = calculateVideoTime(targetSec, timestamps) ??
        (encounterVideoTimes.start + percent * encounterVideoTimes.videoDuration);
    } else {
      seekTime = encounterVideoTimes.start + percent * encounterVideoTimes.videoDuration;
    }
    
    playerRef.current.seekTo(seekTime, true);
    // Re-enable auto-pause when user seeks within encounter (if pauseAtEnd is enabled)
    if (pauseAtEnd) {
      pauseVideoTimeRef.current = encounterVideoTimes.end;
    }
  }, [encounterVideoTimes, pauseAtEnd, targetTime, pauseTime, timestamps]);

  // Calculate seek bar progress using combat log time for accuracy
  const seekBarProgress = useMemo(() => {
    if (!encounterVideoTimes || !targetTime) return 0;
    const combatLogTime = timestamps?.length && referenceDate
      ? videoTimeToCombatLogTime(currentVideoTime, timestamps, referenceDate)
      : null;
    if (combatLogTime) {
      const elapsed = (combatLogTime.getTime() - new Date(targetTime).getTime()) / 1000;
      return Math.max(0, Math.min(1, elapsed / encounterVideoTimes.duration));
    }
    const elapsed = currentVideoTime - encounterVideoTimes.start;
    return Math.max(0, Math.min(1, elapsed / encounterVideoTimes.videoDuration));
  }, [currentVideoTime, encounterVideoTimes, timestamps, referenceDate, targetTime]);

  // Calculate elapsed time within encounter using combat log time
  const encounterElapsed = useMemo(() => {
    if (!encounterVideoTimes || !targetTime) return 0;
    const combatLogTime = timestamps?.length && referenceDate
      ? videoTimeToCombatLogTime(currentVideoTime, timestamps, referenceDate)
      : null;
    if (combatLogTime) {
      return Math.max(0, (combatLogTime.getTime() - new Date(targetTime).getTime()) / 1000);
    }
    return Math.max(0, currentVideoTime - encounterVideoTimes.start);
  }, [currentVideoTime, encounterVideoTimes, timestamps, referenceDate, targetTime]);

  if (!videoId) {
    return null;
  }

  // Mobile: centered modal (z-40 to stay below sidebar FAB at z-50)
  if (isMobile) {
    return createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
        {/* Modal - centered */}
        <div
          className="fixed inset-x-2 top-1/2 -translate-y-1/2 z-40 flex flex-col bg-card rounded-lg shadow-xl border border-border overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border shrink-0">
            <span className="text-sm font-medium">YouTube</span>
            <div className="flex items-center gap-2">
              {/* Pause at End toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    <span>Pause at End</span>
                    <Switch 
                      size="sm" 
                      checked={pauseAtEnd} 
                      onCheckedChange={setPauseAtEnd} 
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[10001]">
                  <p>Pause video when the selected encounter ends</p>
                </TooltipContent>
              </Tooltip>
              {/* Live Sync toggle */}
              {syncMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      <span>Live Sync</span>
                      <Switch 
                        size="sm" 
                        checked={syncEnabled} 
                        onCheckedChange={(checked: boolean) => checked ? enableSync?.() : disableSync?.()} 
                      />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="z-[10001]">
                    <p>Sync panel data with video playback position</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <button
                onClick={handleClose}
                className="p-2 rounded bg-destructive/5 text-destructive/75 hover:bg-destructive/25 hover:text-destructive cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* Video player - 16:9 aspect ratio */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <div id="yt-overlay-player" className="absolute inset-0 w-full h-full" />
          </div>
          {/* Encounter seek bar */}
          {encounterVideoTimes && (
            <div className="px-3 py-2 bg-muted/30 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span>{formatDuration(encounterElapsed)}</span>
                <div className="flex-1" />
                <span>{formatDuration(encounterVideoTimes.duration)}</span>
              </div>
              <div
                ref={seekBarRef}
                className="h-2 bg-muted-foreground/10 rounded-full cursor-pointer overflow-hidden"
                onClick={handleSeekBarClick}
              >
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-100"
                  style={{ width: `${seekBarProgress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </>,
      document.body
    );
  }

  // Desktop: draggable overlay
  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-[60] bg-card border border-border rounded-lg shadow-2xl overflow-hidden",
        (isDragging || isResizing) && "select-none"
      )}
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? 200 : size.width,
      }}
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/50 border-b border-border cursor-move"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Move className="h-3 w-3" />
          <span className="truncate max-w-[150px]">YouTube</span>
        </div>
        <div className="flex items-center gap-0.5">
          {!isMinimized && (
            <>
              {/* Pause at End toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground mr-1">
                    <span>Pause at End</span>
                    <Switch 
                      size="sm" 
                      checked={pauseAtEnd} 
                      onCheckedChange={setPauseAtEnd} 
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[10001]">
                  <p>Pause video when the selected encounter ends</p>
                </TooltipContent>
              </Tooltip>
              {/* Live Sync toggle */}
              {syncMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground mr-1">
                      <span>Live Sync</span>
                      <Switch 
                        size="sm" 
                        checked={syncEnabled} 
                        onCheckedChange={(checked: boolean) => checked ? enableSync?.() : disableSync?.()} 
                      />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="z-[10001]">
                    <p>Sync panel data with video playback position</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? (
              <Maximize2 className="h-3 w-3" />
            ) : (
              <Minimize2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-destructive/20 hover:text-destructive"
            onClick={handleClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Video player - always rendered, hidden when minimized to preserve player state */}
      <div 
        className={cn("relative", isMinimized && "hidden")} 
        style={{ height: isMinimized ? 0 : size.height }}
      >
        <div id="yt-overlay-player" className="w-full h-full" />
        
        {/* Transparent overlay during drag/resize to capture mouse events over iframe */}
        {(isDragging || isResizing) && (
          <div className="absolute inset-0 z-10" />
        )}
        
        {/* Resize handle */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center bg-muted/80 rounded-tl z-20"
          onMouseDown={handleResizeStart}
        >
          <GripHorizontal className="h-3 w-3 text-muted-foreground rotate-[-45deg]" />
        </div>
      </div>

      {/* Encounter seek bar */}
      {!isMinimized && encounterVideoTimes && (
        <div className="px-2 py-1.5 bg-muted/30 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{formatDuration(encounterElapsed)}</span>
            <div className="flex-1" />
            <span>{formatDuration(encounterVideoTimes.duration)}</span>
          </div>
          <div
            ref={seekBarRef}
            className="h-2 bg-muted-foreground/10 rounded-full cursor-pointer overflow-hidden"
            onClick={handleSeekBarClick}
          >
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-100"
              style={{ width: `${seekBarProgress * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
