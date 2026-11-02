import type { AdminRatingJobResponse } from "@/api/typesGenerated";

export type RatingJobAction = "renown-repair" | "rebuild";
export type RatingJobResult = AdminRatingJobResponse;

const endpoints: Record<RatingJobAction, string> = {
  "renown-repair": "/api/v1/admin/ratings/renown/repair",
  rebuild: "/api/v1/admin/ratings/rebuild",
};

export async function enqueueRatingJob(action: RatingJobAction): Promise<RatingJobResult> {
  const response = await fetch(endpoints[action], { method: "POST" });
  if (!response.ok) {
    let message = `Could not enqueue ${action === "rebuild" ? "rating rebuild" : "Renown repair"} (${response.status})`;
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Preserve the HTTP status when the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<RatingJobResult>;
}
