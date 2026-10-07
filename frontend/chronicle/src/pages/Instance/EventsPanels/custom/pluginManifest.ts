import type { ChroniclePanelManifestV1 } from "./pluginTypes";

/** RFC 8785/JCS serialization for the JSON value types used by panel manifests. */
export function canonicalizeJSON(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJSON).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => {
      const item = object[key];
      if (item === undefined) throw new Error("Canonical JSON cannot contain undefined values.");
      return `${JSON.stringify(key)}:${canonicalizeJSON(item)}`;
    }).join(",")}}`;
  }
  throw new Error(`Canonical JSON cannot contain ${typeof value} values.`);
}

export async function customPanelManifestSHA256(manifest: ChroniclePanelManifestV1): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeJSON(manifest));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyCustomPanelManifestSHA256(
  manifest: ChroniclePanelManifestV1,
  expected: string,
): Promise<boolean> {
  return await customPanelManifestSHA256(manifest) === expected;
}
