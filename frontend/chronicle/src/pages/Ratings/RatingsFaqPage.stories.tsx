import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, within } from "storybook/test"
import { RatingsFaqPage } from "./RatingsFaqPage"

const meta = {
  title: "Pages/Ratings/FAQ",
  component: RatingsFaqPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RatingsFaqPage>

export default meta
type Story = StoryObj<typeof meta>

/** /ratings/faq: the three ratings, questions by section, and calculators running the leaderboards' model. */
export const Page: Story = {}

/** The calculators recompute as the sliders move, with the same numbers the leaderboards would show. */
export const Calculators: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mastery = within(canvas.getByRole("region", { name: "Ranked Mastery calculator" }))
    // One perfect kill: the estimate is 100, but only half of it counts yet.
    for (const name of ["Peak", "Form", "Floor"]) fireEvent.change(mastery.getByRole("slider", { name }), { target: { value: "100" } })
    fireEvent.change(mastery.getByRole("slider", { name: "Kills" }), { target: { value: "1" } })
    await expect(mastery.getByText("50.0")).toBeInTheDocument()
    await expect(mastery.getByText("20%")).toBeInTheDocument()
    // Five kills complete the evidence.
    fireEvent.change(mastery.getByRole("slider", { name: "Kills" }), { target: { value: "5" } })
    await expect(mastery.getByLabelText("Evidence complete")).toBeInTheDocument()

    // Peak is measured against the current #1, so a new record lowers it.
    const peak = within(canvas.getByRole("region", { name: "Peak calculator" }))
    fireEvent.change(peak.getByRole("slider", { name: "Your best kill" }), { target: { value: "1200" } })
    fireEvent.change(peak.getByRole("slider", { name: "Current #1" }), { target: { value: "1300" } })
    fireEvent.change(peak.getByRole("slider", { name: "A new #1 record" }), { target: { value: "1400" } })
    await expect(peak.getByText("92.3")).toBeInTheDocument()
    await expect(peak.getByText("85.7")).toBeInTheDocument()

    const raid = within(canvas.getByRole("region", { name: "Raid Peak calculator" }))
    fireEvent.change(raid.getByRole("slider", { name: "Bosses killed" }), { target: { value: "11" } })
    fireEvent.change(raid.getByRole("slider", { name: "Average Peak" }), { target: { value: "95" } })
    await expect(raid.getByText("87.1")).toBeInTheDocument()

    const guild = within(canvas.getByRole("region", { name: "Guild Peak calculator" }))
    fireEvent.change(guild.getByRole("slider", { name: "Fastest kill" }), { target: { value: "120" } })
    fireEvent.change(guild.getByRole("slider", { name: "Your kill" }), { target: { value: "240" } })
    await expect(guild.getByText("50.0")).toBeInTheDocument()
  },
}
