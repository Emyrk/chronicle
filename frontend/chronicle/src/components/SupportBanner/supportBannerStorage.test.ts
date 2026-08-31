import { describe, expect, it } from "vitest";
import { buildHideUntilCookie, readHideUntilCookie } from "./supportBannerStorage";

describe("support banner dismissal storage", () => {
  it("reads the shared dismissal cookie among unrelated cookies", () => {
    expect(readHideUntilCookie("theme=dark; support-banner-hide-until=1780000000000; session=abc")).toBe(
      1780000000000,
    );
  });

  it("uses the latest value when host and parent-domain cookies both exist", () => {
    expect(
      readHideUntilCookie(
        "support-banner-hide-until=1770000000000; support-banner-hide-until=1780000000000",
      ),
    ).toBe(1780000000000);
  });

  it("ignores missing and invalid dismissal cookies", () => {
    expect(readHideUntilCookie("theme=dark")).toBe(0);
    expect(readHideUntilCookie("support-banner-hide-until=invalid")).toBe(0);
  });

  it("scopes the cookie to the primary domain so tenant subdomains share it", () => {
    const cookie = buildHideUntilCookie(1780000000000, "chronicleclassic.com", true);

    expect(cookie).toContain("support-banner-hide-until=1780000000000");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Domain=chronicleclassic.com");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("uses a host-only cookie when no primary domain is configured", () => {
    const cookie = buildHideUntilCookie(1780000000000);

    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");
  });
});
