import { useMemo } from "react";
import { format } from "date-fns";
import type { CharacterEncounterStats } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";

const MAX_FIRSTS = 6;

interface FirstKillsCardProps {
  encounters?: readonly CharacterEncounterStats[];
  isLoading: boolean;
}

/** The most recent first-kills: the night each boss first went down. */
export function FirstKillsCard({ encounters, isLoading }: FirstKillsCardProps) {
  const firsts = useMemo(
    () =>
      [...(encounters ?? [])]
        .sort(
          (a, b) =>
            new Date(b.first_killed_at).getTime() - new Date(a.first_killed_at).getTime(),
        )
        .slice(0, MAX_FIRSTS),
    [encounters],
  );

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>First kills</CardTitle>
        <CardDescription>The night each boss went down for you</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {firsts.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">
            {isLoading ? "Loading first kills…" : "No boss kills recorded yet."}
          </div>
        )}
        {firsts.map((e) => (
          <div
            key={`${e.instance_name}|${e.encounter_name}`}
            className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <div className="font-wow truncate text-sm" style={{ color: "var(--color-amber-500)" }}>
                {e.encounter_name}
              </div>
              <div className="truncate text-xs text-muted-foreground">{e.instance_name}</div>
            </div>
            <div className="font-mono shrink-0 text-xs text-muted-foreground">
              {format(new Date(e.first_killed_at), "MMM d, yyyy")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
