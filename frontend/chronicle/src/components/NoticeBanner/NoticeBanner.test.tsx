import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TelemetryNotice } from "@/api/typesGenerated";
import { NoticeBanner } from "./NoticeBanner";

function notice(overrides: Partial<TelemetryNotice> = {}): TelemetryNotice {
  return {
    id: "notice-1",
    audience: "public",
    category: "service",
    severity: "info",
    title: "Service update",
    message: "Everything is operating normally.",
    updated_at: "2026-10-04T12:00:00Z",
    ...overrides,
  };
}

describe("NoticeBanner", () => {
  it("renders all supported severity variants as plain text", () => {
    const markup = renderToStaticMarkup(
      <NoticeBanner
        notices={[
          notice({ id: "info", severity: "info", title: "Info" }),
          notice({ id: "warning", severity: "warning", title: "Warning" }),
          notice({ id: "critical", severity: "critical", title: "Critical" }),
        ]}
      />,
    );

    expect(markup).toContain('data-severity="info"');
    expect(markup).toContain('data-severity="warning"');
    expect(markup).toContain('data-severity="critical"');
    expect(markup).toContain("Everything is operating normally.");
  });

  it("renders only HTTPS action links", () => {
    const secureMarkup = renderToStaticMarkup(
      <NoticeBanner
        notices={[
          notice({ action_label: "View status", action_url: "https://status.example.com/incidents/1" }),
        ]}
      />,
    );
    const insecureMarkup = renderToStaticMarkup(
      <NoticeBanner
        notices={[notice({ action_label: "Unsafe", action_url: "http://status.example.com" })]}
      />,
    );

    expect(secureMarkup).toContain('href="https://status.example.com/incidents/1"');
    expect(secureMarkup).toContain("View status");
    expect(insecureMarkup).not.toContain("Unsafe");
    expect(insecureMarkup).not.toContain("href=");
  });
});
