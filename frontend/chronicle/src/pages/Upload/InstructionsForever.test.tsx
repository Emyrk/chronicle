import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InstructionsForever } from "./InstructionsForever";

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <InstructionsForever />
    </MemoryRouter>,
  );
}

describe("InstructionsForever", () => {
  it("links both addon sources", () => {
    const markup = render();

    expect(markup).toContain("https://github.com/Emyrk/ChronicleCompanionForever");
    expect(markup).toContain("https://www.curseforge.com/wow/addons/chroniclecompanionforever");
    expect(markup).toContain("GitHub");
    expect(markup).toContain("CurseForge");
  });

  it("links to the Chronicle Sidekick download page", () => {
    const markup = render();

    expect(markup).toContain("Chronicle Sidekick");
    expect(markup).toContain('href="/download"');
  });
});
