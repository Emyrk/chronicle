export type GuideHostStatus = "loading" | "running" | "stopped" | "error";

export interface GuideHostState {
  status: GuideHostStatus;
  error: string | null;
  run: number;
}

export type GuideHostAction =
  | { type: "start" }
  | { type: "ready" }
  | { type: "stop" }
  | { type: "error"; error: Error };

export const INITIAL_GUIDE_HOST_STATE: GuideHostState = { status: "loading", error: null, run: 0 };

export function guideHostReducer(state: GuideHostState, action: GuideHostAction): GuideHostState {
  switch (action.type) {
    case "start":
      return { status: "loading", error: null, run: state.run + 1 };
    case "ready":
      return { ...state, status: "running", error: null };
    case "stop":
      return { ...state, status: "stopped", error: null };
    case "error":
      return { ...state, status: "error", error: action.error.message || "Guide runtime failed." };
  }
}

export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface AssetUrlRegistry {
  readonly urls: ReadonlyMap<string, string>;
  revoke(): void;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export function assetMimeType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function createAssetUrlRegistry(
  assets: readonly string[],
  read: (path: string) => Uint8Array,
  urlApi: ObjectUrlApi = URL,
): AssetUrlRegistry {
  const urls = new Map<string, string>();
  const owned: string[] = [];
  let revoked = false;
  try {
    for (const path of assets) {
      const bytes = read(path);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = urlApi.createObjectURL(new Blob([data], { type: assetMimeType(path) }));
      urls.set(path, url);
      owned.push(url);
    }
  } catch (error) {
    for (const url of owned) urlApi.revokeObjectURL(url);
    throw error;
  }
  return {
    urls,
    revoke() {
      if (revoked) return;
      revoked = true;
      for (const url of owned) urlApi.revokeObjectURL(url);
    },
  };
}
