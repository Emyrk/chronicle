import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstructionsChronicleCompanion } from "./InstructionsChronicleCompanion";

describe("InstructionsChronicleCompanion", () => {
  it("marks SuperWoW's friendly-only positions for Nightmare of Ursol", () => {
    const markup = renderToStaticMarkup(<InstructionsChronicleCompanion nightmareOfUrsol />);

    expect(markup).toContain("Friendly positions only");
    expect(markup).toContain("SuperWoW only emits positional data for friendly units");
    expect(markup).toContain("Switch to ClassicAPI for positional data on all units");
  });

  it("does not show the limitation for other flavors", () => {
    const markup = renderToStaticMarkup(<InstructionsChronicleCompanion />);

    expect(markup).not.toContain("Friendly positions only");
    expect(markup).not.toContain("SuperWoW only emits positional data for friendly units");
  });
});
