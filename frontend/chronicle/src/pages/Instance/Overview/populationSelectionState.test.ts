import { describe, expect, it } from "vitest";
import {
  formatPopulationSelection,
  parseInstanceURL,
  parsePopulationSelection,
  serializePopulationSelection,
} from "./populationSelectionState";

describe("parseInstanceURL", () => {
  it("extracts an instance identifier from absolute and relative Chronicle paths", () => {
    expect(parseInstanceURL("https://example.test/instances/raid-123?view=overview")).toBe("raid-123");
    expect(parseInstanceURL("/instances/slug-value")).toBe("slug-value");
  });

  it("rejects the population comparison route and unrelated URLs", () => {
    expect(parseInstanceURL("/instances/compare")).toBeNull();
    expect(parseInstanceURL("/rankings?instance=Molten+Core")).toBeNull();
  });
});

describe("population selection state", () => {
  it("round-trips instance, server, realm, and guild populations", () => {
    const instance = { kind: "instance", instanceId: "raid-123" } as const;
    const server = { kind: "cohort", scope: "server", anchorInstanceId: "raid-123", lookbackDays: 60 } as const;
    const realm = { kind: "cohort", scope: "realm", anchorInstanceId: "raid-123", lookbackDays: 60 } as const;
    const guild = { kind: "cohort", scope: "guild", anchorInstanceId: "raid-123", lookbackDays: 60 } as const;

    expect(parsePopulationSelection(serializePopulationSelection(instance)!)).toEqual(instance);
    expect(parsePopulationSelection(serializePopulationSelection(server)!)).toEqual(server);
    expect(parsePopulationSelection(serializePopulationSelection(realm)!)).toEqual(realm);
    expect(parsePopulationSelection(serializePopulationSelection(guild)!)).toEqual(guild);
  });

  it("uses compact cohort values when the primary instance is fixed", () => {
    expect(serializePopulationSelection(
      { kind: "cohort", scope: "server", anchorInstanceId: "raid-123", lookbackDays: 60 },
      "raid-123",
    )).toBe("server");
    expect(parsePopulationSelection("realm", "raid-123")).toEqual({
      kind: "cohort",
      scope: "realm",
      anchorInstanceId: "raid-123",
      lookbackDays: 60,
    });
    expect(parsePopulationSelection("guild", "raid-123")).toEqual({
      kind: "cohort",
      scope: "guild",
      anchorInstanceId: "raid-123",
      lookbackDays: 60,
    });
  });

  it("labels unresolved populations without fetching full instances", () => {
    expect(formatPopulationSelection({ kind: "instance", instanceId: "raid-123" })).toBe("Raid raid-123");
    expect(formatPopulationSelection({
      kind: "cohort",
      scope: "realm",
      anchorInstanceId: "raid-123",
      lookbackDays: 60,
    })).toBe("Realm cohort · 60 days");
    expect(formatPopulationSelection({
      kind: "cohort",
      scope: "server",
      anchorInstanceId: "raid-123",
      lookbackDays: 60,
    })).toBe("Server cohort · 60 days");
  });
});
