import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import type { ManifestProblem } from "@/config/mapManifest";

/**
 * The entries the viewer's parser dropped from a live manifest, each with its
 * reason (the replay also logs them as console warnings). For the people who
 * publish the manifests: what the replay map silently goes without.
 */
export function ManifestProblems({ problems, what }: { problems: readonly ManifestProblem[]; what: string }) {
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        {problems.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-400" />}
        Problems
        <span className="font-normal text-muted-foreground">
          {problems.length === 0 ? `none: every ${what} entry loaded` : `${problems.length} ${what} ${problems.length === 1 ? "entry" : "entries"} dropped`}
        </span>
      </h2>
      {problems.length > 0 && (
        <ul className="styled-scrollbar mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
          {problems.map((problem, index) => (
            <li key={index} className="flex flex-wrap gap-x-2">
              <span className="text-foreground">{problem.path}</span>
              <span className="text-muted-foreground">{problem.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
