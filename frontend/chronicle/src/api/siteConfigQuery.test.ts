import { describe, expect, it } from "vitest";
import type { SiteConfig } from "./typesGenerated";
import { uploadsDisabledForSite } from "./siteConfigQuery";

function config(values: Partial<SiteConfig>): SiteConfig {
  return values as SiteConfig;
}

describe("uploadsDisabledForSite", () => {
  it("keeps root and client upload settings separate", () => {
    expect(uploadsDisabledForSite(config({ root_uploads_disabled: true, tenant: {} as SiteConfig["tenant"] }))).toBe(false);
    expect(uploadsDisabledForSite(config({ root_uploads_disabled: true, tenant: null }))).toBe(true);
    expect(uploadsDisabledForSite(config({ client_uploads_disabled: true, tenant: null }))).toBe(true);
  });
});
