import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Skull } from "lucide-react";
import { Link } from "react-router-dom";
import { instanceQueryOptions } from "@/api/queries";
import type { DungeonInstanceSetMember } from "@/api/typesGenerated";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "./phaseTimeRange";

/**
 * A dungeon instance set is every instance of one dungeon in one uploaded log,
 * in log order, such as several resets in one night. Raids never form a set.
 * Every switcher renders nothing unless the set has at least two members.
 */
interface SwitcherProps {
  members: readonly DungeonInstanceSetMember[];
  currentId: string;
  /** Called when a reset is likely to be opened next (hover, focus or touch), to prefetch it. */
  onIntent?: (member: DungeonInstanceSetMember) => void;
}

function intentHandlers(member: DungeonInstanceSetMember, onIntent?: (member: DungeonInstanceSetMember) => void) {
  if (!onIntent) return {};
  const handle = () => onIntent(member);
  return { onPointerEnter: handle, onFocus: handle, onTouchStart: handle };
}

function instanceHref(member: DungeonInstanceSetMember): string {
  return `/instances/${member.slug || member.id}`;
}

function durationMs(member: DungeonInstanceSetMember): number {
  if (!member.start_time || !member.end_time) return 0;
  return new Date(member.end_time).getTime() - new Date(member.start_time).getTime();
}

function clockLabel(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * The parser does not know a dungeon's boss count, so the most bosses killed
 * in any reset stands in for it: a reset that matches it is a full clear.
 */
function BossProgress({ kills, mostKills, className }: { kills: number; mostKills: number; className?: string }) {
  const cleared = mostKills > 0 && kills >= mostKills;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", cleared ? "text-emerald-400" : "text-amber-400", className)}>
      {cleared ? <Check className="h-3 w-3" /> : <Skull className="h-3 w-3" />}
      {kills}/{mostKills}
    </span>
  );
}

function mostBossKills(members: readonly DungeonInstanceSetMember[]): number {
  return Math.max(0, ...members.map((member) => member.boss_kills));
}

/** Desktop: a tab per reset under the header, each showing its outcome. */
export function LogInstanceTabs({ members, currentId, onIntent }: SwitcherProps) {
  if (members.length < 2) return null;
  const mostKills = mostBossKills(members);
  return (
    <nav
      aria-label="Resets in this log"
      className="styled-scrollbar -mt-4 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-background/40 p-1"
    >
      {members.map((member, index) => {
        const active = member.id === currentId;
        return (
          <Link
            key={member.id}
            to={instanceHref(member)}
            aria-current={active ? "page" : undefined}
            {...(active ? {} : intentHandlers(member, onIntent))}
            className={cn(
              "flex min-w-40 shrink-0 flex-col items-start rounded-md px-3 py-1.5 text-left transition-colors",
              active ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-white/5",
            )}
          >
            <span className={cn("text-sm font-medium", !active && "text-muted-foreground")}>Reset {index + 1}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{clockLabel(member.start_time)}</span>
              <span>{formatDurationMs(durationMs(member))}</span>
              <BossProgress kills={member.boss_kills} mostKills={mostKills} />
              {member.wipes > 0 && <span className="text-rose-400">{member.wipes} wipe{member.wipes === 1 ? "" : "s"}</span>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: a compact stepper beside the title, with every reset in a dropdown. */
export function LogInstanceStepper({ members, currentId, onIntent }: SwitcherProps) {
  if (members.length < 2) return null;
  const mostKills = mostBossKills(members);
  const index = Math.max(0, members.findIndex((member) => member.id === currentId));
  const previous = members[index - 1];
  const next = members[index + 1];
  const stepClass = "p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground";
  const disabledClass = "p-1 text-muted-foreground opacity-30";
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-background/40 text-sm font-normal">
      {previous ? (
        <Link to={instanceHref(previous)} {...intentHandlers(previous, onIntent)} aria-label="Previous reset" className={cn(stepClass, "rounded-l-md")}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={disabledClass}><ChevronLeft className="h-4 w-4" /></span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 px-2 py-0.5 text-muted-foreground hover:text-foreground">
          <span className="tabular-nums">Reset {index + 1} of {members.length}</span>
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Resets in this log</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {members.map((member, memberIndex) => (
            <DropdownMenuItem key={member.id} asChild>
              <Link
                to={instanceHref(member)}
                {...(member.id === currentId ? {} : intentHandlers(member, onIntent))}
                className={cn("flex items-center justify-between gap-3", member.id === currentId && "bg-primary/10")}
              >
                <span className="flex min-w-0 flex-col">
                  <span>Reset {memberIndex + 1}</span>
                  <span className="text-xs text-muted-foreground">
                    {clockLabel(member.start_time)} · {formatDurationMs(durationMs(member))}
                  </span>
                </span>
                <BossProgress kills={member.boss_kills} mostKills={mostKills} className="text-xs" />
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {next ? (
        <Link to={instanceHref(next)} {...intentHandlers(next, onIntent)} aria-label="Next reset" className={cn(stepClass, "rounded-r-md")}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={disabledClass}><ChevronRight className="h-4 w-4" /></span>
      )}
    </span>
  );
}

/** Fetches the dungeon set for an instance and renders the tabs or stepper. */
export function DungeonInstanceSetSwitcher({ instanceId, variant }: { instanceId: string; variant: "tabs" | "stepper" }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dungeon-instance-set", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/raidlogs/instances/${instanceId}/dungeon-set`);
      if (!res.ok) throw new Error("Failed to fetch dungeon instance set");
      return res.json() as Promise<DungeonInstanceSetMember[]>;
    },
    staleTime: 60_000,
  });
  if (!data) return null;
  // Links use the slug, so prefetch under the same key the instance page reads.
  const prefetch = (member: DungeonInstanceSetMember) => {
    void queryClient.prefetchQuery({ ...instanceQueryOptions(member.slug || member.id), staleTime: 60_000 });
  };
  return variant === "tabs"
    ? <LogInstanceTabs members={data} currentId={instanceId} onIntent={prefetch} />
    : <LogInstanceStepper members={data} currentId={instanceId} onIntent={prefetch} />;
}
