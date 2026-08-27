import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoinAmount } from "./CoinAmount";

describe("CoinAmount", () => {
  it("uses gold styling at one gold and above", () => {
    const markup = renderToStaticMarkup(<CoinAmount copper={10_000} />);

    expect(markup).toContain("text-amber-300/90");
    expect(markup).toContain(">1g<");
  });

  it("uses silver styling below one gold", () => {
    const markup = renderToStaticMarkup(<CoinAmount copper={200} />);

    expect(markup).toContain("text-[#c0c0c0]");
    expect(markup).toContain(">2s<");
  });

  it("uses bronze styling below one silver", () => {
    const markup = renderToStaticMarkup(<CoinAmount copper={98} />);

    expect(markup).toContain("text-[#cd7f32]");
    expect(markup).toContain(">98c<");
  });
});
