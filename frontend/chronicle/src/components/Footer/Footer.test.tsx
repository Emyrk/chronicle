import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";

vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({ data: undefined }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a data-router-link="true" href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("Footer", () => {
  it("uses document navigation for the separately hydrated blog", () => {
    vi.stubGlobal("document", { querySelector: () => null });

    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).toContain('href="/blog"');
    expect(markup).not.toContain('data-router-link="true" href="/blog"');

    vi.unstubAllGlobals();
  });
});
