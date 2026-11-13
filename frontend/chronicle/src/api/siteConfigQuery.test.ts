import { describe, expect, it } from "vitest";
import type { SiteConfig } from "./typesGenerated";
import { rootUploadsDisabledForSite, uploadsDisabledForSite } from "./siteConfigQuery";

function config(values: Partial<SiteConfig>): SiteConfig {
  return values as SiteConfig;
}

describe("uploadsDisabledForSite", () => {
  it("keeps root and client upload settings separate", () => {
    expect(uploadsDisabledForSite(config({ root_uploads_disabled: true, tenant: {} as SiteConfig["tenant"] }))).toBe(false);
    expect(uploadsDisabledForSite(config({ root_uploads_disabled: true, tenant: null }))).toBe(true);
    expect(uploadsDisabledForSite(config({ client_uploads_disabled: true, tenant: null }))).toBe(true);
  });

  it("identifies when choosing another community can enable uploads", () => {
    expect(rootUploadsDisabledForSite(config({ root_uploads_disabled: true, client_uploads_disabled: false, tenant: null }))).toBe(true);
    expect(rootUploadsDisabledForSite(config({ root_uploads_disabled: true, client_uploads_disabled: true, tenant: null }))).toBe(false);
    expect(rootUploadsDisabledForSite(config({ root_uploads_disabled: true, client_uploads_disabled: false, tenant: {} as SiteConfig["tenant"] }))).toBe(false);
  });
});
