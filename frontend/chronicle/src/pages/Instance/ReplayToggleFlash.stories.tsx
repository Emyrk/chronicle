import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReplayToggleFlash } from "./ReplayToggleFlash";
import { REPLAY_TOGGLE_EVENT, type ReplayToggle } from "./replayToggleKey";

/** The X key's play/pause flash; the buttons fire it as an X press would. */
function FlashPlayground() {
  const fire = (action: ReplayToggle) => window.dispatchEvent(new CustomEvent<ReplayToggle>(REPLAY_TOGGLE_EVENT, { detail: action }));
  return (
    <div className="flex h-[400px] w-[600px] items-end justify-center gap-2 rounded-md border border-white/10 bg-zinc-800 p-4">
      <button type="button" className="rounded border border-white/20 px-3 py-1 text-sm" onClick={() => fire("play")}>Play</button>
      <button type="button" className="rounded border border-white/20 px-3 py-1 text-sm" onClick={() => fire("pause")}>Pause</button>
      <ReplayToggleFlash />
    </div>
  );
}

const meta = {
  title: "Instance/ReplayToggleFlash",
  component: FlashPlayground,
  parameters: { layout: "centered" },
} satisfies Meta<typeof FlashPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flash: Story = {};
