import { describe, expect, it } from "vitest";
import {
  aiTarget,
  bossForPrompt,
  characterAIURL,
  guildAIURL,
  instanceAIURL,
  searchAIURL,
  buildAIText,
  buildOpenURL,
  fillPrompt,
  formatLifetime,
  searchEqualsValue,
  stripAIKeyFromSearch,
  suggestionsFor,
  withAIKey,
} from "./aiLinks";
import { AI_AVAILABLE_FEATURES, AI_PROMPTS, AI_TARGETS, type AIPromptFeature } from "./aiPrompts";

const allRaidValues = { guild: "Nightfall", raid: "Molten Core", boss: "Ragnaros", realm: "Nordanaar" };

describe("suggestionsFor", () => {
  it("lists only the current page type's questions", () => {
    const raid = suggestionsFor("raid", allRaidValues);
    const guild = suggestionsFor("guild", allRaidValues);
    expect(raid).toContain("Which boss did we lose the most time on tonight, and how many attempts did each boss take?");
    expect(raid.some((q) => q.startsWith("Which boss is Nightfall's wipe sink"))).toBe(false);
    expect(guild).toContain("Which boss is Nightfall's wipe sink, and are we getting better at it week over week?");
    expect(guild).not.toContain(raid[0]);
  });

  it("fills placeholders from the page", () => {
    expect(suggestionsFor("raid", allRaidValues)).toContain(
      "Compare this clear to Nightfall's last few Molten Core runs. Where did the time go: bosses, trash or idle?",
    );
    expect(suggestionsFor("character", { character: "Thrall" })).toContain(
      "Which guilds has Thrall raided with, and how recently?",
    );
  });

  it("hides a question whose placeholder can't be filled", () => {
    const noBoss = suggestionsFor("raid", { ...allRaidValues, boss: undefined });
    expect(noBoss.some((q) => q.includes("wipe in on each attempt"))).toBe(false);
    const blankGuild = suggestionsFor("raid", { ...allRaidValues, guild: "  " });
    expect(blankGuild.some((q) => q.startsWith("Compare this clear"))).toBe(false);
    // Questions without placeholders still show.
    expect(suggestionsFor("character", {})).toEqual([]);
    expect(suggestionsFor("search", {})).toHaveLength(3);
  });

  it("hides a question whose required feature isn't available", () => {
    const none = new Set<AIPromptFeature>();
    const withoutSummaries = suggestionsFor("raid", allRaidValues, none);
    expect(withoutSummaries).not.toContain("Who died first on each wipe, and to what?");
    expect(withoutSummaries).not.toContain("Who had no flask or elixirs on boss pulls?");
    const deathsOnly = suggestionsFor("raid", allRaidValues, new Set<AIPromptFeature>(["deaths-summary"]));
    expect(deathsOnly).toContain("Who died first on each wipe, and to what?");
    expect(deathsOnly).not.toContain("Who had no flask or elixirs on boss pulls?");
  });

  it("turns on the car 5 summaries by default", () => {
    expect(AI_AVAILABLE_FEATURES.has("deaths-summary")).toBe(true);
    expect(AI_AVAILABLE_FEATURES.has("consumes-summary")).toBe(true);
    expect(suggestionsFor("raid", allRaidValues)).toHaveLength(AI_PROMPTS.raid.length);
  });
});

describe("fillPrompt", () => {
  it("returns null when any placeholder is missing", () => {
    expect(fillPrompt("{guild} on {realm}", { guild: "A" })).toBeNull();
    expect(fillPrompt("{guild} on {realm}", { guild: "A", realm: "B" })).toBe("A on B");
  });
});

describe("buildAIText", () => {
  it("is just the link by default", () => {
    expect(buildAIText("https://x.test/a?ai_key=ck_1")).toBe("https://x.test/a?ai_key=ck_1");
    expect(buildAIText("https://x.test/a", "  ")).toBe("https://x.test/a");
  });

  it("puts the question first, then a blank line, then the link", () => {
    expect(buildAIText("https://x.test/a", "Who died?")).toBe("Who died?\n\nhttps://x.test/a");
  });
});

describe("buildOpenURL", () => {
  const link = "https://epoch.chronicleclassic.com/search?q=class%3DDRUID&ai_key=ck_1";
  const text = buildAIText(link, "Tanks & healers #1?\nThanks");

  it("builds each prefill URL and encodes &, #, newlines and the link's own query", () => {
    const encoded = encodeURIComponent(text);
    expect(encoded).not.toMatch(/[&#\n ]/);
    expect(buildOpenURL(aiTarget("chatgpt"), text)).toBe(`https://chatgpt.com/?q=${encoded}`);
    expect(buildOpenURL(aiTarget("claude"), text)).toBe(`https://claude.ai/new?q=${encoded}`);
    expect(buildOpenURL(aiTarget("grok"), text)).toBe(`https://grok.com/?q=${encoded}`);
    expect(buildOpenURL(aiTarget("perplexity"), text)).toBe(`https://www.perplexity.ai/search?q=${encoded}`);
  });

  it("round-trips the text through the q parameter", () => {
    for (const target of AI_TARGETS) {
      const url = buildOpenURL(target, text);
      if (!url) continue;
      expect(new URL(url).searchParams.get("q")).toBe(text);
    }
  });

  it("is copy-only for Gemini and Other", () => {
    expect(buildOpenURL(aiTarget("gemini"), text)).toBeNull();
    expect(buildOpenURL(aiTarget("other"), text)).toBeNull();
  });
});

describe("withAIKey", () => {
  it("adds the key, keeps other parameters and drops the hash and any old key", () => {
    expect(withAIKey("https://x.test/instances/abc#boss", "ck_1")).toBe("https://x.test/instances/abc?ai_key=ck_1");
    expect(withAIKey("https://x.test/search?q=a%20b&ai_key=ck_old", "ck_1")).toBe("https://x.test/search?q=a%20b&ai_key=ck_1");
  });

  it("strips ai_key only", () => {
    expect(stripAIKeyFromSearch("?a=1&ai_key=x&b=2")).toBe("?a=1&b=2");
    expect(stripAIKeyFromSearch("?ai%5Fkey=x")).toBe("");
    expect(stripAIKeyFromSearch("")).toBe("");
  });
});

describe("formatLifetime", () => {
  it("reads naturally", () => {
    expect([1, 24, 168, 720, 2160].map(formatLifetime)).toEqual(["1 hour", "24 hours", "7 days", "30 days", "90 days"]);
  });
});

describe("bossForPrompt", () => {
  const e = (name: string, kill_type: string, boss = true) => ({ name, kill_type, boss });
  const encounters = [e("Lucifron", "clean"), e("Ragnaros", "wipe"), e("Ragnaros", "wipe"), e("Golemagg", "wipe"), e("Ragnaros", "clean"), e("Trash", "wipe", false)];

  it("picks the boss with the most wipes", () => {
    expect(bossForPrompt(encounters)).toBe("Ragnaros");
  });

  it("prefers the boss being viewed when it has wipes", () => {
    expect(bossForPrompt(encounters, [e("Golemagg", "wipe")])).toBe("Golemagg");
    expect(bossForPrompt(encounters, [e("Lucifron", "clean")])).toBe("Ragnaros");
  });

  it("is null without boss wipes, so the question hides", () => {
    expect(bossForPrompt([e("Lucifron", "clean"), e("Trash", "wipe", false)])).toBeNull();
  });
});

describe("searchEqualsValue", () => {
  const tree = {
    and: [
      { field: "instance.realm", op: "=", value: "Nordanaar" },
      { any_player: { and: [{ field: "player.class", op: "=", value: "DRUID" }] } },
      { or: [{ field: "instance.guild", op: "=", value: "A" }] },
      { not: { field: "instance.name", op: "=", value: "MC" } },
    ],
  };

  it("finds equality filters every result shares", () => {
    expect(searchEqualsValue(tree, "instance.realm")).toBe("Nordanaar");
    expect(searchEqualsValue(tree, "player.class")).toBe("DRUID");
  });

  it("ignores OR, NOT and missing filters", () => {
    expect(searchEqualsValue(tree, "instance.guild")).toBeNull();
    expect(searchEqualsValue(tree, "instance.name")).toBeNull();
    expect(searchEqualsValue(undefined, "instance.realm")).toBeNull();
  });
});

describe("AI page URLs", () => {
  const origin = "https://epoch.chronicleclassic.com";

  it("links pages that have an agent view, without view state", () => {
    expect(instanceAIURL(origin, "mc-2026-11-07")).toBe(`${origin}/instances/mc-2026-11-07`);
    expect(characterAIURL(origin, "Nordanaar", "Thrall")).toBe(`${origin}/armory/Nordanaar/Thrall`);
    expect(characterAIURL(origin, "Tel'Abim", "Æthel")).toBe(`${origin}/armory/Tel'Abim/%C3%86thel`);
    // A guild sub-tab copies the guild root.
    expect(guildAIURL(origin, "0b6f1c2e")).toBe(`${origin}/g/0b6f1c2e`);
  });

  it("sends search to the keyed GET search as markdown, with the POST where tree and sort", () => {
    const where = {
      and: [
        { field: "instance.name", op: "=", value: "Molten Core" },
        { any_player: { and: [{ field: "player.class", op: "=", value: "DRUID" }] } },
        { field: "instance.guild", op: "contains", value: "A&B #1" },
      ],
    };
    const url = searchAIURL(origin, { where, sort: { field: "instance.clear_time_ms", direction: "asc" } });
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(`${origin}/api/external/v1/raidlogs/search`);
    expect(JSON.parse(u.searchParams.get("where")!)).toEqual(where);
    expect(u.searchParams.get("sort")).toBe("instance.clear_time_ms");
    expect(u.searchParams.get("dir")).toBe("asc");
    expect(u.searchParams.get("format")).toBe("md");
    expect(u.hash).toBe("");
    // The key goes on last and the where tree survives.
    const keyed = new URL(withAIKey(url, "ck_1"));
    expect(keyed.searchParams.get("ai_key")).toBe("ck_1");
    expect(JSON.parse(keyed.searchParams.get("where")!)).toEqual(where);
  });

  it("omits where and sort when the search has none", () => {
    expect(searchAIURL(origin, {})).toBe(`${origin}/api/external/v1/raidlogs/search?format=md`);
    expect(searchAIURL(origin, { sort: { field: "instance.started_at" } })).toBe(
      `${origin}/api/external/v1/raidlogs/search?sort=instance.started_at&format=md`,
    );
  });
});
