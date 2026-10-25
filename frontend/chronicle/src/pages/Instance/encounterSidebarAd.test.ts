import { describe, expect, it } from "vitest";
import { shouldShowEncounterSidebarAd } from "./encounterSidebarAd";

const collapsedDesktopState = {
  isMobile: false,
  showChronological: false,
  trashOpen: false,
  totalTrash: 34,
};

describe("shouldShowEncounterSidebarAd", () => {
  it("shows the placement below collapsed trash on desktop", () => {
    expect(shouldShowEncounterSidebarAd(collapsedDesktopState)).toBe(true);
  });

  it("hides the placement while trash is expanded", () => {
    expect(shouldShowEncounterSidebarAd({ ...collapsedDesktopState, trashOpen: true })).toBe(false);
  });

  it("hides the placement in chronological and mobile views", () => {
    expect(shouldShowEncounterSidebarAd({ ...collapsedDesktopState, showChronological: true })).toBe(false);
    expect(shouldShowEncounterSidebarAd({ ...collapsedDesktopState, isMobile: true })).toBe(false);
  });

  it("hides the placement when there is no trash section", () => {
    expect(shouldShowEncounterSidebarAd({ ...collapsedDesktopState, totalTrash: 0 })).toBe(false);
  });
});
