import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";

const mocks = vi.hoisted(() => ({
  siteConfig: undefined as { billing_enabled: boolean } | undefined,
}));

vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({ data: mocks.siteConfig }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a data-router-link="true" href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  mocks.siteConfig = undefined;
  vi.unstubAllGlobals();
});

describe("Footer", () => {
  it("uses document navigation for the separately hydrated blog", () => {
    vi.stubGlobal("document", { querySelector: () => null });

    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).toContain('href="/blog"');
    expect(markup).not.toContain('data-router-link="true" href="/blog"');
    expect(markup).toContain('data-router-link="true" href="/refund-policy"');
    expect(markup).toContain("Refund Policy");
  });

  it("hides supporter billing when billing is disabled", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    mocks.siteConfig = { billing_enabled: false };

    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).not.toContain("Support Chronicle");
    expect(markup).not.toContain('href="/supporter"');
    expect(markup).toContain("Donate to Chronicle");
    expect(markup).toContain('href="https://chronicleclassic.com/support/"');
  });

  it("shows supporter billing when billing is enabled", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    mocks.siteConfig = { billing_enabled: true };

    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).toContain("Support Chronicle");
    expect(markup).toContain('href="/supporter"');
    expect(markup).toContain("Perks");
  });
});
