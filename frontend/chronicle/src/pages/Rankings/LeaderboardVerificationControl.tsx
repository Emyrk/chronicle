import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import type { RankingsLeaderboardVerification } from "@/api/typesGenerated"
import {
  verifyRankingsLeaderboard,
  type RankingsLeaderboardParams,
} from "@/api/rankingsQueries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface LeaderboardVerificationControlProps {
  params: RankingsLeaderboardParams
}

function statusLabel(status: string) {
  switch (status) {
    case "match":
      return "Verification matched"
    case "mismatch":
      return "Verification mismatch"
    case "fast_unavailable":
      return "Fast path unavailable"
    case "fast_error":
      return "Fast query failed"
    case "slow_error":
      return "Slow query failed"
    default:
      return "Verification completed"
  }
}

export function LeaderboardVerificationControl({ params }: LeaderboardVerificationControlProps) {
  const [verification, setVerification] = useState<RankingsLeaderboardVerification>()
  const [error, setError] = useState<string>()
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState(false)

  const runVerification = async () => {
    setRunning(true)
    setError(undefined)
    try {
      const response = await verifyRankingsLeaderboard(params)
      if (!response.verification) {
        throw new Error("The verification response did not include comparison results.")
      }
      setVerification(response.verification)
    } catch (cause) {
      setVerification(undefined)
      setError(cause instanceof Error ? cause.message : "Verification failed.")
    } finally {
      setRunning(false)
      setOpen(true)
    }
  }

  const matched = verification?.status === "match"
  const mismatched = verification?.status === "mismatch"

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={runVerification}
        disabled={running}
        className={cn(
          "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 h-10 gap-2 rounded-full border bg-background/95 px-4 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/80",
          matched && "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
          mismatched && "border-destructive/60 text-destructive",
        )}
        aria-label="Verify the visible leaderboard against the reference query"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : matched ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : mismatched ? (
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {running ? "Verifying..." : verification ? "View verification" : "Verify leaderboard"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(85vh,42rem)] max-w-2xl overflow-y-auto styled-scrollbar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              ) : matched ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              )}
              {error ? "Verification failed" : statusLabel(verification?.status ?? "")}
            </DialogTitle>
            <DialogDescription>
              Fast and reference queries used the filters, page, and offset currently visible in the leaderboard.
            </DialogDescription>
          </DialogHeader>

          <div aria-live="polite">
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : verification ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Fast</dt>
                    <dd className="font-mono font-medium">{verification.fast_duration_ms.toLocaleString()} ms</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reference</dt>
                    <dd className="font-mono font-medium">{verification.slow_duration_ms.toLocaleString()} ms</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Fast path</dt>
                    <dd className="font-medium">{verification.fast_query_path || "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Differences</dt>
                    <dd className="font-mono font-medium">{verification.difference_count.toLocaleString()}</dd>
                  </div>
                </dl>

                {verification.fallback_reason && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                    Fast path fallback: {verification.fallback_reason}
                  </p>
                )}

                {verification.differences.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border styled-scrollbar">
                    <table className="w-full min-w-[34rem] text-left text-xs">
                      <thead className="border-b bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Entry</th>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Fast</th>
                          <th className="px-3 py-2">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verification.differences.map((difference, index) => (
                          <tr key={`${difference.entry_index}-${difference.field}-${index}`} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono">{difference.entry_index}</td>
                            <td className="px-3 py-2 font-medium">{difference.field}</td>
                            <td className="max-w-48 truncate px-3 py-2 font-mono" title={difference.fast_value}>{difference.fast_value}</td>
                            <td className="max-w-48 truncate px-3 py-2 font-mono" title={difference.slow_value}>{difference.slow_value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
