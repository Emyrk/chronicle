import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { aiReferral, trackAIReferral } from "../src/aiReferral.ts";

test("maps AI assistant referrers", () => {
  for (const [referrer, source] of [
    ["https://chatgpt.com/", "chatgpt"],
    ["https://chat.openai.com/c/abc", "chatgpt"],
    ["https://www.perplexity.ai/search/x", "perplexity"],
    ["https://claude.ai/chat/1", "claude"],
    ["https://gemini.google.com/app", "gemini"],
    ["https://copilot.microsoft.com/chats/1", "copilot"],
  ]) {
    assert.deepEqual(aiReferral(referrer, ""), { source, signal: "referrer" }, referrer);
  }
});

test("maps AI assistant utm_source values and prefers them over the referrer", () => {
  assert.deepEqual(aiReferral("", "?utm_source=chatgpt.com"), { source: "chatgpt", signal: "utm" });
  assert.deepEqual(aiReferral("", "?utm_source=perplexity.ai"), { source: "perplexity", signal: "utm" });
  assert.deepEqual(aiReferral("https://claude.ai/", "?utm_source=chatgpt.com"), { source: "chatgpt", signal: "utm" });
  assert.deepEqual(aiReferral("https://claude.ai/", "?utm_source=newsletter"), { source: "claude", signal: "referrer" });
});

test("ignores everything else", () => {
  for (const referrer of ["", "not a url", "https://google.com/search?q=chatgpt.com", "https://notchatgpt.com/", "https://chatgpt.com.evil.example/"]) {
    assert.equal(aiReferral(referrer, ""), null, referrer);
  }
  for (const search of ["", "?utm_source=google", "?utm_source=__proto__", "?q=chatgpt.com"]) {
    assert.equal(aiReferral("", search), null, search);
  }
});

test("sends one ai_referral event and user property per session", () => {
  const calls = [];
  const store = new Map();
  const env = {
    gtag: (...args) => calls.push(args),
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    referrer: "https://chatgpt.com/",
    search: "",
  };
  assert.deepEqual(trackAIReferral(env), { source: "chatgpt", signal: "referrer" });
  trackAIReferral(env);
  assert.deepEqual(calls, [
    ["set", "user_properties", { ai_source: "chatgpt" }],
    ["event", "ai_referral", { ai_source: "chatgpt", ai_signal: "referrer" }],
  ]);
  assert.equal(trackAIReferral({ ...env, gtag: undefined }), null);
});

test("the app and landing copies stay identical", async () => {
  const landing = await readFile(new URL("../src/aiReferral.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../../chronicle/src/lib/aiReferral.ts", import.meta.url), "utf8");
  assert.equal(landing, app);
});

test("the landing analytics entry reports AI referrals after configuring GA4", async () => {
  const analytics = await readFile(new URL("../src/analytics.ts", import.meta.url), "utf8");
  assert.match(analytics, /trackAIReferral\(/);
  assert.ok(analytics.indexOf("gtag(\"config\"") < analytics.indexOf("trackAIReferral("));
});
