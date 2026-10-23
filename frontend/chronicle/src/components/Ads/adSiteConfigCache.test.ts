import { describe, expect, it } from "vitest"
import {
  AD_SITE_CONFIG_CACHE_TTL_MS,
  readCachedAdSiteConfig,
  writeCachedAdSiteConfig,
  type AdSiteConfig,
} from "./adSiteConfigCache"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const enabledConfig: AdSiteConfig = {
  ads_enabled: true,
  billing_enabled: true,
  disabled_ads: ["rail"],
  nitropay_site_id: "12345",
}

describe("ad site config cache", () => {
  it("returns a cached decision immediately for one hour", () => {
    const storage = new MemoryStorage()
    writeCachedAdSiteConfig(enabledConfig, storage, 1_000)

    expect(readCachedAdSiteConfig(storage, 1_000 + AD_SITE_CONFIG_CACHE_TTL_MS - 1)).toEqual(enabledConfig)
    expect(readCachedAdSiteConfig(storage, 1_000 + AD_SITE_CONFIG_CACHE_TTL_MS)).toBeUndefined()
  })

  it("preserves a cached disabled decision", () => {
    const storage = new MemoryStorage()
    const disabledConfig: AdSiteConfig = {
      ads_enabled: false,
      billing_enabled: false,
      disabled_ads: [],
      nitropay_site_id: undefined,
    }
    writeCachedAdSiteConfig(disabledConfig, storage, 1_000)

    expect(readCachedAdSiteConfig(storage, 2_000)).toEqual(disabledConfig)
  })

  it("ignores malformed or future-dated values", () => {
    const storage = new MemoryStorage()
    storage.setItem("chronicle-ad-site-config-v1", "not-json")
    expect(readCachedAdSiteConfig(storage, 1_000)).toBeUndefined()

    writeCachedAdSiteConfig(enabledConfig, storage, 2_000)
    expect(readCachedAdSiteConfig(storage, 1_000)).toBeUndefined()
  })
})
