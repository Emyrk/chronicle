import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { SiteConfig } from "@/api/typesGenerated";
import { DownloadView } from "./Download";
import { detectOS, type OS } from "./platforms";
import { tenantAddons } from "./formatAddons";

function config(default_format: string | null, available_formats: string[] = []): SiteConfig {
  return { default_format: null, available_formats: [], tenant: { default_format, available_formats } } as unknown as SiteConfig;
}

function render(os: OS, siteConfig: SiteConfig) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DownloadView os={os} addons={tenantAddons(siteConfig)} />
    </MemoryRouter>,
  );
}

describe("tenantAddons", () => {
  it("puts the tenant's default format addon first and dedupes the rest", () => {
    const { addons, defaultNeedsNoAddon } = tenantAddons(
      config("3.3.5a-cc-addon", ["azerothcore-mod", "2.4.3-cc-addon", "3.3.5a-cc-addon"]),
    );
    expect(addons.map((a) => a.name)).toEqual(["ChronicleCompanionWoTLK", "ChronicleCompanionTBC"]);
    expect(defaultNeedsNoAddon).toBe(false);
  });

  it("flags WoW Forever as needing no addon", () => {
    expect(tenantAddons(config("v22-cleu")).defaultNeedsNoAddon).toBe(true);
  });
});

describe("DownloadView", () => {
  it("links the tenant's addon instead of telling players to type /combatlog", () => {
    const markup = render("windows", config("1.12a-cc-addon"));
    expect(markup).toContain("https://github.com/Emyrk/ChronicleCompanion/");
    expect(markup).toContain("Nampower");
    expect(markup).not.toContain("/combatlog");
  });

  it("links the latest release asset for the detected OS", () => {
    const markup = render("macos", config("2.4.3-cc-addon"));
    expect(markup).toContain("Download for macOS");
    expect(markup).toContain("releases/latest/download/Chronicle-Sidekick-macos.zip");
    expect(markup).toContain("ChronicleCompanionTBC");
  });

  it("falls back to /combatlog only when the format has no addon", () => {
    expect(render("linux", config("v22-cleu"))).toContain("/combatlog");
  });
});

describe("detectOS", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "macos"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "windows"],
  ])("%s → %s", (ua, os) => {
    expect(detectOS(ua)).toBe(os);
  });
});
