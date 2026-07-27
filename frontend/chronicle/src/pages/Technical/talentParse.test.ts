import { describe, expect, it } from "vitest";
import { parseTalentString } from "./talentParse";

const COMBATANT_LINE =
  "1713312000000|COMBATANT_TALENTS|0x00000000001A2B3C|Priests|Discipline;14;00503001500001|Holy;21;05230010500501|Shadow;0;00000000000000000";

const WOTLK_GROUP1 =
  "50200000000000000000000000}005305101230213233115031051}5300202010000000000000000000";
const WOTLK_GROUP2 =
  "50100000000000000000000000}005305100000000000000000000}5000032500033330531115301301";

describe("parseTalentString", () => {
  it("parses COMBATANT_TALENTS log lines", () => {
    const parsed = parseTalentString(COMBATANT_LINE);
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe("combatant_talents");
    expect(parsed!.playerName).toBe("Priests");
    expect(parsed!.groups).toHaveLength(1);
    expect(parsed!.groups[0].map((a) => a.tabName)).toEqual([
      "Discipline",
      "Holy",
      "Shadow",
    ]);
    expect(parsed!.groups[0].map((a) => a.pointsSpent)).toEqual([14, 21, 0]);
  });

  it("parses bare tab fields without prefix", () => {
    const parsed = parseTalentString(
      "Discipline;14;00503001500001|Holy;21;05230010500501|Shadow;0;00000000000000000"
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe("bare_tabs");
    expect(parsed!.groups[0]).toHaveLength(3);
  });

  it("parses WotLK companion dual-spec messages", () => {
    const parsed = parseTalentString(
      `P0x0000000000000A3B;T2,2,${WOTLK_GROUP1},${WOTLK_GROUP2}`
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe("wotlk_companion");
    expect(parsed!.guid).toBe("0x0000000000000A3B");
    expect(parsed!.activeGroup).toBe(2);
    expect(parsed!.groups).toHaveLength(2);
    // Group 2, tab 2 sums to 14 (005305100000000000000000000)
    expect(parsed!.groups[1][1].pointsSpent).toBe(14);
  });

  it("parses WotLK companion single-spec messages", () => {
    const parsed = parseTalentString(`P0x0000000000000A3B;T1,1,${WOTLK_GROUP1}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.activeGroup).toBe(1);
    expect(parsed!.groups).toHaveLength(1);
  });

  it("parses more than two talent groups (private servers)", () => {
    const parsed = parseTalentString(
      `P0x0000000000000A3B;T3,3,${WOTLK_GROUP1},${WOTLK_GROUP2},${WOTLK_GROUP1}`
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.activeGroup).toBe(3);
    expect(parsed!.groups).toHaveLength(3);
  });

  it("unwraps [N...] transport framing", () => {
    const parsed = parseTalentString(
      `[6P0x0000000000000A3B;T2,2,${WOTLK_GROUP1},${WOTLK_GROUP2}]`
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe("wotlk_companion");
    expect(parsed!.groups).toHaveLength(2);
  });

  it("parses bare T-segment without GUID prefix", () => {
    const parsed = parseTalentString(`T1,2,${WOTLK_GROUP1},${WOTLK_GROUP2}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.guid).toBeUndefined();
    expect(parsed!.groups).toHaveLength(2);
  });

  it("parses a bare rank string", () => {
    const parsed = parseTalentString(WOTLK_GROUP1);
    expect(parsed).not.toBeNull();
    expect(parsed!.groups).toHaveLength(1);
    expect(parsed!.groups[0]).toHaveLength(3);
  });

  it("rejects activeGroup out of range", () => {
    expect(parseTalentString(`P0x0A3B;T2,1,${WOTLK_GROUP1}`)).toBeNull();
  });

  it("rejects mismatched group count", () => {
    expect(
      parseTalentString(`P0x0A3B;T1,2,${WOTLK_GROUP1}`)
    ).toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseTalentString("hello world")).toBeNull();
    expect(parseTalentString("")).toBeNull();
  });
});
