import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PreviewConfiguration, ScoreTable } from "./Preview";
import type {
  LeaderboardConfiguration,
  LeaderboardV2Response,
} from "@/api/typesGenerated";

vi.mock("@/api/leaderboardV2", () => ({
  useLeaderboardV2Cohorts: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
  useLeaderboardV2: () => ({ data: undefined, isPending: true }),
}));
const config: LeaderboardConfiguration = {
  tenant_id: "tenant",
  tenant_name: "Synthetic tenant",
  tenants: [],
  dataset_id: "dataset",
  dataset_name: "Vanilla",
  dataset_flavor: ["vanilla"],
  additional_flavor: [],
  effective_flavor: ["vanilla"],
  leaderboard_flavor: ["vanilla"],
  layers: [],
  conflict: "",
  rows: [
    {
      kind: "instance",
      instance_name: "Molten Core",
      encounter_name: "",
      difficulty_name: "",
      max_players: 0,
      set_key: "",
      set_name: "",
      position: 0,
      points: 0,
      has_points: false,
    },
  ],
};
const response: LeaderboardV2Response = {
  status: "ready",
  message: "",
  entries: [],
  included_bosses: ["Boss"],
};
function preview(data: LeaderboardConfiguration) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PreviewConfiguration data={data} />
    </MemoryRouter>,
  );
}

describe("leaderboard preview", () => {
  it("uses exact Vanilla identity without a heroic or variant selector", () => {
    const html = preview(config);
    expect(html).toContain("empty-difficulty / size-0");
    expect(html).not.toContain("Instance variant");
    expect(html).not.toContain("Heroic");
    expect(html).toContain("No performance cohorts");
  });
  it("fails closed on root or conflicting config", () => {
    expect(preview({ ...config, tenant_id: null })).toContain(
      "root site does not own",
    );
    const html = preview({ ...config, conflict: "Conflicting assignments" });
    expect(html).toContain("No scores are shown");
    expect(html).not.toContain("Choose a board");
  });
  it("represents empty sets without division or misleading zero-score rows", () => {
    const html = renderToStaticMarkup(
      <ScoreTable
        data={{ ...response, status: "empty_selection" }}
        score="peak"
      />,
    );
    expect(html).toContain("no score is calculated");
    expect(html).not.toContain("<table");
  });
  it("renders explicit zero scores and realm-qualified subjects without global ranks", () => {
    const entry = {
      realm_id: "realm-a",
      subject_id: "player",
      name: "Player",
      score: 0,
      peak: 0,
      mastery: 0,
      renown: 0,
      sample_count: 10,
      computed_at: "2026-01-01T00:00:00Z",
    };
    const html = renderToStaticMarkup(
      <ScoreTable
        data={{
          ...response,
          entries: [entry, { ...entry, realm_id: "realm-b" }],
        }}
        score="renown"
      />,
    );
    expect(html).toContain("realm-a");
    expect(html).toContain("realm-b");
    expect(html).toContain("Kills");
    expect(html).toContain(">0</td>");
    expect(html).not.toContain("Rank");
  });
});
