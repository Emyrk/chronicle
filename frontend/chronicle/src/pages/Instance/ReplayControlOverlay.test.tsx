import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplayTransportBar } from "./ReplayControlOverlay";

describe("ReplayTransportBar", () => {
  it("renders a disabled preview without a SyncModeProvider", () => {
    const markup = renderToStaticMarkup(<ReplayTransportBar deaths={[]} />);

    expect(markup).toContain("Enable Replay");
    expect(markup).toContain("Replay is available on instance pages");
  });
});
