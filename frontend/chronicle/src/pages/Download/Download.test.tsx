import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { SiteConfig } from "@/api/typesGenerated";
import { DownloadView } from "./Download";
import { detectOS, type OS } from "./platforms";
import { tenantClients } from "./formatAddons";

function config(default_format: string | null, available_formats: string[] = []): SiteConfig {
  return { default_format: null, available_formats: [], tenant: { default_format, available_formats } } as unknown as SiteConfig;
}

function render(os: OS, siteConfig: SiteConfig) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DownloadView os={os} clients={tenantClients(siteConfig)} />
    </MemoryRouter>,
  );
}

describe("tenantClients", () => {
  it("puts the tenant's default format first and collapses formats sharing an addon", () => {
    const clients = tenantClients(config("3.3.5a-cc-addon", ["azerothcore-mod", "2.4.3-cc-addon", "3.3.5a-cc-addon"]));
    expect(clients.map((c) => c.addon?.name)).toEqual(["ChronicleCompanionWoTLK", "ChronicleCompanionTBC"]);
  });

  it("offers 1.14 as the alternate on a 1.12 tenant", () => {
    const clients = tenantClients(config("1.12a-cc-addon", ["1.12a-cc-addon", "hermesproxy_1_14_2_cc"]));
    expect(clients.map((c) => c.label)).toEqual(["1.12", "1.14"]);
  });

  it("gives WoW Forever no addon", () => {
    expect(tenantClients(config("v22-cleu"))[0].addon).toBeNull();
  });
});

describe("DownloadView", () => {
  it("shows a client picker with the default selected when the tenant has several formats", () => {
    const markup = render("windows", config("1.12a-cc-addon", ["hermesproxy_1_14_2_cc"]));
    expect(markup).toContain('aria-pressed="true">1.12');
    expect(markup).toContain('aria-pressed="false">1.14');
    expect(markup).toContain("Add Nampower");
  });

  it("tells players to add their WoW folder in Sidekick", () => {
    expect(render("windows", config("1.12a-cc-addon"))).toContain("Add WoW folder…");
  });

  it("hides the picker with a single format", () => {
    expect(render("windows", config("1.12a-cc-addon"))).not.toContain("Your client");
  });

  it("links the tenant's addon instead of telling players to type /combatlog", () => {
    const markup = render("windows", config("1.12a-cc-addon"));
    expect(markup).toContain("https://github.com/Emyrk/ChronicleCompanion/");
    expect(markup).toContain("Nampower");
    expect(markup).not.toContain("/combatlog");
  });

  it("adds a 1.12a step for Nampower and optional positional mods", () => {
    const markup = render("windows", config("1.12a-cc-addon"));
    expect(markup).toContain("Five steps");
    expect(markup).toContain("Add Nampower");
    expect(markup).toContain("ClassicAPI");
    expect(markup).toContain("SuperWoW doesn&#x27;t record enemy unit positions");
  });

  it("offers the WoTLK bridge as an optional step on 3.3.5a", () => {
    const markup = render("windows", config("3.3.5a-cc-addon"));
    expect(markup).toContain("Optional: unit positions");
    expect(markup).toContain("https://github.com/Emyrk/ChronicleSidekickBridgeWoTLK");
    expect(markup).toContain("Addons for 3.3.5a");
    expect(markup).not.toContain("Nampower");
  });

  it("keeps three steps when the addon needs no client mods", () => {
    expect(render("windows", config("2.4.3-cc-addon"))).toContain("Four steps");
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
