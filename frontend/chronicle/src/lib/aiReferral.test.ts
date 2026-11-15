import { describe, expect, it, vi } from "vitest"
import { aiReferral, trackAIReferral, type AIReferralEnv } from "./aiReferral"

describe("aiReferral", () => {
  it.each([
    ["https://chatgpt.com/", "chatgpt"],
    ["https://chat.openai.com/c/abc", "chatgpt"],
    ["https://www.perplexity.ai/search/x", "perplexity"],
    ["https://perplexity.ai/", "perplexity"],
    ["https://claude.ai/chat/1", "claude"],
    ["https://gemini.google.com/app", "gemini"],
    ["https://copilot.microsoft.com/chats/1", "copilot"],
    ["HTTPS://ChatGPT.com/", "chatgpt"],
  ])("maps referrer %s to %s", (referrer, source) => {
    expect(aiReferral(referrer, "")).toEqual({ source, signal: "referrer" })
  })

  it.each([
    ["chatgpt.com", "chatgpt"],
    ["chatgpt", "chatgpt"],
    ["perplexity.ai", "perplexity"],
    ["claude.ai", "claude"],
    ["gemini.google.com", "gemini"],
    ["copilot.microsoft.com", "copilot"],
    ["ChatGPT.com", "chatgpt"],
    ["www.perplexity.ai", "perplexity"],
  ])("maps utm_source=%s to %s", (utm, source) => {
    expect(aiReferral("", `?utm_source=${utm}&utm_medium=x`)).toEqual({ source, signal: "utm" })
  })

  it("prefers an explicit utm_source over the referrer", () => {
    expect(aiReferral("https://claude.ai/", "?utm_source=chatgpt.com")).toEqual({ source: "chatgpt", signal: "utm" })
  })

  it("falls back to the referrer when utm_source is not an AI assistant", () => {
    expect(aiReferral("https://claude.ai/", "?utm_source=newsletter")).toEqual({ source: "claude", signal: "referrer" })
  })

  it.each([
    "",
    "not a url",
    "https://www.google.com/search?q=chatgpt.com",
    "https://google.com/",
    "https://notchatgpt.com/",
    "https://chatgpt.com.evil.example/",
    "https://evil.example/?ref=claude.ai",
    "https://forever.chronicleclassic.com/recent",
    "https://microsoft.com/",
  ])("ignores referrer %j", (referrer) => {
    expect(aiReferral(referrer, "")).toBeNull()
  })

  it.each(["", "?utm_source=", "?utm_source=google", "?utm_source=__proto__", "?utm_source=constructor", "?q=chatgpt.com"])(
    "ignores search %j",
    (search) => {
      expect(aiReferral("", search)).toBeNull()
    },
  )
})

describe("trackAIReferral", () => {
  function env(overrides: Partial<AIReferralEnv> = {}) {
    const store = new Map<string, string>()
    const gtag = vi.fn()
    const value: AIReferralEnv = {
      gtag,
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
      referrer: "https://chatgpt.com/",
      search: "",
      ...overrides,
    }
    return { value, gtag }
  }

  it("sends the event and sets the user property", () => {
    const { value, gtag } = env()
    expect(trackAIReferral(value)).toEqual({ source: "chatgpt", signal: "referrer" })
    expect(gtag).toHaveBeenNthCalledWith(1, "set", "user_properties", { ai_source: "chatgpt" })
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "ai_referral", { ai_source: "chatgpt", ai_signal: "referrer" })
  })

  it("reports a utm_source with no referrer", () => {
    const { value, gtag } = env({ referrer: "", search: "?utm_source=chatgpt.com" })
    trackAIReferral(value)
    expect(gtag).toHaveBeenCalledWith("event", "ai_referral", { ai_source: "chatgpt", ai_signal: "utm" })
  })

  it("fires once per session", () => {
    const { value, gtag } = env()
    trackAIReferral(value)
    trackAIReferral(value)
    expect(gtag).toHaveBeenCalledTimes(2) // set + event, from the first call only
  })

  it("does not tag a later page view when the first view was not an AI referral", () => {
    const { value, gtag } = env({ referrer: "https://google.com/" })
    trackAIReferral(value)
    trackAIReferral({ ...value, referrer: "https://chatgpt.com/" })
    expect(gtag).not.toHaveBeenCalled()
  })

  it("does nothing without a referral", () => {
    const { value, gtag } = env({ referrer: "" })
    expect(trackAIReferral(value)).toBeNull()
    expect(gtag).not.toHaveBeenCalled()
  })

  it("does nothing without gtag", () => {
    expect(trackAIReferral({ ...env().value, gtag: undefined })).toBeNull()
  })

  it("still reports when storage throws", () => {
    const { value, gtag } = env({
      storage: {
        getItem: () => {
          throw new Error("blocked")
        },
        setItem: () => {
          throw new Error("blocked")
        },
      },
    })
    trackAIReferral(value)
    expect(gtag).toHaveBeenCalledWith("event", "ai_referral", expect.objectContaining({ ai_source: "chatgpt" }))
  })

  it("still reports when storage is unavailable", () => {
    const { value, gtag } = env({ storage: undefined })
    trackAIReferral(value)
    expect(gtag).toHaveBeenCalledTimes(2)
  })
})
