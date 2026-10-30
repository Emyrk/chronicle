import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapSettingsOverlay } from "./MapSettingsOverlay";
import { DEFAULT_AD_STRAFE } from "./mapControls";
import { DEFAULT_EFFECT_SETTINGS, type EffectSettings } from "./mapViewSettings";
import { DEFAULT_WALK_AVATAR } from "./walkAvatars";

/** The map's settings dialog over a map-sized box, every tab available. */
function SettingsPlayground({ initial = DEFAULT_EFFECT_SETTINGS }: { initial?: EffectSettings }) {
  const [effectSettings, setEffectSettings] = useState<EffectSettings>(initial);
  const [meshOn, setMeshOn] = useState(true);
  const [map2D, setMap2D] = useState<"renders" | "art">("renders");
  const [floor, setFloor] = useState(1);
  const [adStrafe, setAdStrafe] = useState(DEFAULT_AD_STRAFE);
  const [walkAvatar, setWalkAvatar] = useState(DEFAULT_WALK_AVATAR);
  return (
    <div style={{ width: 900, height: 620 }} className="relative overflow-hidden rounded-md border border-white/10 bg-zinc-800">
      <MapSettingsOverlay
        onClose={() => {}}
        effectSettings={effectSettings}
        onEffectSettings={(patch) => setEffectSettings((current) => ({ ...current, ...patch }))}
        show3D
        hasEffects
        mesh={{ on: meshOn, locked: false, loading: false, onToggle: () => setMeshOn(!meshOn) }}
        map2D={{ value: map2D, options: ["renders", "art"], changed: map2D !== "renders", onChange: setMap2D, onReset: () => setMap2D("renders") }}
        floors={{ list: [1, 2], value: floor, onChange: setFloor }}
        onTopDown={() => {}}
        adStrafe={adStrafe}
        onAdStrafe={setAdStrafe}
        walkAvatar={walkAvatar}
        onWalkAvatar={setWalkAvatar}
        onResetAll={() => {
          setEffectSettings(DEFAULT_EFFECT_SETTINGS);
          setMeshOn(true);
          setMap2D("renders");
          setAdStrafe(DEFAULT_AD_STRAFE);
          setWalkAvatar(DEFAULT_WALK_AVATAR);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Instance/Map/MapSettingsOverlay",
  component: SettingsPlayground,
  parameters: { layout: "centered" },
} satisfies Meta<typeof SettingsPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTabs: Story = {};

/** A few settings off their defaults: their dots, the tabs' dots and the reset buttons. */
export const Changed: Story = {
  args: { initial: { ...DEFAULT_EFFECT_SETTINGS, trailSeconds: 2, aboveDisc: "health", periodic: true } },
};
