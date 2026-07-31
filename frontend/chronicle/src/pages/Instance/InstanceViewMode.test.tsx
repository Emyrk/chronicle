import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstanceViewModeSwitch } from "./InstanceViewMode";
import { parseInstanceViewMode, withInstanceViewMode } from "./instanceViewModeState";

describe("parseInstanceViewMode", () => {
  it("keeps encounters as the absent and invalid default", () => {
    expect(parseInstanceViewMode(null)).toBe("encounters");
    expect(parseInstanceViewMode("invalid")).toBe("encounters");
  });

  it("accepts the overview URL mode", () => {
    expect(parseInstanceViewMode("overview")).toBe("overview");
  });
});

describe("withInstanceViewMode", () => {
  it("leaves encounter links unchanged", () => {
    expect(withInstanceViewMode("https://example.test/instances/run?share=abc", "encounters"))
      .toBe("https://example.test/instances/run?share=abc");
  });

  it("adds overview while preserving existing URL state", () => {
    expect(withInstanceViewMode("https://example.test/instances/run?share=abc#panels", "overview"))
      .toBe("https://example.test/instances/run?share=abc&view=overview#panels");
  });
});

describe("InstanceViewModeSwitch", () => {
  it("renders Encounters first and marks Overview as selected", () => {
    const markup = renderToStaticMarkup(
      <InstanceViewModeSwitch value="overview" onChange={() => undefined} />,
    );

    expect(markup.indexOf("Encounters")).toBeLessThan(markup.indexOf("Overview"));
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
