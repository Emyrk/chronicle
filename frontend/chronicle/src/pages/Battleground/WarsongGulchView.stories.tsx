import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { WarsongGulchView } from "./WarsongGulchView";
import { createWsgMatch } from "./wsgMatch";

/**
 * An imagined Warsong Gulch instance view: a synthetic 10 v 10 match
 * (Alliance wins 3–2 in 17:05) simulated second by second, so every region
 * scrubs from one playhead. The battlefield reuses the replay's MapView2D /
 * MapView3D with the same markers; turn on "Data sources" to see which
 * existing EventsPanel or processor each region would come from.
 */
function Harness(props: Omit<Parameters<typeof WarsongGulchView>[0], "match">) {
  const [match] = useState(() => createWsgMatch());
  return <WarsongGulchView match={match} {...props} />;
}

const meta: Meta<typeof Harness> = {
  title: "Battlegrounds/Warsong Gulch",
  component: Harness,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="dark min-h-screen bg-background"><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof Harness>;

/** Mid-match, just after the midfield brawl: Lyrae carries the Horde flag while Zulrah holds the Alliance flag. */
export const MidMatch: Story = { args: { initialCursorMs: 6 * 60_000 + 40_000 } };

/** Final whistle: Sefi's capture wins it 3–2. */
export const FinalScore: Story = { args: { initialCursorMs: 17 * 60_000 + 5_000 } };

/** Gates open and playing at 8×. */
export const Playing: Story = { args: { initialCursorMs: 60_000, initialPlaying: true } };

/** Each region labelled with the existing panel / processor it would reuse. */
export const DataSources: Story = { args: { initialCursorMs: 13 * 60_000 + 25_000, initialSources: true } };

/** The same markers on the 3D replay scene (no WSG mesh yet, so a flat ground). */
export const Battlefield3D: Story = { args: { initialCursorMs: 6 * 60_000 + 40_000, initialMode: "3d" } };
