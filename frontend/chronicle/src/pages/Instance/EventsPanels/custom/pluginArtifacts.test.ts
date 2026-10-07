import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVerifiedCustomPanelArtifacts } from "./pluginArtifacts";
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

afterEach(() => vi.unstubAllGlobals());

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
      new AbortController().signal,
    );
    expect(loaded).toMatchObject({
      entryUrl: "blob:entry",
      workerUrl: "blob:worker",
      styles: responses[Object.keys(responses)[2]],
    });
    loaded.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:entry");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:worker");
  });

  it("rejects size mismatches before Blob execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("content", { status: 200 })),
    );
    const value = await artifact(Object.keys(responses)[0], "content");
    value.size++;
    await expect(
      loadVerifiedCustomPanelArtifacts(
        { entry: value },
        new AbortController().signal,
      ),
    ).rejects.toThrow("size mismatch");
  });

  it("rejects SHA-256 mismatches before Blob execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("content", { status: 200 })),
    );
    const value = await artifact(Object.keys(responses)[0], "content");
    value.sha256 = "0".repeat(64);
    await expect(
      loadVerifiedCustomPanelArtifacts(
        { entry: value },
        new AbortController().signal,
      ),
    ).rejects.toThrow("SHA-256 mismatch");
  });
});
