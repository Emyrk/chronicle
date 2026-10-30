import { describe, expect, it } from "vitest";
import { localProxyHeaders } from "./viteProxy";

describe("localProxyHeaders", () => {
  it("rewrites a same-origin Vite request to the backend origin", () => {
    expect(localProxyHeaders("localhost:5173", "http://localhost:5173", "http:"))
      .toEqual({
        host: "localhost:4000",
        origin: "http://localhost:4000",
      });
  });

  it("preserves tenant subdomains", () => {
    expect(localProxyHeaders("epoch.localhost:5173", "http://epoch.localhost:5173", "http:"))
      .toEqual({
        host: "epoch.localhost:4000",
        origin: "http://epoch.localhost:4000",
      });
  });

  it("does not make a cross-origin request appear same-origin", () => {
    expect(localProxyHeaders("localhost:5173", "https://evil.example", "http:"))
      .toEqual({ host: "localhost:4000" });
  });
});
