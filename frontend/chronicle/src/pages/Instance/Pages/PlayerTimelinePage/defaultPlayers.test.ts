import { describe, expect, it } from "vitest";
import { defaultPlayers } from "./defaultPlayers";

const ranked: [string, number][] = [
  ["rogueTop", 900],
  ["warrior1", 800],
  ["rogue2", 700],
  ["warrior2", 600],
  ["mage1", 500],
];
const classes: Record<string, string> = {
  rogueTop: "Rogue",
  rogue2: "Rogue",
  warrior1: "Warrior",
  warrior2: "Warrior",
  mage1: "Mage",
};
const classOf = (g: string) => classes[g];
const favs = (...ids: string[]) => (g: string) => ids.includes(g);

describe("defaultPlayers", () => {
  it("uses the top damage dealer and the next of their class without favorites", () => {
    expect(defaultPlayers(ranked, classOf, favs())).toEqual(["rogueTop", "rogue2"]);
  });

  it("puts a favorite in A, with the next player of their class in B", () => {
    expect(defaultPlayers(ranked, classOf, favs("warrior2"))).toEqual(["warrior2", "warrior1"]);
  });

  it("prefers a second favorite of the same class for B", () => {
    expect(defaultPlayers(ranked, classOf, favs("mage1", "warrior1", "warrior2"))).toEqual(["warrior1", "warrior2"]);
  });

  it("takes any second favorite before a non-favorite", () => {
    expect(defaultPlayers(ranked, classOf, favs("mage1", "rogue2"))).toEqual(["rogue2", "mage1"]);
  });

  it("returns nothing for an empty encounter", () => {
    expect(defaultPlayers([], classOf, favs("x"))).toEqual([null, null]);
  });
});
