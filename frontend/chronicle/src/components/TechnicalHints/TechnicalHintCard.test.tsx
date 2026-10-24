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

  it("marks instance-page hints with the shared flair", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({ context: "instance" })} />);
    const compactMarkup = renderToStaticMarkup(<TechnicalHintCard hint={hint({ context: "instance" })} compact />);

    expect(markup).toContain("When on an instance page");
    expect(compactMarkup).toContain("When on an instance page");
    expect(renderToStaticMarkup(<TechnicalHintCard hint={hint({ context: "instance_panel" })} />)).toContain(
      "Panel on an instance page",
    );
    expect(renderToStaticMarkup(<TechnicalHintCard hint={hint({})} />)).not.toContain("instance page");
  });

  it("bolds only the panel name for panel hints", () => {
    const markup = renderToStaticMarkup(
      <TechnicalHintCard hint={hint({ kind: "panel", title: "The Death Log panel", panel_label: "Death Log" })} />,
    );

    expect(markup).toContain('<strong class="font-bold">Death Log</strong>');
    expect(markup).toContain(">The </span>");
  });

  it("omits the call to action without a link", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({})} />);

    expect(markup).not.toContain("Learn more");
    expect(markup).not.toContain("href=");
  });

  it("renders key combos in the body as keycaps", () => {
    const markup = renderToStaticMarkup(<TechnicalHintCard hint={hint({ body: "Ctrl/Cmd+click encounters, or press Shift+F." })} />);

    expect(markup).toContain(">Ctrl</kbd>");
    expect(markup).toContain(">Cmd</kbd>");
    expect(markup).toContain(">Shift</kbd>");
    expect(markup).toContain(">F</kbd>");
    expect(markup).not.toContain(">click</kbd>");
    expect(markup).toContain(" encounters, or press ");
  });
});
