import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSupportedInstances } from "@/api/queries";
import { Loader2, X, Shield, MapPin, Skull, Swords } from "lucide-react";
import type { SupportedInstance, SupportedInstanceUnit } from "@/api/typesGenerated";
import {
  INSTANCE_CONFIG,
  getInstanceBackground,
  type InstanceCategory,
} from "@/pages/Logs/utils/instanceImages";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Unit Row (shared between bosses and trash)
// ---------------------------------------------------------------------------

function UnitRow({ unit, icon }: { unit: SupportedInstanceUnit; icon: React.ReactNode }) {
  return (
    <div className="text-sm text-foreground flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50">
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{unit.name}</span>
      <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums flex-shrink-0">
        #{unit.entry_id}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instance Detail Modal
// ---------------------------------------------------------------------------

interface InstanceDetailModalProps {
  instance: SupportedInstance;
  onClose: () => void;
}

function InstanceDetailModal({ instance, onClose }: InstanceDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const bg = getInstanceBackground(instance.name);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const bosses = instance.bosses ?? [];
  const trash = instance.trash ?? [];
  const zones = instance.zone_names ?? [];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={cn(
        "bg-card border shadow-xl w-full overflow-hidden flex flex-col max-sm:max-h-[85vh] max-sm:rounded-t-xl sm:rounded-lg sm:max-w-lg sm:mx-4 sm:max-h-[80vh]",
        instance.fallback ? "border-yellow-500/40" : "border-border",
      )}>
        {/* Hero header with background image */}
        <div className="relative h-32 sm:h-40 flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800" />
          {!imageError && (
            <img
              src={bg}
              alt=""
              onError={() => setImageError(true)}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: "center 35%" }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 h-full flex flex-col justify-end p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                {instance.name}
              </h2>
              {instance.fallback && (
                <span className="text-[10px] font-medium bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">
                  Fallback
                </span>
              )}
            </div>
            {instance.comment && (
              <p className="text-xs text-amber-300/80 mt-0.5">{instance.comment}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 transition-colors p-1.5 rounded-full"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Zone names */}
          {zones.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Zone Names
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => (
                  <span
                    key={z}
                    className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground"
                  >
                    {z}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bosses */}
          {bosses.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Skull className="h-3.5 w-3.5" />
                Bosses ({bosses.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                {bosses.map((boss) => (
                  <UnitRow
                    key={boss.entry_id}
                    unit={boss}
                    icon={<Shield className="h-3 w-3 text-amber-500" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Trash */}
          {trash.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Swords className="h-3.5 w-3.5" />
                Trash ({trash.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                {trash.map((mob) => (
                  <UnitRow
                    key={mob.entry_id}
                    unit={mob}
                    icon={<Swords className="h-3 w-3 text-muted-foreground/60" />}
                  />
                ))}
              </div>
            </div>
          )}

          {bosses.length === 0 && trash.length === 0 && zones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No detailed information available for this instance yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instance Card
// ---------------------------------------------------------------------------

interface InstanceCardProps {
  instance: SupportedInstance;
  onClick: () => void;
}

function InstanceCard({ instance, onClick }: InstanceCardProps) {
  const [imageError, setImageError] = useState(false);
  const bg = getInstanceBackground(instance.name);
  const config = INSTANCE_CONFIG[instance.name];
  const bossCount = instance.bosses?.length ?? config?.bossCount ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative h-24 sm:h-28 w-full rounded-lg overflow-hidden text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        instance.fallback && "ring-1 ring-yellow-500/30",
      )}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800" />
      {!imageError && (
        <img
          src={bg}
          alt=""
          onError={() => setImageError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          style={{ objectPosition: "center 35%" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-black/30" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm sm:text-base font-semibold text-white group-hover:text-amber-300 transition-colors truncate drop-shadow">
              {instance.name}
            </h3>
            {instance.fallback && (
              <span className="text-[9px] font-medium bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded flex-shrink-0">
                Fallback
              </span>
            )}
          </div>
          {instance.comment && (
            <p className="text-[10px] text-amber-300/70 truncate mt-0.5">
              {instance.comment}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bossCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
              <Skull className="h-3 w-3" />
              {bossCount} {bossCount === 1 ? "boss" : "bosses"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type CategoryGroup = { label: string; category: InstanceCategory | "other"; instances: SupportedInstance[] };

export function SupportedInstances() {
  const { data: supportedInstances, isLoading, error } = useSupportedInstances();
  const [selectedInstance, setSelectedInstance] = useState<SupportedInstance | null>(null);

  const handleClose = useCallback(() => setSelectedInstance(null), []);

  const groups: CategoryGroup[] = useMemo(() => {
    if (!supportedInstances || !Array.isArray(supportedInstances)) return [];

    const raids: SupportedInstance[] = [];
    const dungeons: SupportedInstance[] = [];
    const other: SupportedInstance[] = [];

    for (const inst of supportedInstances) {
      const config = INSTANCE_CONFIG[inst.name];
      const cat = config?.category;
      if (cat === "raid") raids.push(inst);
      else if (cat === "dungeon") dungeons.push(inst);
      else other.push(inst);
    }

    const result: CategoryGroup[] = [];
    if (raids.length > 0) result.push({ label: "Raids", category: "raid", instances: raids });
    if (dungeons.length > 0) result.push({ label: "Dungeons", category: "dungeon", instances: dungeons });
    if (other.length > 0) result.push({ label: "Other", category: "other", instances: other });
    return result;
  }, [supportedInstances]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Supported Instances</h1>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <p className="text-destructive">Failed to load supported instances.</p>
      ) : groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="text-lg font-semibold text-muted-foreground mb-3">
                {group.label}
                <span className="text-xs font-normal ml-2">({group.instances.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.instances.map((inst) => (
                  <InstanceCard
                    key={inst.name}
                    instance={inst}
                    onClick={() => setSelectedInstance(inst)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {selectedInstance && (
        <InstanceDetailModal
          instance={selectedInstance}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
