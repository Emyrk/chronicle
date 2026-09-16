/* eslint-disable react-refresh/only-export-components -- Panel registry files export a definition alongside their render components. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { GuildCharacterRosterResponse, GuildRosterCharacter } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import { parseColor } from "@/pages/Instance/parseColors";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import {
  filterRosterMembers,
  formatLastSeen,
  paginateRosterMembers,
  sortRosterMembers,
} from "./rosterUtils";

interface RosterConfig {
  seenWithinDays: "30" | "60" | "90";
  sortBy: "parse" | "level" | "lastSeen" | "name";
  limit: number;
  showClassChips: boolean;
  showParseScores: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  tank: "Tank",
  heal: "Healer",
  dps: "DPS",
};

function memberSubtitle(member: GuildRosterCharacter): string {
  const parts: string[] = [];
  if (member.spec) parts.push(member.spec);
  else parts.push(CLASS_DISPLAY[member.class] ?? member.class);
  if (member.role && ROLE_LABELS[member.role]) parts.push(ROLE_LABELS[member.role]);
  return parts.join(" · ");
}

function ClassChips({
  members,
  selectedClass,
  onSelect,
}: {
  members: readonly GuildRosterCharacter[];
  selectedClass: string | null;
  onSelect: (characterClass: string | null) => void;
}) {
  const counts = useMemo(() => {
    const byClass = new Map<string, number>();
    for (const member of members) {
      byClass.set(member.class, (byClass.get(member.class) ?? 0) + 1);
    }
    return [...byClass.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  return (
    <div
      className="grid gap-1.5 pb-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))" }}
    >
      {counts.map(([characterClass, count]) => {
        const selected = selectedClass === characterClass;
        const label = CLASS_DISPLAY[characterClass] ?? characterClass;
        return (
          <button
            key={characterClass}
            type="button"
            aria-pressed={selected}
            title={selected ? `Clear ${label} filter` : `Show only ${label} characters`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(selected ? null : characterClass);
            }}
            className={`flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              selected
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: CLASS_CSS_VAR[characterClass] ?? CLASS_CSS_VAR.UNKNOWN }}
            />
            <span className="truncate">{label}</span>
            <span className="ml-auto tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function MemberRow({ member, showParse }: { member: GuildRosterCharacter; showParse: boolean }) {
  const color = CLASS_CSS_VAR[member.class] ?? CLASS_CSS_VAR.UNKNOWN;
  const hasParse = member.avg_parse >= 0;
  const score = Math.round(member.avg_parse);

  return (
    <Link
      to={`/armory/${encodeURIComponent(member.realm_name)}/${encodeURIComponent(member.name)}`}
      className={`grid ${showParse ? "grid-cols-[24px_1fr_48px_auto]" : "grid-cols-[24px_1fr_auto]"} items-center gap-2.5 border-b border-border/40 py-1.5 last:border-b-0 hover:bg-muted/30 rounded-sm px-1 -mx-1`}
    >
      <img
        src={`/c/icons/class_${member.class.toLowerCase()}.png`}
        alt={CLASS_DISPLAY[member.class] ?? member.class}
        className="h-6 w-6 rounded border border-border/60"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight" style={{ color }}>
          {member.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{memberSubtitle(member)}</p>
      </div>
      {showParse &&
        (hasParse ? (
          <span
            className={`text-right text-base font-bold tabular-nums ${parseColor(score)}`}
            title="Average parse over the recent scoring window"
          >
            {score}
          </span>
        ) : (
          <span className="text-right text-sm text-muted-foreground/50">—</span>
        ))}
      <span
        className="w-14 text-right text-[11px] text-muted-foreground tabular-nums"
        title={new Date(member.last_seen_at).toLocaleString()}
      >
        {formatLastSeen(member.last_seen_at)}
      </span>
    </Link>
  );
}

function RosterContent({ config, position, guild }: GuildPanelRenderProps<RosterConfig>) {
  const [members, setMembers] = useState<GuildRosterCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Normalize unknown saved values (e.g. from an older config shape) to the default.
  const seenWithinDays = ["30", "90"].includes(config.seenWithinDays) ? config.seenWithinDays : "60";
  const limit = config.limit || 20;

  useEffect(() => {
    let cancelled = false;
    const fetchRoster = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("seen_within_days", seenWithinDays);
        // Fetch the full roster (server cap) so filters and pagination can be
        // applied client-side without another request.
        params.set("limit", "500");
        const response = await fetch(`/api/v1/guilds/${guild.id}/characters?${params}`);
        if (!response.ok) throw new Error("Failed to fetch guild roster");
        const data = (await response.json()) as GuildCharacterRosterResponse;
        if (!cancelled) setMembers([...(data.members ?? [])]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRoster();
    return () => {
      cancelled = true;
    };
  }, [guild.id, seenWithinDays]);

  const effectiveSelectedClass = config.showClassChips !== false
    && selectedClass
    && members.some((member) => member.class === selectedClass)
    ? selectedClass
    : null;
  const filteredAndSorted = useMemo(
    () => sortRosterMembers(filterRosterMembers(members, effectiveSelectedClass), config.sortBy),
    [members, effectiveSelectedClass, config.sortBy],
  );
  const paginated = useMemo(
    () => paginateRosterMembers(filteredAndSorted, page, limit),
    [filteredAndSorted, page, limit],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-muted-foreground gap-2">
        <AlertCircle className="h-5 w-5" />
        <p className="text-xs">Failed to load guild roster</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm">No members seen in the last {seenWithinDays} days</p>
      </div>
    );
  }

  // Two columns of rows when the panel is wide enough.
  const cols = position.w >= 8 ? 2 : 1;

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-center justify-between pb-1 text-[11px] text-muted-foreground">
        <span>
          {effectiveSelectedClass
            ? `${filteredAndSorted.length} of ${members.length} members`
            : `${members.length} ${members.length === 1 ? "member" : "members"}`}
        </span>
        <span>Seen in last {seenWithinDays} days</span>
      </div>
      {config.showClassChips !== false && (
        <ClassChips
          members={members}
          selectedClass={effectiveSelectedClass}
          onSelect={(characterClass) => {
            setSelectedClass(characterClass);
            setPage(0);
          }}
        />
      )}
      <div
        className="grid gap-x-6 content-start"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {paginated.members.map((member) => (
          <MemberRow key={member.id} member={member} showParse={config.showParseScores !== false} />
        ))}
      </div>
      {paginated.totalPages > 1 && (
        <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <span>
            {paginated.start + 1}-{paginated.end} of {filteredAndSorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              aria-label="Previous roster page"
              disabled={paginated.page === 0}
              onClick={(event) => {
                event.stopPropagation();
                setPage(Math.max(0, paginated.page - 1));
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-14 text-center tabular-nums">
              Page {paginated.page + 1} of {paginated.totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              aria-label="Next roster page"
              disabled={paginated.page >= paginated.totalPages - 1}
              onClick={(event) => {
                event.stopPropagation();
                setPage(Math.min(paginated.totalPages - 1, paginated.page + 1));
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const RosterPanel: GuildPanelDefinition<RosterConfig> = {
  type: "roster",
  label: "Roster",
  icon: <Users className="h-4 w-4" />,
  description: "Guild members from raid logs with parse scores and last-seen dates",
  defaultSize: { w: 5, h: 5 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "seenWithinDays",
      label: "Hide members not seen in",
      type: "select",
      options: [
        { value: "30", label: "30 days" },
        { value: "60", label: "60 days" },
        { value: "90", label: "90 days" },
      ],
      defaultValue: "60",
    },
    {
      name: "sortBy",
      label: "Sort by",
      type: "select",
      options: [
        { value: "parse", label: "Parse score" },
        { value: "level", label: "Level" },
        { value: "lastSeen", label: "Last seen" },
        { value: "name", label: "Name" },
      ],
      defaultValue: "parse",
    },
    {
      name: "limit",
      label: "Members per page",
      type: "number",
      defaultValue: 20,
    },
    {
      name: "showClassChips",
      label: "Show class breakdown",
      type: "boolean",
      defaultValue: true,
    },
    {
      name: "showParseScores",
      label: "Show parse scores",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    seenWithinDays: "60",
    sortBy: "parse",
    limit: 20,
    showClassChips: true,
    showParseScores: true,
  },
  render: (props) => <RosterContent {...props} />,
};
