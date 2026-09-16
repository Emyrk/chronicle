import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnitIcon } from "./UnitIcon";

const FRIENDLY = {
  guid: "player",
  name: "Brannor",
  relation: "friendly" as const,
  className: "PRIEST",
};

describe("UnitIcon", () => {
  it("uses the specialization icon for friendly units when available", () => {
    const markup = renderToStaticMarkup(
      <UnitIcon unit={{ ...FRIENDLY, specializationIconUrl: "https://icons.example/holy.webp" }} />,
    );

    expect(markup).toContain('src="https://icons.example/holy.webp"');
  });

  it("falls back to the class icon for friendly units", () => {
    const markup = renderToStaticMarkup(<UnitIcon unit={FRIENDLY} />);

    expect(markup).toContain('src="/c/icons/class_priest.png"');
  });

  it("uses the hostile marker for hostile units", () => {
    const markup = renderToStaticMarkup(
      <UnitIcon unit={{ guid: "enemy", name: "Solnius", relation: "hostile" }} />,
    );

    expect(markup).not.toContain("<img");
    expect(markup).toContain("bg-rose-500/12");
  });
});
