import { describe, expect, it } from "vitest";
import indexHtml from "../../../index.html?raw";
import { consumeURLAIKey } from "./urlAIKey";

const head = indexHtml.slice(indexHtml.indexOf("<head>"), indexHtml.indexOf("</head>"));
const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const stripScript = scripts[0]?.body ?? "";

interface Run {
  href: string;
  replaced: string[];
  window: Record<string, unknown>;
  touched: string[];
}

/**
 * run executes index.html's inline script against a fake page. Any global it
 * reads other than location, history and window (document, localStorage,
 * fetch, cookies…) throws, so the test fails if the script ever tries to log
 * the viewer in or send the key anywhere.
 */
function run(url: string): Run {
  const u = new URL(url);
  const result: Run = { href: url, replaced: [], window: {}, touched: [] };
  const location = {
    get search() { return u.search; },
    get pathname() { return u.pathname; },
    get hash() { return u.hash; },
  };
  const history = {
    state: { idx: 0 },
    replaceState(_state: unknown, _title: string, next: string) {
      result.replaced.push(next);
      const n = new URL(next, u.origin);
      u.pathname = n.pathname;
      u.search = n.search;
      u.hash = n.hash;
      result.href = u.href;
    },
  };
  const win = new Proxy(result.window, {
    set(target, prop, value) {
      result.touched.push(String(prop));
      target[String(prop)] = value;
      return true;
    },
    defineProperty(target, prop, descriptor) {
      result.touched.push(String(prop));
      return Reflect.defineProperty(target, prop, descriptor);
    },
  });
  const forbidden = new Proxy({}, { get(_t, prop) { throw new Error(`script touched ${String(prop)}`); } });
  // Shadow every global a login or leak would need.
  const fn = new Function(
    "location", "history", "window", "document", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "navigator",
    stripScript,
  );
  fn(location, history, win, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden);
  return result;
}

describe("index.html ai_key strip script", () => {
  it("is the first script in <head>, before gtag and any other script", () => {
    expect(stripScript).toContain("ai_key");
    expect(scripts[0].attrs.trim()).toBe("");
    const stripAt = head.indexOf(stripScript);
    const firstOther = Math.min(
      ...["googletagmanager", "gtag(", "HERO_CLIPS", "nitropay", "adsbygoogle"]
        .map((s) => head.indexOf(s))
        .filter((i) => i >= 0),
    );
    expect(stripAt).toBeGreaterThan(-1);
    expect(stripAt + stripScript.length).toBeLessThan(firstOther);
  });

  it("removes ai_key and keeps other parameters and the hash as written", () => {
    const r = run("https://epoch.chronicleclassic.com/instances/abc?view=dps&ai_key=ck_secret&q=a%20b#boss-3");
    expect(r.href).toBe("https://epoch.chronicleclassic.com/instances/abc?view=dps&q=a%20b#boss-3");
    expect(r.window.__chronicleAIKey).toBe("ck_secret");
    // Hidden from anything that walks window's properties, but deletable.
    expect(Object.keys(r.window)).not.toContain("__chronicleAIKey");
    expect(consumeURLAIKey(r.window as { __chronicleAIKey?: string })).toBe("ck_secret");
    expect("__chronicleAIKey" in r.window).toBe(false);
  });

  it("removes a lone key, repeated keys and the encoded ai%5Fkey name", () => {
    expect(run("https://x.test/search?ai_key=ck_a").href).toBe("https://x.test/search");
    expect(run("https://x.test/g/1?ai_key=ck_a&tab=x&ai%5Fkey=ck_b").href).toBe("https://x.test/g/1?tab=x");
  });

  it("does nothing without a key", () => {
    const r = run("https://x.test/instances/abc?view=dps&not_ai_key=1");
    expect(r.replaced).toEqual([]);
    expect(r.touched).toEqual([]);
  });

  it("never logs the viewer in: it only rewrites the address bar and hands the key to the banner", () => {
    const r = run("https://x.test/armory/realm/name?ai_key=ck_secret");
    expect(r.touched).toEqual(["__chronicleAIKey"]);
    expect(r.replaced).toEqual(["/armory/realm/name"]);
  });
});

describe("consumeURLAIKey", () => {
  it("returns the stripped key once and forgets it", () => {
    const w = { __chronicleAIKey: "ck_secret" } as { __chronicleAIKey?: string };
    expect(consumeURLAIKey(w)).toBe("ck_secret");
    expect(consumeURLAIKey(w)).toBeNull();
    expect("__chronicleAIKey" in w).toBe(false);
  });
});
