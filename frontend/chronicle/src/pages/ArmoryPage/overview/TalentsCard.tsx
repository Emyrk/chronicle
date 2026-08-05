import type { ArmoryPlayer } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { getClassColorVar } from "../types";
import { treeName } from "./util";

interface TalentsCardProps {
  player: ArmoryPlayer;
  onOpenTalents: () => void;
}

/** Compact three-bar talent split, e.g. "Holy 36/15/0". */
export function TalentsCard({ player, onOpenTalents }: TalentsCardProps) {
  const trees = player.talents?.trees;
  const classColor = getClassColorVar(player.class);

  const deepestIdx = trees
    ? trees.reduce((best, t, i) => (t.points_spent > trees[best].points_spent ? i : best), 0)
    : 0;
  const totalSpent = trees?.reduce((sum, t) => sum + t.points_spent, 0) ?? 0;
  const summary = trees ? trees.map((t) => t.points_spent).join("/") : "";
  // One talent point per level from 10; unknown level falls back to the
  // level-60 pool.
  const maxPoints = Math.max(player.level >= 10 ? player.level - 9 : 51, 1);

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Active Talents</CardTitle>
        <CardDescription>
          {trees && totalSpent > 0 ? `${treeName(player, deepestIdx)} ${summary}` : "No talent data"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!trees && (
          <div className="py-2 text-sm text-muted-foreground">
            No talents were captured in this character's logs yet.
          </div>
        )}
        {trees?.map((tree, i) => (
          <div key={i}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <div
                className="text-sm"
                style={{
                  color: tree.points_spent > 0 ? classColor : "var(--muted-foreground)",
                }}
              >
                {treeName(player, i)}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {tree.points_spent} / {maxPoints}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min((tree.points_spent / maxPoints) * 100, 100)}%`,
                  background: classColor,
                }}
              />
            </div>
          </div>
        ))}
        {trees && (
          <div className="border-t border-border pt-3 text-xs">
            <button
              onClick={onOpenTalents}
              className="cursor-pointer text-link hover:underline"
            >
              Full tree →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
