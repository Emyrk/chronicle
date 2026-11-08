import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishedMasteryCells, PublishedMasteryHeaders } from "./RatingFullList";
import type { RatingEntry } from "./ratingBoards.fixtures";

describe("published mastery parts", () => {
 const entry: RatingEntry = { id: "a", name: "A", cls: "MAGE", spec: "Frost", subSpec: "", score: 80, detail: "", publishedMastery: { peak: 90, form: 80, floor: 60 } };
 it("shows normalized bands and capped per-boss progress, not eligible kills", () => {
  const html = renderToStaticMarkup(<table><thead><tr><PublishedMasteryHeaders /></tr></thead><tbody><tr><PublishedMasteryCells entry={{...entry,bossCounts:[{encounter_name:"A",count:5},{encounter_name:"B",count:2},{encounter_name:"C",count:0}]}} /></tr></tbody></table>);
  expect(html).toContain("90.0"); expect(html).toContain("80.0"); expect(html).toContain("60.0");
  expect(html).toContain("56%"); expect(html).not.toContain("A: 3/3"); expect(html).toContain("B: 1 more (2/3)"); expect(html).toContain("C: 3 more (0/3)"); expect(html).not.toContain("Eligible kills");
 });
 it("reports complete coverage without implying a perfect Mastery score", () => {
  const html = renderToStaticMarkup(<table><tbody><tr><PublishedMasteryCells entry={{...entry,bossCounts:[{encounter_name:"A",count:3},{encounter_name:"B",count:8}]}} /></tr></tbody></table>);
  expect(html).toContain("100%");
  expect(html).toContain("Complete: at least three eligible kills for every selected boss");
  expect(html).toContain("not your Mastery score");
  expect(html).not.toContain("Missing eligible kills");
 });
 it("keeps missing count data unavailable rather than complete", () => {
  const html = renderToStaticMarkup(<table><tbody><tr><PublishedMasteryCells entry={entry} /></tr></tbody></table>);
  expect(html).toContain("No boss counts available");
  expect(html).not.toContain("100%");
 });
 it("handles empty selection without NaN or division by zero", () => {
  const html = renderToStaticMarkup(<table><tbody><tr><PublishedMasteryCells entry={{...entry,bossCounts:[]}} /></tr></tbody></table>);
  expect(html).toContain("0%"); expect(html).not.toContain("NaN");
 });
});
