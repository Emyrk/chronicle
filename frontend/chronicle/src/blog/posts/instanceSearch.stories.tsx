import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import type { BlogPostDefinition } from "../blogRegistry";
import { InstanceSearchPost } from "./instanceSearch";

/**
 * Preview of the unregistered instance search announcement. The metadata here
 * is the draft for assets/<tenant>/generated/blog-posts.json.
 */
const draft: BlogPostDefinition = {
  id: "instance-search",
  title: "Instance search",
  description:
    "Find any raid on Chronicle by zone, bosses, speed, parses and roster, then see exactly why each run matched. Build searches with a form, blocks or code.",
  publishedAt: "2026-11-04",
  rarity: "epic",
  tag: "Feature",
  icon: "inv_misc_spyglass_03",
  flavor: "Seek, and ye shall find.",
  hintTitle: "Search every raid",
  hintDescription: "Find runs by zone, bosses, speed, parses and roster, and see why each one matched.",
  hintHref: "/search",
  video: {
    load: () => import("@/pages/InstanceSearch/videos/InstanceSearch.video"),
    durationInFrames: 970,
    fps: 30,
    width: 1280,
    height: 720,
  },
  component: InstanceSearchPost,
};

const meta: Meta<typeof InstanceSearchPost> = {
  title: "Blog/Drafts/InstanceSearch",
  component: InstanceSearchPost,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="dark min-h-screen bg-background text-foreground">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
export default meta;

export const Draft: StoryObj<typeof InstanceSearchPost> = { args: { post: draft } };
