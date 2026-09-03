import { describe, expect, it } from "vitest";
import {
  normalizeTalentBuilds,
  talentBuildLinkDetails,
  talentClassLabel,
} from "./TalentBuilds.utils";

describe("talentBuildLinkDetails", () => {
  it("parses a relative talent builder link and its point split", () => {
    expect(talentBuildLinkDetails("/talents/mage?build=35003-05032-1")).toEqual({
      href: "/talents/mage?build=35003-05032-1",
      classSlug: "mage",
      build: "35003-05032-1",
      points: [11, 10, 1],
    });
  });

  it("accepts a full talent builder URL", () => {
    expect(talentBuildLinkDetails("https://example.com/talents/druid?build=5-12"))
      .toMatchObject({
        href: "https://example.com/talents/druid?build=5-12",
        classSlug: "druid",
        points: [5, 3],
      });
  });

  it("rejects non-talent and unsafe links", () => {
    expect(talentBuildLinkDetails("/rankings")).toBeNull();
    expect(talentBuildLinkDetails("javascript:alert(1)")).toBeNull();
  });
});

describe("normalizeTalentBuilds", () => {
  it("normalizes missing fields without dropping editable rows", () => {
    expect(normalizeTalentBuilds([{ name: "Raid build", url: "/talents/rogue" }, null])).toEqual([
      { name: "Raid build", owner: "", specialization: "", url: "/talents/rogue" },
      { name: "", owner: "", specialization: "", url: "" },
    ]);
  });
});

describe("talentClassLabel", () => {
  it("formats class slugs for display", () => {
    expect(talentClassLabel("deathknight")).toBe("Death Knight");
    expect(talentClassLabel("warlock")).toBe("Warlock");
    expect(talentClassLabel("")).toBe("Talent build");
  });
});
