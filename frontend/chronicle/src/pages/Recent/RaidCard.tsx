import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Users, CheckCircle, XCircle, Youtube, Swords } from "lucide-react";
import type { RecentInstance } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { HeroicBadge } from "@/components/HeroicBadge";
import { isHeroic } from "@/lib/wowUtils";

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface RaidCardProps {
  instance: RecentInstance;
  bossCount?: number;
}

export function RaidCard({ instance, bossCount }: RaidCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const firstEncounterAt = new Date(instance.first_encounter_time);
  const backgroundImage = getInstanceBackground(instance.name);
  
  const isFullClear = bossCount != null && instance.boss_kills === bossCount;

  // Build instance URL - prefer slug if available
  const instanceUrl = instance.slug 
    ? `/instances/${instance.slug}` 
    : `/instances/${instance.id}`;

  return (
    <Link to={instanceUrl}>
      <div 
        className="relative h-full rounded-lg overflow-hidden group cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Solid color fallback background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
        
        {/* Background image - cropped to hide top/bottom decorative borders */}
        {!imageError && (
          <img
            src={backgroundImage}
            alt=""
            onError={() => setImageError(true)}
            className="absolute transition-transform duration-300 group-hover:scale-105 object-cover"
            style={{ 
              objectPosition: "center 35%", // Shift image up to show more of the artwork
              // Extend beyond container bounds to crop the decorative borders
              // WoW loading screens have ~12% borders at top and bottom
              top: "-15%",
              bottom: "-10%",
              left: 0,
              right: 0,
              width: "100%",
              height: "125%", // Taller than container to allow cropping
            }}
          />
        )}
        
        {/* Dark gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />
        
        {/* YouTube badge - top right corner */}
        {instance.has_youtube_video && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-red-600/75 backdrop-blur-sm text-white/85 px-2 py-1 rounded shadow-lg" title="Has YouTube video">
            <Youtube className="h-4 w-4" />
            <span className="text-xs font-semibold">Video</span>
          </div>
        )}

        {/* Heroic badge - below YouTube badge on right */}
        {isHeroic(instance) && (
          <div
            className="absolute z-20"
            style={{ top: instance.has_youtube_video ? '2.75rem' : '0.5rem', right: '0.5rem' }}
          >
            <HeroicBadge />
          </div>
        )}
        
        {/* Animated DPS bars - only shown on hover for cards with video */}
        {instance.has_youtube_video && isHovered && (
          <div className="absolute bottom-20 left-4 right-16 z-5 space-y-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {(() => {
              // Use uploaded_at as seed for deterministic randomization
              const seed = new Date(instance.uploaded_at).getTime();
              const seededRandom = (i: number) => {
                const x = Math.sin(seed + i * 9999) * 10000;
                return x - Math.floor(x);
              };
              
              const colors = [
                'bg-red-500',      // Warrior
                'bg-purple-500',   // Warlock  
                'bg-orange-500',   // Druid
                'bg-blue-400',     // Mage
                'bg-green-500',    // Hunter
              ];
              
              // Shuffle colors based on seed
              const shuffledColors = [...colors].sort((_, __, idx = 0) => seededRandom(idx++) - 0.5);
              
              // Generate widths: start at 85-100, decrease by 8-18 each
              const widths: number[] = [];
              let currentWidth = 85 + seededRandom(100) * 15; // 85-100
              for (let i = 0; i < 5; i++) {
                widths.push(Math.round(currentWidth));
                currentWidth -= 8 + seededRandom(200 + i) * 10; // decrease by 8-18
              }
              
              return widths.map((width, i) => ({ width: Math.max(width, 20), color: shuffledColors[i] }));
            })().map((bar, i) => (
              <div 
                key={i}
                className={`h-2 ${bar.color} rounded-sm origin-left`}
                style={{ 
                  width: `${bar.width}%`,
                  transform: 'scaleX(0)',
                  opacity: 0,
                  animation: `barPulse 4s ease-in-out infinite`,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* Content */}
        <div className="relative z-10 p-4 h-full flex flex-col min-h-[200px]">
          {/* Header: Instance name */}
          <div className="mb-2">
            <h3 className="font-bold text-base text-white drop-shadow-lg group-hover:text-amber-300 transition-colors">
              {instance.name}
            </h3>
            <p className="text-xs text-white/70 drop-shadow">
              {instance.guild_name ? (
                <>
                  <span className="text-amber-300/90">&lt;{instance.guild_name}&gt;</span>
                  <span className="mx-1">·</span>
                  by {instance.uploader_name}
                </>
              ) : (
                <>by {instance.uploader_name}</>
              )}
            </p>
            {instance.max_players > 0 && (
              <p className="text-xs text-white/70 font-medium drop-shadow">
                {instance.max_players} Player
              </p>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-white/80 mb-2">
            <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded">
              <Users className="h-3 w-3" />
              {instance.player_count}
            </span>
            <span data-chromatic="ignore" className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded">
              <Clock className="h-3 w-3" />
              {formatDuration(instance.duration_ms)}
            </span>
          </div>

          {/* Boss progress */}
          {bossCount != null && (
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                isFullClear
                  ? "bg-green-500/30 text-green-300"
                  : "bg-black/40 text-white/90"
              }`}>
                <Swords className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">
                  {instance.boss_kills}/{bossCount}
                </span>
                {isFullClear && <CheckCircle className="h-3.5 w-3.5" />}
              </div>
            </div>
          )}

          {/* Encounter tags (optional, show first few) */}
          {instance.encounters && instance.encounters.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {instance.encounters
                .filter(e => e.boss)
                .slice(0, 3)
                .map((enc, i) => {
                  const styleClasses = 
                    enc.kill_type === "clean" ? "bg-green-500/30 text-green-300" :
                    enc.kill_type === "partial" ? "bg-yellow-500/30 text-yellow-300" :
                    "bg-red-500/30 text-red-300";
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${styleClasses}`}
                    >
                      {enc.kill_type !== "wipe" ? (
                        <CheckCircle className="h-2.5 w-2.5" />
                      ) : (
                        <XCircle className="h-2.5 w-2.5" />
                      )}
                      <span className="truncate max-w-[70px]">{enc.name}</span>
                    </span>
                  );
                })}
              {instance.encounters.filter(e => e.boss).length > 3 && (
                <span className="text-xs text-white/60 bg-black/40 px-1.5 py-0.5 rounded">
                  +{instance.encounters.filter(e => e.boss).length - 3}
                </span>
              )}
            </div>
          )}

          {/* Footer: Time and realm */}
          <div data-chromatic="ignore" className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/60">
            <span>{formatRelativeTime(firstEncounterAt)}</span>
            <span className="truncate ml-2">{instance.realm_name}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
