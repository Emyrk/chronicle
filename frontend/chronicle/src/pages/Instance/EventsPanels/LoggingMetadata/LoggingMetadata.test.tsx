import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilitiesList } from "./LoggingMetadata";

describe("CapabilitiesList", () => {
  it("renders capabilities in a stable order", () => {
    const markup = renderToStaticMarkup(
      <CapabilitiesList capabilities={["unit-resources", "overheal", "server-side"]} />,
    );

    expect(markup).toContain("overheal");
    expect(markup).toContain("server-side");
    expect(markup).toContain("unit-resources");
    expect(markup.indexOf("overheal")).toBeLessThan(markup.indexOf("server-side"));
    expect(markup.indexOf("server-side")).toBeLessThan(markup.indexOf("unit-resources"));
  });

  it("shows when no capabilities were reported", () => {
    expect(renderToStaticMarkup(<CapabilitiesList capabilities={[]} />)).toContain("None reported");
  });
});
