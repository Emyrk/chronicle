import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerMetricRow } from "./PlayerMetricChart";
import type { PlayerMetricChartRow } from "./PlayerMetricChartModel";

const player: PlayerMetricChartRow = {
  playerID: "player-1",
  playerName: "Replay Tester",
  className: "Mage",
  specialization: "Fire",
  value: 1_000,
  stackedValue: 100,
  displayValue: 100,
  displayStackedValue: 10,
  rank: 1,
  color: "red",
};

function renderRow(
  animateValues: boolean,
  rowPlayer: PlayerMetricChartRow = player,
): string {
  return renderToStaticMarkup(
    <PlayerMetricRow
      player={rowPlayer}
      rowHeight={30}
      maximumValue={2_000}
      summedValue={1_000}
      showRank
      type="damage"
      animateValues={animateValues}
    />,
  );
}

describe("PlayerMetricRow", () => {
  it("disables primary and stacked bar transitions for replay updates", () => {
    const markup = renderRow(false);

    expect(markup.match(/transition:none/g)).toHaveLength(2);
  });

  it("keeps bar transitions enabled by default outside replay", () => {
    const markup = renderRow(true);

    expect(markup).toContain("transition:width 0.3s ease");
    expect(markup).toContain("transition:left 0.3s ease, width 0.3s ease");
  });

  it("renders the class icon with a smaller specialization badge", () => {
    const markup = renderRow(false, {
      ...player,
      specializationIconUrl: "https://icons.example/fire.webp",
    });

    expect(markup).toContain('src="/c/icons/class_mage.png"');
    expect(markup).toContain('data-player-class-icon="true"');
    expect(markup).toContain('src="https://icons.example/fire.webp"');
    expect(markup).toContain('data-player-specialization-icon="true"');
    expect(markup).toContain('width:24px');
    expect(markup).toContain('width:14px');
    expect(markup).toContain('border:2px solid var(--color-background)');
    expect(markup).toContain('filter:saturate(1.2) contrast(1.1)');
    expect(markup).toContain('left:40px');
    expect(markup).toContain('padding:0 12px 0 52px');
    expect(markup).toContain('left:4px');
  });

  it("renders only the class icon when no specialization icon exists", () => {
    const markup = renderRow(false, {
      ...player,
      specialization: "",
    });

    expect(markup).toContain('src="/c/icons/class_mage.png"');
    expect(markup).toContain('data-player-class-icon="true"');
    expect(markup).not.toContain('data-player-specialization-icon');
  });

  it("sizes the metric badge to its value without a fixed minimum width", () => {
    const markup = renderRow(false);

    expect(markup).not.toContain("min-width:88px");
  });

  it("renders the display value instead of the raw geometry value", () => {
    const markup = renderRow(false);

    expect(markup).toContain(">100.0</span>");
    expect(markup).not.toContain(">1,000.0</span>");
  });
});
