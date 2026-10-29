import { describe, expect, it } from "vitest";
import indexHtml from "../../../index.html?raw";
import clipsJson from "../../../public/c/images/landing/clips/clips.json?raw";
import { CLIPS_URL, resolveClips, type HeroClip } from "./heroClips";

describe("hero clips", () => {
  it("index.html's poster shell lists clips.json's clips and posters", () => {
    const list = indexHtml.match(/var HERO_CLIPS = (\[[\s\S]*?\]);/)?.[1];
    expect(list).toBeDefined();
    const clips = resolveClips(JSON.parse(clipsJson) as HeroClip[], new URL(CLIPS_URL, "https://chronicle.example").href);
    expect(JSON.parse(list!)).toEqual(clips.map((clip) => [clip.slug, clip.poster, clip.portrait.poster]));
  });
});
