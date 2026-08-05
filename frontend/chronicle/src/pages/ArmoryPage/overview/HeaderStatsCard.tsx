import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";

export interface HeaderStat {
  value: ReactNode;
  label: string;
}

/**
 * The stats card beside the identity header. All variants share the same
 * minimum height (matching ScoreCard) so switching tabs or modes never
 * shifts the layout.
 */
export function HeaderStatsCard({ title, stats }: { title: string; stats: HeaderStat[] }) {
  return (
    <Card className="h-full min-h-[172px] gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-normal tracking-widest text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grow grid-cols-2 content-center gap-x-6 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="font-mono text-2xl leading-none font-bold text-foreground">
              {stat.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
