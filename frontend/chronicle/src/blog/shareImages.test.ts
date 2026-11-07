import { describe, expect, it } from "vitest";
import fixtures from "../../../../services/og/app/lib/og-preview-cases.json";
import { BLOG_POSTS } from "./blogRegistry";
import { SHARE_IMAGE_EXAMPLES, SHARE_IMAGES_DURATION, shareImagePath } from "./videos/shareImagesData";

describe("share images article", () => {
  it("embeds the registered video without opting into feature hints", () => {
    const post = BLOG_POSTS.find((entry) => entry.id === "share-images");
    expect(post?.hintEnabled).toBe(false);
    expect(post?.video).toMatchObject({ durationInFrames: SHARE_IMAGES_DURATION, fps: 30, width: 1280, height: 720 });
  });

  it("only illustrates released fixtures and ships every image locally", () => {
    const images = import.meta.glob("../../public/c/images/blog/share-images/*.png", { eager: true, query: "?url", import: "default" });
    expect(SHARE_IMAGE_EXAMPLES).toHaveLength(6);
    for (const example of SHARE_IMAGE_EXAMPLES) {
      const fixture = fixtures.find((entry) => entry.id === example.id);
      expect(fixture).toBeDefined();
      expect(fixture?.status).not.toBe("Not released");
      expect(images[`../../public${shareImagePath(example.id)}`]).toEqual(expect.any(String));
    }
  });
});
