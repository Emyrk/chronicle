import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { RatingsLaunchPost } from "./ratings";
import { RATINGS_LAUNCH_POST as POST } from "./ratingsLaunchPost";

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
