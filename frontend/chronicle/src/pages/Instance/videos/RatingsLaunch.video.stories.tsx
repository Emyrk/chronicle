import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import RatingsLaunchVideo from "./RatingsLaunch.video";

/** Preview for the ratings launch video; `frame` scrubs to a still. */
function RatingsLaunchPreview({ frame }: { frame: number }) {
  return (
    <div style={{ width: 1280, height: 720 }}>
      <Player
        component={RatingsLaunchVideo}
        durationInFrames={1110}
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

const meta: Meta<typeof RatingsLaunchPreview> = {
  title: "Videos/RatingsLaunch",
  component: RatingsLaunchPreview,
  args: { frame: 0 },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof RatingsLaunchPreview>;

export const Intro: Story = {};
export const Peak: Story = { args: { frame: 140 } };
export const NewRecord: Story = { args: { frame: 240 } };
export const Mastery: Story = { args: { frame: 400 } };
export const EvidenceComplete: Story = { args: { frame: 600 } };
export const Renown: Story = { args: { frame: 780 } };
export const Leaderboards: Story = { args: { frame: 900 } };
export const Guilds: Story = { args: { frame: 1000 } };
export const Finale: Story = { args: { frame: 1090 } };
