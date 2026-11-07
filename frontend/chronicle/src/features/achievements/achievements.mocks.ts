import { delay, http, HttpResponse } from "msw";
import { achievementsResponse, type ResponseOptions } from "./achievements.fixtures";

/** MSW handler for GET /api/v1/achievements. Story-only. */
export function achievementsHandler(options: ResponseOptions = {}) {
  return http.get("/api/v1/achievements", () => HttpResponse.json(achievementsResponse(options)));
}

export const loadingAchievementsHandler = http.get("/api/v1/achievements", async () => {
  await delay("infinite");
  return HttpResponse.json({});
});

export const failingAchievementsHandler = http.get("/api/v1/achievements", () => new HttpResponse(null, { status: 500 }));
