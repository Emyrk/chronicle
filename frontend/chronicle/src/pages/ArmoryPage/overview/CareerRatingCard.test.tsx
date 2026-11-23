import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CareerRatingCard } from "./CareerRatingCard";

describe("CareerRatingCard scope", () => {
  for (const scope of ["realm", "server"] as const) {
    it(`labels the ${scope} score and selects its scope`, () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <CareerRatingCard scope={scope} onScopeChange={() => {}} onCohortChange={() => {}} isLoading />
        </MemoryRouter>,
      );
      expect(html).toContain('aria-label="Career rating scope"');
      expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${scope === "realm" ? "Realm" : "Server"}</button>`));
      expect(html).toContain(scope === "realm" ? "Raids unlocked on this realm." : "All raids unlocked across this server’s realms.");
    });
  }
});
