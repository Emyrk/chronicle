import { useSession } from "@/api/queries";
import type { LandingFeaturedUpload } from "@/api/typesGenerated";

/** Who is looking at the run: the Sidekick strip pitches to visitors, offers Share to members, and hides for the owner. */
export type SidekickStripViewer = "visitor" | "member" | "owner";

export function sidekickStripViewer(userId: string | undefined, logOwner: string | undefined): SidekickStripViewer {
  if (!userId) return "visitor";
  return logOwner && userId === logOwner ? "owner" : "member";
}

/** The viewer once the session is known; null while it loads, so signed-in users never see the pitch flash. */
export function useSidekickStripViewer(logOwner: string | undefined): SidekickStripViewer | null {
  const { data: session, isLoading } = useSession();
  if (isLoading) return null;
  return sidekickStripViewer(session?.user_id, logOwner);
}

/** "3 min", rounding up to at least a minute; long delays read in hours or days. */
export function formatUploadDelay(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export interface SidekickStripCopy {
  text: string;
  /** Second half of the line, in the accent colour. */
  accent?: string;
  button: string;
}

export function sidekickStripCopy(upload: LandingFeaturedUpload | undefined): SidekickStripCopy {
  if (upload?.source === "sidekick") {
    const delay = upload.delay_ms;
    return {
      text: delay != null ? `Recorded by Sidekick, ${formatUploadDelay(delay)} after the group left.` : "Recorded by Sidekick.",
      button: "Get yours",
    };
  }
  return { text: "Ran a dungeon this week? ", accent: "Yours can be here tonight.", button: "Get Sidekick" };
}

export function sidekickDownloadUrl(instanceId: string): string {
  return `/download?${new URLSearchParams({ utm_source: "run", utm_content: instanceId })}`;
}
