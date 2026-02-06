/**
 * Sync Control Overlay - Floating panel for controlling sync mode.
 * 
 * Provides manual controls for:
 * - Enable/disable sync mode
 * - Play/pause automatic playback
 * - Step forward/backward by configurable amounts
 * - Seek to specific timestamps
 * - View debug metrics
 */

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Play, Pause, SkipBack, SkipForward, Clock, ChevronDown, ChevronUp, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import { useSyncModeContext } from "./SyncModeContext";

interface SyncControlOverlayProps {
  onClose: () => void;
  /** Initial timestamp to start at (usually encounter start) */
  initialTimestamp?: Date;
}

/**
 * Format a Date as HH:MM:SS.mmm
 */
function formatTimestamp(date: Date | null): string {
  if (!date) return "--:--:--.---";
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = ms % 1000;
  
  if (min > 0) {
    return `${min}:${sec.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${sec}.${millis.toString().padStart(3, "0")}s`;
}

/**
 * Format a number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function SyncControlOverlay({ onClose, initialTimestamp }: SyncControlOverlayProps) {
  const sync = useSyncModeContext();
  const [showDebug, setShowDebug] = useState(false);
  
  // Calculate progress within encounter bounds
  const progress = useMemo(() => {
    if (!sync.encounterBounds || !sync.currentTimestamp) return 0;
    const { start, end } = sync.encounterBounds;
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    const current = sync.currentTimestamp.getTime() - start.getTime();
    return Math.max(0, Math.min(100, (current / total) * 100));
  }, [sync.encounterBounds, sync.currentTimestamp]);
  
  // Calculate elapsed time within encounter
  const elapsed = useMemo(() => {
    if (!sync.encounterBounds || !sync.currentTimestamp) return 0;
    return sync.currentTimestamp.getTime() - sync.encounterBounds.start.getTime();
  }, [sync.encounterBounds, sync.currentTimestamp]);
  
  // Calculate total duration
  const totalDuration = useMemo(() => {
    if (!sync.encounterBounds) return 0;
    return sync.encounterBounds.end.getTime() - sync.encounterBounds.start.getTime();
  }, [sync.encounterBounds]);
  
  // Handle enable toggle
  const handleEnableChange = (checked: boolean) => {
    if (checked) {
      sync.enable();
      // Always set initial timestamp when enabling (disable clears it)
      if (initialTimestamp) {
        sync.setTimestamp(initialTimestamp);
      } else if (sync.encounterBounds) {
        sync.setTimestamp(sync.encounterBounds.start);
      }
    } else {
      sync.disable();
    }
  };
  
  // Handle slider change
  const handleSliderChange = (value: number[]) => {
    if (!sync.encounterBounds) return;
    const percent = value[0] / 100;
    const { start, end } = sync.encounterBounds;
    const total = end.getTime() - start.getTime();
    const newTime = new Date(start.getTime() + total * percent);
    sync.setTimestamp(newTime);
  };
  
  // Jump to start
  const handleJumpToStart = () => {
    if (sync.encounterBounds) {
      sync.setTimestamp(sync.encounterBounds.start);
    } else if (initialTimestamp) {
      sync.setTimestamp(initialTimestamp);
    }
  };
  
  // Jump to end
  const handleJumpToEnd = () => {
    if (sync.encounterBounds) {
      sync.setTimestamp(sync.encounterBounds.end);
    }
  };
  
  const content = (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-40 w-80",
        "bg-card rounded-lg shadow-xl border border-border",
        "flex flex-col overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Sync Controls</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-4">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <label htmlFor="sync-enabled" className="text-sm font-medium">
            Sync Mode
          </label>
          <Switch
            id="sync-enabled"
            checked={sync.enabled}
            onCheckedChange={handleEnableChange}
          />
        </div>
        
        {/* Timestamp Display */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Current Time (UTC)</div>
          <div className="font-mono text-lg tabular-nums">
            {formatTimestamp(sync.currentTimestamp)}
          </div>
        </div>
        
        {/* Progress Bar / Seek Slider */}
        {sync.encounterBounds && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatDuration(elapsed)}</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
            <input
              type="range"
              value={progress}
              min={0}
              max={100}
              step={0.1}
              onChange={(e) => handleSliderChange([parseFloat(e.target.value)])}
              disabled={!sync.enabled}
              className="w-full cursor-pointer accent-primary"
            />
          </div>
        )}
        
        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-1">
          {/* Jump to start */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleJumpToStart}
            disabled={!sync.enabled}
            title="Jump to start"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          {/* Step backward 1s */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => sync.step(-1000)}
            disabled={!sync.enabled}
            title="Step back 1 second"
          >
            -1s
          </Button>
          
          {/* Step backward 100ms */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => sync.step(-100)}
            disabled={!sync.enabled}
            title="Step back 100ms"
          >
            -100ms
          </Button>
          
          {/* Play/Pause */}
          <Button
            variant={sync.isPlaying ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => sync.isPlaying ? sync.pause() : sync.play()}
            disabled={!sync.enabled}
            title={sync.isPlaying ? "Pause" : "Play"}
          >
            {sync.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          {/* Step forward 100ms */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => sync.step(100)}
            disabled={!sync.enabled}
            title="Step forward 100ms"
          >
            +100ms
          </Button>
          
          {/* Step forward 1s */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => sync.step(1000)}
            disabled={!sync.enabled}
            title="Step forward 1 second"
          >
            +1s
          </Button>
          
          {/* Jump to end */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleJumpToEnd}
            disabled={!sync.enabled}
            title="Jump to end"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Speed Control */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Speed:</span>
          <div className="flex gap-1">
            {[0.25, 0.5, 1, 2, 4].map((speed) => (
              <Button
                key={speed}
                variant={sync.playbackSpeed === speed ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => sync.setPlaybackSpeed(speed)}
                disabled={!sync.enabled}
              >
                {speed}x
              </Button>
            ))}
          </div>
        </div>
        
        {/* Debug Toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {showDebug ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Debug Info
        </button>
        
        {/* Debug Metrics */}
        {showDebug && (
          <div className="bg-muted/50 rounded p-2 text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Events processed:</span>
              <span>{formatNumber(sync.metrics.processedCount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Processing rate:</span>
              <span>{formatNumber(sync.metrics.eventsPerSecond)}/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last update:</span>
              <span>{sync.metrics.lastUpdateMs.toFixed(1)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className={sync.enabled ? "text-green-500" : "text-muted-foreground"}>
                {sync.enabled ? (sync.isPlaying ? "Playing" : "Paused") : "Disabled"}
              </span>
            </div>
            {sync.encounterBounds && (
              <>
                <div className="border-t border-border my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Encounter start:</span>
                  <span>{formatTimestamp(sync.encounterBounds.start)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Encounter end:</span>
                  <span>{formatTimestamp(sync.encounterBounds.end)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
  return createPortal(content, document.body);
}
