import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { CareerRatingCard } from "./CareerRatingCard";

describe("CareerRatingCard scope", () => {
  for (const scope of ["realm", "server"] as const) {
    it(`labels the ${scope} score and selects its scope`, () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <TooltipProvider>
            <CareerRatingCard scope={scope} onScopeChange={() => {}} onCohortChange={() => {}} isLoading />
          </TooltipProvider>
        </MemoryRouter>,
      );
      expect(html).toContain('aria-label="Career rating scope"');
      expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${scope === "realm" ? "Realm" : "Server"} rating</button>`));
      expect(html).toContain(`data-scope="${scope}"`);
    });
  }
});
