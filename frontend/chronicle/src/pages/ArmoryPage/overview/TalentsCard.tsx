import type { ArmoryPlayer } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
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

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Talents</CardTitle>
        <CardDescription>
          {trees && totalSpent > 0 ? `${treeName(player, deepestIdx)} ${summary}` : "No talent data"}
        </CardDescription>
        {trees && (
          <CardAction>
            <button
              onClick={onOpenTalents}
              className="cursor-pointer text-xs text-link hover:underline"
            >
              Full tree →
            </button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
                {tree.points_spent} pts
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: totalSpent > 0 ? `${(tree.points_spent / totalSpent) * 100}%` : 0,
                  background: classColor,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
