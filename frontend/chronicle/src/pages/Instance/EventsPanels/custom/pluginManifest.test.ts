import { describe, expect, it } from "vitest";
import { canonicalizeJSON, customPanelManifestSHA256, verifyCustomPanelManifestSHA256 } from "./pluginManifest";
import type { ChroniclePanelManifestV1 } from "./pluginTypes";

const manifest: ChroniclePanelManifestV1 = {
  schema_version: 1,
  plugin: { id: "github:owner/repo", name: "Raid Tools", version: "1.0.0" },
  host: { api_version: 1 },
  artifacts: {
    entry: { path: "dist/panel.js", sha256: "a".repeat(64), size: 12 },
  },
  panels: [{ id: "raid-tools", name: "Raid Tools", streams: ["damage"] }],
};

describe("canonical custom panel manifests", () => {
  it("matches the shared RFC 8785 fixture", async () => {
    const value = { z: 1, list: [3, 2, 1], a: { d: 4, c: "text" } };
    expect(canonicalizeJSON(value)).toBe('{"a":{"c":"text","d":4},"list":[3,2,1],"z":1}');
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalizeJSON(value)));
    expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""))
      .toBe("75732109c1e99955de11fa9f16171719cd5d863fb6dcc7535263a9e91dfebf00");
  });

  it("is independent of object key insertion order", async () => {
    const reordered = JSON.parse('{"panels":[{"streams":["damage"],"name":"Raid Tools","id":"raid-tools"}],"artifacts":{"entry":{"size":12,"sha256":"' + "a".repeat(64) + '","path":"dist/panel.js"}},"host":{"api_version":1},"plugin":{"version":"1.0.0","name":"Raid Tools","id":"github:owner/repo"},"schema_version":1}') as ChroniclePanelManifestV1;
    expect(await customPanelManifestSHA256(reordered)).toBe(await customPanelManifestSHA256(manifest));
  });

  it("rejects a mismatched canonical digest", async () => {
    expect(await verifyCustomPanelManifestSHA256(manifest, "0".repeat(64))).toBe(false);
    expect(await verifyCustomPanelManifestSHA256(manifest, await customPanelManifestSHA256(manifest))).toBe(true);
  });
});
