import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { BlogPostDefinition } from "../blogRegistry";
import { RatingsLaunchPost } from "./ratings";

/**
 * Launch-day metadata. The post is not registered yet; on launch, add this to blog-posts.json (with
 * the real date) and map "ratings" to RatingsLaunchPost in BLOG_COMPONENTS.
 */
const POST: BlogPostDefinition = {
  id: "ratings",
  title: "Ratings: Peak, Ranked Mastery, and Renown",
  description:
    "Three ratings built from all of your kills: your best (Peak), what you reliably deliver (Ranked Mastery), and your raiding career (Renown). Plus rebuilt leaderboards, guild ratings, and a realm picker.",
  publishedAt: "2026-11-15",
  rarity: "legendary",
  tag: "Feature",
  icon: "inv_misc_head_dragon_01",
  flavor: "Bragging rights, with receipts.",
  component: RatingsLaunchPost,
};

const meta = {
  title: "Blog/Ratings launch",
  component: RatingsLaunchPost,
  parameters: { layout: "fullscreen" },
  args: { post: POST },
} satisfies Meta<typeof RatingsLaunchPost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The launch post. It links to the ratings FAQ for the details and calculators. */
export const Post: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: POST.title })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "ratings FAQ" })).toHaveAttribute("href", "/ratings/faq");
  },
};
