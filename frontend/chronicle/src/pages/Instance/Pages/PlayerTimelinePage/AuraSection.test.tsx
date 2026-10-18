import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RotationTimelinePlayer } from "../../EventsPanels/RotationTimeline/RotationTimeline";
import type { RotationView } from "../../EventsPanels/RotationTimeline/useRotationView";
import { AuraSection } from "./AuraSection";

vi.mock("@/api/classBuffs", () => ({
  useFriendlyClassBuffs: () => ({ data: {} }),
}));

const player: RotationTimelinePlayer = {
  guid: "player-1",
  name: "Valsha",
  className: "Mage",
  data: {
    guid: "player-1",
    goCasts: [],
    textCasts: [],
    swings: [],
    damageBins: [],
    totalDamage: 0,
    healBins: [],
    totalHealing: 0,
    totalOverheal: 0,
    aurasOn: [
      {
        spellId: 51954,
        spellName: "Arcane Rupture",
        isBuff: false,
        caster: null,
        target: "player-1",
        startMs: 1_000,
        endMs: 9_000,
        maxStacks: 1,
      },
    ],
    debuffsCast: [],
    damageByTarget: {},
    consumes: [],
    auraProcs: [],
    consumeSpells: [],
  },
};

const noop = () => {};
const view = {
  startMs: 0,
  endMs: 10_000,
  durationMs: 10_000,
  align: "pull",
  metric: "damage",
  iconSize: "auto",
  ignoredNames: [],
  cursorMs: null,
  nowMs: null,
  pinnedMs: null,
  indicatorMs: null,
  follow: false,
  windowLocked: false,
  setWindow: noop,
  zoom: noop,
  fit: noop,
  panBy: noop,
  setAlign: noop,
  setMetric: noop,
  setIconSize: noop,
  toggleIgnored: noop,
  isIgnored: () => false,
  setCursorMs: noop,
  toggleFollow: noop,
  pinAt: noop,
  unpin: noop,
} as unknown as RotationView;

describe("AuraSection", () => {
  it("shows debuffs active on the compared players", () => {
    const markup = renderToStaticMarkup(
      <AuraSection
        players={[player]}
        view={view}
        spellMeta={() => ({ spell: null, icon: "/question-mark.png", school: "arcane" })}
        unitName={(guid) => guid}
        pickedTarget={null}
        onPickTarget={noop}
        otherOpenByDefault
      />,
    );

    expect(markup).toContain("Arcane Rupture");
    expect(markup).toContain('data-aura-type="debuff"');
    expect(markup).not.toContain("Debuffs on players");
  });
});
