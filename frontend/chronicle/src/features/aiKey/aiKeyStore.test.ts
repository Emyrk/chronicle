import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueAIKey, revokeAIKey } from "@/api/aiKey";
import type { AIKey, AIKeyBenefits } from "@/api/typesGenerated";
import {
  acknowledgeWarning,
  isWarningAcknowledged,
  loadAITarget,
  loadStoredAIKey,
  saveAITarget,
  saveStoredAIKey,
  secretFromResponse,
  storedSecretFor,
} from "./aiKeyStore";
import { aiKeyBannerKind, clientName } from "./aiKeyFormat";
import { pickLifetime } from "./aiKeyFormat";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const key = (id: string): AIKey => ({
  id,
  created_at: "2026-11-07T00:00:00Z",
  expires_at: "2026-11-08T00:00:00Z",
  expired: false,
  private_data: false,
  request_count: 0,
});

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI key secret storage", () => {
  it("returns the secret only for the same key ID", () => {
    saveStoredAIKey({ id: "k1", secret: "ck_one" });
    expect(storedSecretFor("k1")).toBe("ck_one");
    expect(storedSecretFor("k2")).toBeNull();
    saveStoredAIKey(null);
    expect(loadStoredAIKey()).toBeNull();
  });

  it("uses a new secret, else this browser's copy, else asks to rotate", () => {
    saveStoredAIKey({ id: "k1", secret: "ck_one" });
    expect(secretFromResponse({ key: key("k2"), secret: "ck_two" })).toBe("ck_two");
    expect(secretFromResponse({ key: key("k1") })).toBe("ck_one");
    // A key exists but this browser doesn't have it (new device, cleared storage).
    expect(secretFromResponse({ key: key("k3") })).toBeNull();
  });

  it("remembers the warning and the picked AI, defaulting to Other", () => {
    expect(isWarningAcknowledged()).toBe(false);
    acknowledgeWarning();
    expect(isWarningAcknowledged()).toBe(true);
    expect(loadAITarget()).toBe("other");
    saveAITarget("claude");
    expect(loadAITarget()).toBe("claude");
    (window.localStorage as Storage).setItem("chronicle.ai-key.target", "bogus");
    expect(loadAITarget()).toBe("other");
  });
});

describe("issueAIKey", () => {
  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("saves the secret when the server creates a key (201)", async () => {
    const fetchMock = respond(201, { key: key("k9"), created: true, secret: "ck_nine" });
    vi.stubGlobal("fetch", fetchMock);
    await issueAIKey({ lifetime_hours: 24 }, false);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/ai-key", expect.objectContaining({ method: "POST", body: '{"lifetime_hours":24}' }));
    expect(loadStoredAIKey()).toEqual({ id: "k9", secret: "ck_nine" });
  });

  it("keeps the stored secret when the key already exists (200, no secret)", async () => {
    saveStoredAIKey({ id: "k1", secret: "ck_one" });
    vi.stubGlobal("fetch", respond(200, { key: key("k1"), created: false }));
    const resp = await issueAIKey({}, false);
    expect(secretFromResponse(resp)).toBe("ck_one");
  });

  it("rotates on the rotate endpoint and replaces the stored secret", async () => {
    saveStoredAIKey({ id: "k1", secret: "ck_one" });
    const fetchMock = respond(201, { key: key("k2"), created: true, secret: "ck_two" });
    vi.stubGlobal("fetch", fetchMock);
    await issueAIKey({}, true);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me/ai-key/rotate", expect.anything());
    expect(loadStoredAIKey()).toEqual({ id: "k2", secret: "ck_two" });
  });

  it("surfaces the server's message on errors", async () => {
    vi.stubGlobal("fetch", respond(400, { message: "That key lifetime isn't available at your tier.", detail: "lifetime_hours must be one of 1, 24." }));
    await expect(issueAIKey({ lifetime_hours: 720 }, false)).rejects.toThrow("That key lifetime isn't available at your tier. lifetime_hours must be one of 1, 24.");
  });

  it("forgets the secret on revoke", async () => {
    saveStoredAIKey({ id: "k1", secret: "ck_one" });
    vi.stubGlobal("fetch", respond(200, { message: "Your AI key was revoked." }));
    await revokeAIKey();
    expect(loadStoredAIKey()).toBeNull();
  });
});

describe("pickLifetime", () => {
  const benefits = (lifetime_hours: number[]): AIKeyBenefits => ({
    tier: "free",
    lifetime_hours,
    views_per_minute: 30,
    views_per_day: 1000,
    results_per_search: 25,
    private_data: true,
  });

  it("keeps a remembered lifetime the tier still offers, else 24h", () => {
    expect(pickLifetime(benefits([1, 24, 168]), 168)).toBe(168);
    expect(pickLifetime(benefits([1, 24]), 168)).toBe(24);
    expect(pickLifetime(benefits([1, 24]), null)).toBe(24);
    expect(pickLifetime(undefined, null)).toBe(24);
  });
});

describe("aiKeyBannerKind", () => {
  it("is owner only when this browser made the key", () => {
    expect(aiKeyBannerKind(null, "ck_a")).toBeNull();
    expect(aiKeyBannerKind("ck_a", "ck_a")).toBe("owner");
    expect(aiKeyBannerKind("ck_a", "ck_b")).toBe("other");
    expect(aiKeyBannerKind("ck_a", undefined)).toBe("other");
  });
});

describe("clientName", () => {
  it("names known chat AIs from the user-agent", () => {
    expect(clientName("Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)")).toBe("ChatGPT");
    expect(clientName("Claude-User/1.0")).toBe("Claude");
    expect(clientName("Perplexity-User/1.0")).toBe("Perplexity");
    expect(clientName("curl/8.0")).toBe("curl/8.0");
    expect(clientName(undefined)).toBe("None yet");
  });
});
