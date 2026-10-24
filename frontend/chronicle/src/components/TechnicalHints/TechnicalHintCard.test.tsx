import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TechnicalHintCard } from "./TechnicalHintCard";
import type { TechnicalHint } from "./types";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a data-router-link="true" href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/useDatasetId", () => ({ useIconBaseUrl: () => "" }));

const hint = (overrides: Partial<TechnicalHint>): TechnicalHint => ({
  id: "hint",
  kind: "tip",
  title: "Title",
  body: "Body",
  ...overrides,
});

describe("TechnicalHintCard", () => {
  it("uses document navigation for blog posts served outside the SPA", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({ kind: "blog", href: "/blog/player-timeline" })} />);

    expect(markup).toContain('href="/blog/player-timeline"');
    expect(markup).not.toContain("data-router-link");
  });

  it("uses the router for SPA routes", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({ href: "/technical/hints" })} />);

    expect(markup).toContain('data-router-link="true" href="/technical/hints"');
  });

  it("omits the call to action without a link", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({})} />);

    expect(markup).not.toContain("Learn more");
    expect(markup).not.toContain("href=");
  });
});
