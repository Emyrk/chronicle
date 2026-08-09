import { describe, expect, it } from "vitest";
import { isSocketBonusFulfilled } from "./socketBonus";

const gem = (itemSubclass: number) => ({
  item_class: 3,
  item_subclass: itemSubclass,
});

describe("isSocketBonusFulfilled", () => {
  it("requires every socket to contain a matching gem", () => {
    expect(
      isSocketBonusFulfilled(
        [{ color: 2 }, { color: 4 }, { color: 8 }],
        [101, 102, 103],
        [gem(0), gem(2), gem(1)],
      ),
    ).toBe(true);
  });

  it("accepts hybrid gems for either of their colors", () => {
    expect(
      isSocketBonusFulfilled(
        [{ color: 2 }, { color: 4 }, { color: 8 }],
        [101, 102, 103],
        [gem(3), gem(5), gem(4)],
      ),
    ).toBe(true);
  });

  it("accepts prismatic gems in non-meta sockets", () => {
    expect(
      isSocketBonusFulfilled(
        [{ color: 2 }, { color: 4 }, { color: 8 }],
        [101, 102, 103],
        [gem(8), gem(8), gem(8)],
      ),
    ).toBe(true);
  });

  it("requires a meta gem in a meta socket", () => {
    expect(isSocketBonusFulfilled([{ color: 1 }], [101], [gem(6)])).toBe(true);
    expect(isSocketBonusFulfilled([{ color: 1 }], [101], [gem(8)])).toBe(false);
  });

  it("rejects empty, loading, or mismatched sockets", () => {
    expect(isSocketBonusFulfilled([{ color: 2 }], [0], [undefined])).toBe(false);
    expect(isSocketBonusFulfilled([{ color: 2 }], [101], [undefined])).toBe(false);
    expect(isSocketBonusFulfilled([{ color: 2 }], [101], [gem(1)])).toBe(false);
  });

  it("does not fulfill a bonus without sockets", () => {
    expect(isSocketBonusFulfilled([], [], [])).toBe(false);
  });
});
