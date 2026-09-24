import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscordChannelEligibilityNotice } from "./GuildSettings";

describe("DiscordChannelEligibilityNotice", () => {
  it("lists unavailable channels with each eligibility reason", () => {
    const markup = renderToStaticMarkup(
      <DiscordChannelEligibilityNotice
        channels={[
          {
            id: "channel-1",
            name: "raid-logs",
            eligible: false,
            ineligibility_reasons: [
              "Missing Create Public Threads permission",
              "Missing Send Messages in Threads permission",
            ],
          },
          {
            id: "channel-2",
            name: "announcements",
            eligible: false,
            ineligibility_reasons: ["Announcement channels are not supported"],
          },
        ]}
      />,
    );

    expect(markup).toContain("Why 2 Discord channels are unavailable");
    expect(markup).toContain("#raid-logs");
    expect(markup).toContain("Missing Create Public Threads permission");
    expect(markup).toContain("Missing Send Messages in Threads permission");
    expect(markup).toContain("#announcements");
    expect(markup).toContain("Announcement channels are not supported");
  });

  it("renders nothing when every channel is eligible", () => {
    expect(renderToStaticMarkup(<DiscordChannelEligibilityNotice channels={[]} />)).toBe("");
  });
});
