import { verifyCustomPanelManifestSHA256 } from "./pluginManifest";
import { isManifestV1, normalizeRepository, type ResolveCustomPanelResponse } from "./pluginTypes";

export async function resolveCustomPanelInstallation(repositoryInput: string, ref: string): Promise<ResolveCustomPanelResponse> {
  const repository = normalizeRepository(repositoryInput);
  if (!repository) throw new Error("Enter a public GitHub repository as owner/repo or a github.com URL.");
  const response = await fetch("/api/v1/custom-panels/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repository, ref: ref.trim() || undefined }),
  });
  if (!response.ok) throw new Error((await response.text()) || `Resolve failed (${response.status})`);
  const result = await response.json() as ResolveCustomPanelResponse;
  if (result.repository !== repository || !/^[0-9a-f]{40}$/.test(result.commit_sha) || !isManifestV1(result.manifest, repository) || !result.artifacts?.entry) {
    throw new Error("The server returned an invalid custom panel response.");
  }
  if (!await verifyCustomPanelManifestSHA256(result.manifest, result.manifest_sha256)) {
    throw new Error("The server returned a custom panel manifest with an invalid canonical SHA-256.");
  }
  return result;
}
