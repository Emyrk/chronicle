import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import FocusModeVideo from "./FocusMode.video";

/** Preview for the focus mode announcement video; `frame` scrubs to a still. */
function FocusModePreview({ frame }: { frame: number }) {
  return (
    <div style={{ width: 1280, height: 720 }}>
      <Player
        component={FocusModeVideo}
        durationInFrames={630}
        fps={30}
        compositionWidth={1280}
        compositionHeight={720}
        initialFrame={frame}
        controls
        style={{ width: 1280, height: 720 }}
      />
    </div>
  );
}

const meta: Meta<typeof FocusModePreview> = {
  title: "Videos/FocusMode",
  component: FocusModePreview,
  args: { frame: 0 },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof FocusModePreview>;

export const Intro: Story = {};
export const Before: Story = { args: { frame: 150 } };
export const Focused: Story = { args: { frame: 290 } };
export const Fullscreen: Story = { args: { frame: 420 } };
export const Exiting: Story = { args: { frame: 500 } };
