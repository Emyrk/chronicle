import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomeHero } from "./HomeHero";

function renderHero() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <HomeHero />
    </MemoryRouter>,
  );
}

describe("HomeHero", () => {
  it("shows the replay-first message and Sidekick call to action", () => {
    const markup = renderHero();

    expect(markup).toContain("Every pull,");
    expect(markup).toContain("Get Sidekick, free");
    expect(markup).toContain('href="/download"');
    expect(markup).toContain('href="/recent"');
  });

  it("serves responsive replay video and poster formats", () => {
    const markup = renderHero();

    expect(markup).toContain("ragnaros.webm");
    expect(markup).toContain("ragnaros.mp4");
    expect(markup).toContain("ragnaros-portrait.webm");
    expect(markup).toContain("ragnaros-portrait-poster.webp");
  });
});
