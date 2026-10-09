import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVerifiedCustomPanelArtifactCache, loadVerifiedCustomPanelArtifacts } from "./pluginArtifacts";
import type { ResolvedArtifact } from "./pluginTypes";

async function artifact(
  url: string,
  contents: string,
): Promise<ResolvedArtifact> {
  const bytes = new TextEncoder().encode(contents);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return {
    url,
    size: bytes.byteLength,
    sha256: Array.from(digest, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

const responses: Record<string, string> = {
  "https://raw.githubusercontent.com/owner/repo/commit/entry.js":
    "export default {};",
  "https://raw.githubusercontent.com/owner/repo/commit/worker.js":
    "self.onmessage = () => {};",
  "https://raw.githubusercontent.com/owner/repo/commit/styles.css":
    ":host { color: red; }",
};

afterEach(() => {
  clearVerifiedCustomPanelArtifactCache();
  vi.unstubAllGlobals();
});

describe("loadVerifiedCustomPanelArtifacts", () => {
  it("verifies bytes before creating Blob URLs and revokes them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) => new Response(responses[url], { status: 200 }),
      ),
    );
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:entry")
      .mockReturnValueOnce("blob:worker");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const loaded = await loadVerifiedCustomPanelArtifacts(
      {
        entry: await artifact(
          Object.keys(responses)[0],
          responses[Object.keys(responses)[0]],
        ),
        worker: await artifact(
          Object.keys(responses)[1],
          responses[Object.keys(responses)[1]],
        ),
        styles: await artifact(
          Object.keys(responses)[2],
          responses[Object.keys(responses)[2]],
        ),
      },
      true,
      new AbortController().signal,
    );
    expect(new Set([loaded.entryUrl, loaded.workerUrl])).toEqual(
      new Set(["blob:entry", "blob:worker"]),
    );
    expect(loaded.styles).toBe(responses[Object.keys(responses)[2]]);
    expect(new Set(loaded.revoke())).toEqual(
      new Set(["blob:entry", "blob:worker"]),
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:entry");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:worker");
  });

  it("shares verified active artifacts and skips unused workers", async () => {
    const fetchMock = vi.fn(
      async (url: string) => new Response(responses[url], { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:entry");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const artifacts = {
      entry: await artifact(Object.keys(responses)[0], responses[Object.keys(responses)[0]]),
      worker: await artifact(Object.keys(responses)[1], responses[Object.keys(responses)[1]]),
      styles: await artifact(Object.keys(responses)[2], responses[Object.keys(responses)[2]]),
    };

    const first = await loadVerifiedCustomPanelArtifacts(
      artifacts,
      false,
      new AbortController().signal,
    );
    const second = await loadVerifiedCustomPanelArtifacts(
      artifacts,
      false,
      new AbortController().signal,
    );

    expect(first.entryUrl).toBe(second.entryUrl);
    expect(first.workerUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      artifacts.worker.url,
      expect.anything(),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(first.revoke()).toEqual([]);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(second.revoke()).toEqual(["blob:entry"]);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("reports the expected and downloaded metadata for size mismatches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("content", { status: 200 })),
    );
    const value = await artifact(Object.keys(responses)[0], "content");
    const actualSha256 = value.sha256;
    value.size++;
    value.sha256 = "0".repeat(64);
    await expect(
      loadVerifiedCustomPanelArtifacts(
        { entry: value },
        false,
        new AbortController().signal,
      ),
    ).rejects.toThrow(
      `Plugin artifact size mismatch: chronicle-panel.json expects ${value.size} bytes with SHA-256 ${value.sha256}, but the downloaded artifact is ${value.size - 1} bytes with SHA-256 ${actualSha256}. Rebuild the artifact, then update its size and sha256 in chronicle-panel.json to match the built file.`,
    );
  });

  it("reports the expected and downloaded hashes for SHA-256 mismatches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("content", { status: 200 })),
    );
    const value = await artifact(Object.keys(responses)[0], "content");
    const actualSha256 = value.sha256;
    value.sha256 = "0".repeat(64);
    await expect(
      loadVerifiedCustomPanelArtifacts(
        { entry: value },
        false,
        new AbortController().signal,
      ),
    ).rejects.toThrow(
      `Plugin artifact SHA-256 mismatch: chronicle-panel.json expects ${value.sha256}, but the downloaded artifact has SHA-256 ${actualSha256}. Rebuild the artifact, then update its size and sha256 in chronicle-panel.json to match the built file.`,
    );
  });
});
