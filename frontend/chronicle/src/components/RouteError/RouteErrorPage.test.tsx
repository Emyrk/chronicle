import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { RouteErrorPage } from "./RouteErrorPage";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useRouteError: () => new Error("Failed to remove child"),
}));

afterEach(() => vi.unstubAllGlobals());

it("renders a standalone recovery page with report exports and collapsed diagnostics", () => {
  vi.stubGlobal("window", { location: { href: "https://example.com/instances/abc" }, innerWidth: 800, innerHeight: 600 });
  vi.stubGlobal("navigator", { userAgent: "test-browser", language: "en", onLine: true });
  vi.stubGlobal("document", { querySelector: () => null });
  const markup = renderToStaticMarkup(<RouteErrorPage />);
  expect(markup).toContain("This page hit a snag.");
  expect(markup).toContain("Reload page");
  expect(markup).toContain('href="/"');
  expect(markup).toContain("Copy report");
  expect(markup).toContain("Download report");
  expect(markup).toContain("Nothing is sent automatically.");
  expect(markup).toContain('<details class="mt-4">');
  expect(markup).not.toContain("<details open");
  expect(markup).toContain('role="status"');
  expect(markup).toContain("Failed to remove child");
  expect(markup).not.toContain("Hey developer");
});
