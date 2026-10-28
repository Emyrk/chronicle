import { describe, expect, it } from "vitest";
import { chooserURL, parseArrival } from "./chooseArrival";

describe("parseArrival", () => {
  it("accepts known values only", () => {
    expect(parseArrival("saved")).toBe("saved");
    expect(parseArrival("remembered")).toBe("remembered");
    expect(parseArrival("picked")).toBe("picked");
    expect(parseArrival("evil")).toBeNull();
    expect(parseArrival(null)).toBeNull();
  });
});

describe("chooserURL", () => {
  const location = { pathname: "/instances/42", search: "?tab=dps&from_choose=saved", hash: "#top" };

  it("links back to the same page on the chooser", () => {
    expect(chooserURL("https://choose.example.com", location, "manage")).toBe(
      "https://choose.example.com/instances/42?tab=dps&choose_manage=1#top",
    );
  });

  it("can ask the chooser to forget the saved choice", () => {
    expect(chooserURL("http://choose.localhost:4000", location, "forget")).toBe(
      "http://choose.localhost:4000/instances/42?tab=dps&choose_forget=1#top",
    );
  });
});
