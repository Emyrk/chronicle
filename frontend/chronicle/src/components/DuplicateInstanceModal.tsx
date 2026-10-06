import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X, Users, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getInstanceBackground,
} from "@/pages/Logs/utils/instanceImages";

/** Minimal shape needed for each row in the modal. */
export interface DuplicateModalInstance {
  id: string;
  slug: string;
  name: string;
  recorder_name: string;
  uploader_name?: string;
  player_count: number;
  duration_ms?: number | null;
}

interface DuplicateInstanceModalProps {
  instances: DuplicateModalInstance[];
  onClose: () => void;
  /** ID of the currently viewed instance (shown as "Selected") */
  currentInstanceId?: string;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms === 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function DuplicateInstanceModal({
  instances,
  onClose,
  currentInstanceId,
}: DuplicateInstanceModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (instances.length === 0) return null;

  const representative = instances[0];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-card border border-border shadow-xl w-full overflow-hidden flex flex-col max-sm:h-full max-sm:rounded-none sm:rounded-lg sm:max-w-md sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {representative.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {instances.length} logs from the same raid — choose one to view
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Instance list */}
        <div className="p-2 space-y-1.5 overflow-y-auto max-sm:flex-1 sm:max-h-80">
          {instances.map((inst) => {
            const url = inst.slug
              ? `/instances/${inst.slug}`
              : `/instances/${inst.id}`;
            const isCurrent = currentInstanceId === inst.id;
            return (
              <Link
                key={inst.id}
                to={url}
                className={cn(
                  "block w-full text-left rounded-md overflow-hidden group transition-all",
                  isCurrent
                    ? "ring-2 ring-amber-400/70"
                    : "cursor-pointer hover:scale-[1.01] hover:shadow-md",
                )}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (isCurrent) event.preventDefault();
                  onClose();
                }}
              >
                <DuplicateInstanceRow instance={inst} isCurrent={isCurrent} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DuplicateInstanceRow({ instance, isCurrent }: { instance: DuplicateModalInstance; isCurrent?: boolean }) {
  const [imageError, setImageError] = React.useState(false);
  const backgroundImage = getInstanceBackground(instance.name);
  const recorder = instance.recorder_name || "Unknown";
  const uploader = instance.uploader_name ?? "Unknown";

  return (
    <div className="relative h-14 rounded-md overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800" />
      {!imageError && (
        <img
          src={backgroundImage}
          alt=""
          onError={() => setImageError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          style={{ objectPosition: "center 35%" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-center justify-between px-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white group-hover:text-amber-300 transition-colors truncate">
            Recorded by{" "}
            <span className="text-amber-300/90">{recorder}</span>
          </p>
          <p className="text-[10px] text-white/60 truncate">
            Uploaded by {uploader}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {isCurrent && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded font-medium">
              <Check className="h-3 w-3" />
              Selected
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
            <Users className="h-3 w-3" />
            {instance.player_count}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
            <Clock className="h-3 w-3" />
            {formatDuration(instance.duration_ms)}
          </span>
        </div>
      </div>
    </div>
  );
}

