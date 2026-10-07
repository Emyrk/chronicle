import type { ResolvedArtifact } from "./pluginTypes";

export interface VerifiedCustomPanelArtifacts {
  entryUrl: string;
  workerUrl?: string;
  styles?: string;
  /** Release this panel's references and return any Blob URLs revoked at refcount zero. */
  revoke(): string[];
}

type ArtifactKind = "script" | "style";

interface VerifiedArtifactValue {
  url?: string;
  text?: string;
}

interface CachedArtifact {
  refs: number;
  controller: AbortController;
  promise: Promise<VerifiedArtifactValue>;
  value?: VerifiedArtifactValue;
}

interface ArtifactLease {
  promise: Promise<VerifiedArtifactValue>;
  release(): string | null;
}

const artifactCache = new Map<string, CachedArtifact>();

function artifactCacheKey(artifact: ResolvedArtifact, kind: ArtifactKind): string {
  return `${kind}:${artifact.sha256}:${artifact.size}:${artifact.url}`;
}

async function verifyArtifact(
  artifact: ResolvedArtifact,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(artifact.url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
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

function waitForArtifact(
  promise: Promise<VerifiedArtifactValue>,
  signal: AbortSignal,
): Promise<VerifiedArtifactValue> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Panel was unmounted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Panel was unmounted", "AbortError"));
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

function acquireArtifact(
  artifact: ResolvedArtifact,
  kind: ArtifactKind,
  signal: AbortSignal,
): ArtifactLease {
  const key = artifactCacheKey(artifact, kind);
  let cached = artifactCache.get(key);
  if (!cached) {
    const controller = new AbortController();
    cached = {
      refs: 0,
      controller,
      promise: Promise.resolve({}),
    };
    const entry = cached;
    entry.promise = verifyArtifact(artifact, controller.signal)
      .then((bytes): VerifiedArtifactValue => kind === "style"
        ? { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
        : { url: URL.createObjectURL(new Blob([bytes], { type: "text/javascript" })) })
      .then((value) => {
        entry.value = value;
        if (entry.refs === 0 && value.url) URL.revokeObjectURL(value.url);
        return value;
      })
      .catch((error) => {
        if (artifactCache.get(key) === entry) artifactCache.delete(key);
        throw error;
      });
    artifactCache.set(key, entry);
  }
  cached.refs += 1;
  let released = false;
  return {
    promise: waitForArtifact(cached.promise, signal),
    release: () => {
      if (released) return null;
      released = true;
      cached!.refs -= 1;
      if (cached!.refs > 0) return null;
      if (artifactCache.get(key) === cached) artifactCache.delete(key);
      cached!.controller.abort();
      if (cached!.value?.url) {
        URL.revokeObjectURL(cached!.value.url);
        return cached!.value.url;
      }
      return null;
    },
  };
}

export async function loadVerifiedCustomPanelArtifacts(
  artifacts: {
    entry: ResolvedArtifact;
    worker?: ResolvedArtifact;
    styles?: ResolvedArtifact;
  },
  includeWorker: boolean,
  signal: AbortSignal,
): Promise<VerifiedCustomPanelArtifacts> {
  const leases = [
    acquireArtifact(artifacts.entry, "script", signal),
    ...(includeWorker && artifacts.worker ? [acquireArtifact(artifacts.worker, "script", signal)] : []),
    ...(artifacts.styles ? [acquireArtifact(artifacts.styles, "style", signal)] : []),
  ];
  try {
    const values = await Promise.all(leases.map((lease) => lease.promise));
    const entry = values[0];
    let index = 1;
    const worker = includeWorker && artifacts.worker ? values[index++] : undefined;
    const styles = artifacts.styles ? values[index] : undefined;
    if (!entry.url) throw new Error("Plugin entry artifact did not produce a module URL.");
    let revoked = false;
    return {
      entryUrl: entry.url,
      workerUrl: worker?.url,
      styles: styles?.text,
      revoke: () => {
        if (revoked) return [];
        revoked = true;
        return leases.map((lease) => lease.release()).filter((url): url is string => url !== null);
      },
    };
  } catch (error) {
    for (const lease of leases) lease.release();
    throw error;
  }
}

export function clearVerifiedCustomPanelArtifactCache(): void {
  for (const cached of artifactCache.values()) {
    cached.controller.abort();
    if (cached.value?.url) URL.revokeObjectURL(cached.value.url);
  }
  artifactCache.clear();
}
