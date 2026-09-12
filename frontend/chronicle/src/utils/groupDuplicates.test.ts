import { describe, expect, it } from "vitest";
import { groupDuplicateInstances } from "./groupDuplicates";

describe("groupDuplicateInstances", () => {
  it("preserves the API representative as the first instance in each group", () => {
    const instances = [
      { id: "canonical", duplicate_group_id: "run-1" },
      { id: "duplicate-1", duplicate_group_id: "run-1" },
      { id: "solo" },
      { id: "canonical-2", duplicate_group_id: "run-2" },
      { id: "duplicate-2", duplicate_group_id: "run-2" },
    ];

    const groups = groupDuplicateInstances(instances);

    expect(groups).toEqual([
      [instances[0], instances[1]],
      [instances[2]],
      [instances[3], instances[4]],
    ]);
    expect(groups.map(([representative]) => representative.id)).toEqual([
      "canonical",
      "solo",
      "canonical-2",
    ]);
  });

  it("counts duplicate groups as one logical run for pagination", () => {
    const instances = [
      { id: "canonical", duplicate_group_id: "run-1" },
      { id: "duplicate-1", duplicate_group_id: "run-1" },
      { id: "duplicate-2", duplicate_group_id: "run-1" },
      { id: "solo" },
    ];

    expect(groupDuplicateInstances(instances)).toHaveLength(2);
  });
});
