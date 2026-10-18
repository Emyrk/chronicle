import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapSettingsOverlay } from "./MapSettingsOverlay";
import { DEFAULT_EFFECT_SETTINGS, type EffectSettings } from "./mapViewSettings";
import { DEFAULT_WALK_AVATAR } from "./walkAvatars";

/** The map's settings dialog over a map-sized box, every tab available. */
function SettingsPlayground() {
  const [effectSettings, setEffectSettings] = useState<EffectSettings>(DEFAULT_EFFECT_SETTINGS);
  const [raidFrames, setRaidFrames] = useState(true);
  const [enemyFrames, setEnemyFrames] = useState(false);
  const [meshOn, setMeshOn] = useState(true);
  const [floor, setFloor] = useState(1);
  const [adStrafe, setAdStrafe] = useState(true);
  const [walkAvatar, setWalkAvatar] = useState(DEFAULT_WALK_AVATAR);
  return (
    <div style={{ width: 900, height: 620 }} className="relative overflow-hidden rounded-md border border-white/10 bg-zinc-800">
      <MapSettingsOverlay
        onClose={() => {}}
        effectSettings={effectSettings}
        onEffectSettings={(patch) => setEffectSettings((current) => ({ ...current, ...patch }))}
        show3D
        hasEffects
        raidFrames={raidFrames}
        onRaidFrames={setRaidFrames}
        enemyFrames={enemyFrames}
        onEnemyFrames={setEnemyFrames}
        mesh={{ on: meshOn, locked: false, loading: false, onToggle: () => setMeshOn(!meshOn) }}
        floors={{ list: [1, 2], value: floor, onChange: setFloor }}
        onTopDown={() => {}}
        walk={{ on: false, onToggle: () => {} }}
        adStrafe={adStrafe}
        onAdStrafe={setAdStrafe}
        walkAvatar={walkAvatar}
        onWalkAvatar={setWalkAvatar}
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
