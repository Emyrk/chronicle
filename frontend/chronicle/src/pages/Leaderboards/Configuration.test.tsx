import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  ConfigurationPage,
  ConfigurationView,
  InstanceConfiguration,
} from "./Configuration";
import type {
  LeaderboardConfiguration,
  LeaderboardConfigurationRow,
} from "@/api/typesGenerated";

const row = (
  values: Partial<LeaderboardConfigurationRow>,
): LeaderboardConfigurationRow => ({
  kind: "boss",
  instance_name: "Test raid",
  encounter_name: "Boss",
  difficulty_name: "",
  max_players: 0,
  set_key: "",
  set_name: "",
  position: 0,
  points: 0,
  has_points: false,
  ...values,
});
const data: LeaderboardConfiguration = {
  tenant_id: null,
  tenant_name: "Root site (no tenant)",
  dataset_id: "dataset",
  dataset_name: "Vanilla",
  dataset_flavor: ["vanilla"],
  additional_flavor: ["turtle"],
  effective_flavor: ["vanilla", "turtle"],
  leaderboard_flavor: ["vanilla"],
  layers: [],
  rows: [],
  conflict: "",
  tenants: [],
};
function view(value: LeaderboardConfiguration) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ConfigurationView data={value} />
    </MemoryRouter>,
  );
}

describe("configuration inspector", () => {
  it("distinguishes missing awards, explicit zero, and absent variants from no bosses", () => {
    const html = renderToStaticMarkup(
      <InstanceConfiguration
        name="Test raid"
        rows={[
          row({ has_points: true }),
          row({ encounter_name: "Unconfigured" }),
        ]}
      />,
    );
    expect(html).toMatch(/text-muted-foreground">0<\/span>/);
    expect(html).toContain("No award configured (not zero)");
    expect(html).toContain("no variants");
    expect(html).toContain("1 unset");
    expect(html).not.toContain("No bosses configured.");
    expect(
      renderToStaticMarkup(<InstanceConfiguration name="Empty" rows={[]} />),
    ).toContain("No bosses configured.");
  });
  it("renders resolved variant awards and named sets in membership order", () => {
    const html = renderToStaticMarkup(
      <InstanceConfiguration
        name="Test raid"
        rows={[
          row({ has_points: true, points: 10 }),
          row({ kind: "variant", difficulty_name: "Heroic", max_players: 25 }),
          row({
            kind: "boss_variant",
            difficulty_name: "Heroic",
            max_players: 25,
            has_points: true,
            points: 0,
          }),
          row({ kind: "set", set_key: "clear", set_name: "Full clear" }),
          row({
            kind: "member",
            set_key: "clear",
            encounter_name: "Second boss",
            position: 2,
          }),
          row({
            kind: "member",
            set_key: "clear",
            encounter_name: "First boss",
            position: 1,
          }),
        ]}
      />,
    );
    expect(html).toContain("Heroic · 25p");
    expect(html).toContain("Default set Renown");
    expect(html).toContain("Full clear");
    expect(html).toContain("Not in an encounter set");
    expect(html.indexOf("First boss")).toBeLessThan(
      html.indexOf("Second boss"),
    );
  });
  it("shows tenant flavors and explicit empty state", () => {
    const html = view(data);
    expect(html).toContain("Root site (no tenant)");
    expect(html).toContain("Leaderboard projection");
    expect(html).toContain("turtle");
    expect(html).toContain("No configured instances");
    expect(html).toContain("No matching layers");
  });
  it("shows the tenant picker only when the root site offers tenants", () => {
    expect(view(data)).not.toContain('aria-label="Tenants"');
    const html = view({
      ...data,
      tenants: [
        {
          id: "a",
          slug: "capy",
          name: "Capy",
          square_logo: "/capy.png",
          discoverable: true,
        },
        {
          id: "b",
          slug: null,
          name: "Secret",
          square_logo: "",
          discoverable: false,
        },
      ],
    });
    expect(html).toContain('aria-label="Tenants"');
    expect(html).toContain("/capy.png");
    expect(html).toContain("Not discoverable");
  });
  it("totals Renown over the default set only", () => {
    const html = renderToStaticMarkup(
      <InstanceConfiguration
        name="Test raid"
        rows={[
          row({ encounter_name: "A", has_points: true, points: 10 }),
          row({ encounter_name: "B", has_points: true, points: 50 }),
          row({ encounter_name: "C", has_points: true, points: 5 }),
          row({ kind: "set", set_key: "default", set_name: "Normal" }),
          row({ kind: "member", set_key: "default", encounter_name: "A" }),
          row({ kind: "set", set_key: "hard", set_name: "Hard" }),
          row({ kind: "member", set_key: "hard", encounter_name: "B" }),
        ]}
      />,
    );
    expect(html).toMatch(/leading-none">10</);
  });
  it("lists instances by Renown total, highest first", () => {
    const html = view({
      ...data,
      rows: [
        row({ kind: "instance", instance_name: "Alpha" }),
        row({ instance_name: "Alpha", has_points: true, points: 2 }),
        row({ kind: "instance", instance_name: "Zeta" }),
        row({ instance_name: "Zeta", has_points: true, points: 9 }),
      ],
    });
    const nav = html.slice(html.indexOf('aria-label="Configured instances"'));
    expect(nav.indexOf("Zeta")).toBeLessThan(nav.indexOf("Alpha"));
  });
  it("never displays partial configuration on conflict", () => {
    const html = view({
      ...data,
      conflict: "conflicting points",
      rows: [row({ kind: "instance", instance_name: "Secret partial" })],
    });
    expect(html).toContain("Configuration conflict");
    expect(html).not.toContain("Secret partial");
  });
});

vi.mock("@/api/leaderboardConfiguration", () => ({
  useLeaderboardConfiguration: vi.fn(),
}));
import { useLeaderboardConfiguration } from "@/api/leaderboardConfiguration";

it("shows loading and request errors instead of an empty configuration", () => {
  vi.mocked(useLeaderboardConfiguration).mockReturnValue({
    isPending: true,
  } as ReturnType<typeof useLeaderboardConfiguration>);
  expect(
    renderToStaticMarkup(
      <MemoryRouter>
        <ConfigurationPage />
      </MemoryRouter>,
    ),
  ).toContain("Loading tenant configuration");
  vi.mocked(useLeaderboardConfiguration).mockReturnValue({
    isPending: false,
    isError: true,
    error: new Error("Dataset unavailable"),
  } as ReturnType<typeof useLeaderboardConfiguration>);
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ConfigurationPage />
    </MemoryRouter>,
  );
  expect(html).toContain("Configuration unavailable");
  expect(html).toContain("Dataset unavailable");
  expect(html).not.toContain("No configured instances");
});
