/**
 * Tests for glossary term rendering and accessibility.
 *
 * These tests verify the data layer and term registry.
 * DOM interaction tests would require a browser environment (Storybook/Playwright).
 */

import { describe, it, expect } from "vitest";
import { GLOSSARY_TERMS } from "./glossaryTerms";

describe("GLOSSARY_TERMS", () => {
  it("has required terms: panel, breakoutBox, filters, focus", () => {
    expect(GLOSSARY_TERMS.panel).toBeDefined();
    expect(GLOSSARY_TERMS.breakoutBox).toBeDefined();
    expect(GLOSSARY_TERMS.filters).toBeDefined();
    expect(GLOSSARY_TERMS.focus).toBeDefined();
  });

  it("each term has a non-empty term and definition", () => {
    for (const [key, entry] of Object.entries(GLOSSARY_TERMS)) {
      expect(entry.term.length, `${key}.term should be non-empty`).toBeGreaterThan(0);
      expect(entry.definition.length, `${key}.definition should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("term display names are title-cased", () => {
    for (const entry of Object.values(GLOSSARY_TERMS)) {
      expect(entry.term[0]).toBe(entry.term[0].toUpperCase());
    }
  });
});
