import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { formatLevelRange } from "./damageRuleRows"
import { SpeedrunRequirements } from "./SpeedrunRequirements"

describe("speedrun requirements", () => {
  it("renders boss and trash kills with counts and level range", () => {
    const html = renderToStaticMarkup(<SpeedrunRequirements
      rules={{
        requirements: [
          { name: "Ragnaros", entry_ids: [11502], count: 1, category: "Bosses" },
          { name: "Molten Giant", entry_ids: [11658], count: 4, category: "Trash" },
        ],
        level_range: { min_level: 60, max_level: 60 },
        ranked_start_after_requirement: "Lucifron",
      }}
    />)
    expect(html).toContain("Required bosses")
    expect(html).toContain("Ragnaros")
    expect(html).toContain("Required trash")
    expect(html).toContain("Molten Giant")
    expect(html).toContain("×4")
    expect(html).toContain("Player level")
    expect(html).toContain("After Lucifron")
  })

  it("formats level ranges", () => {
    expect(formatLevelRange(undefined)).toBe("No limit")
    expect(formatLevelRange({ min_level: 60, max_level: 60 })).toBe("60")
    expect(formatLevelRange({ min_level: 0, max_level: 26 })).toBe("≤ 26")
    expect(formatLevelRange({ min_level: 15, max_level: 26 })).toBe("15–26")
  })
})
