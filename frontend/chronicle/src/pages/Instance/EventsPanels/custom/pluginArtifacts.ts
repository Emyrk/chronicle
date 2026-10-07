import type { ResolvedArtifact } from "./pluginTypes";

export interface VerifiedCustomPanelArtifacts {
  entryUrl: string;
  workerUrl?: string;
  styles?: string;
  revoke(): void;
}

async function verifyArtifact(
  artifact: ResolvedArtifact,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(artifact.url, { signal });
  if (!response.ok)
    throw new Error(`Plugin artifact failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== artifact.size) {
    throw new Error(
      `Plugin artifact size mismatch: expected ${artifact.size} bytes, received ${bytes.byteLength}.`,
    );
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const actual = Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== artifact.sha256)
    throw new Error("Plugin artifact SHA-256 mismatch.");
  return bytes;
}

export async function loadVerifiedCustomPanelArtifacts(
  artifacts: {
    entry: ResolvedArtifact;
    worker?: ResolvedArtifact;
    styles?: ResolvedArtifact;
  },
  signal: AbortSignal,
): Promise<VerifiedCustomPanelArtifacts> {
  const [entry, worker, styles] = await Promise.all([
    verifyArtifact(artifacts.entry, signal),
    artifacts.worker ? verifyArtifact(artifacts.worker, signal) : undefined,
    artifacts.styles ? verifyArtifact(artifacts.styles, signal) : undefined,
  ]);
  const stylesText = styles
    ? new TextDecoder("utf-8", { fatal: true }).decode(styles)
    : undefined;
  const urls: string[] = [];
  const createURL = (bytes: Uint8Array<ArrayBuffer>) => {
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "text/javascript" }),
    );
    urls.push(url);
    return url;
  };
  const entryUrl = createURL(entry);
  const workerUrl = worker ? createURL(worker) : undefined;
  return {
    entryUrl,
    workerUrl,
    styles: stylesText,
    revoke: () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}
