import { isAITargetId } from "./aiLinks";
import { DEFAULT_AI_TARGET, type AITargetId } from "./aiPrompts";

// The server stores only a hash of the AI key, so it can never show the
// secret again. This browser keeps the secret it was given, keyed by the key
// ID. localStorage is per origin and each community is its own subdomain, so
// each community keeps its own secret.
//
// The secret and the warning flag belong to a user, not the browser: both
// carry the user ID and are ignored for anyone else, and logout clears them
// (clearAIKeyStorage), so on a shared computer the next user never gets the
// previous user's key or skips the warning.

const SECRET_KEY = "chronicle.ai-key.secret";
const WARNING_KEY = "chronicle.ai-key.warning-acknowledged";
const TARGET_KEY = "chronicle.ai-key.target";
const LIFETIME_KEY = "chronicle.ai-key.lifetime-hours";

export interface StoredAIKey {
  userID: string;
  id: string;
  secret: string;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, value);
  } catch {
    // Private mode or full storage: the feature still works, it just asks again.
  }
}

/** loadStoredAIKey returns this browser's AI key secret if it belongs to userID. */
export function loadStoredAIKey(userID: string | null | undefined): StoredAIKey | null {
  if (!userID) return null;
  const raw = read(SECRET_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAIKey>;
    if (parsed.userID === userID && typeof parsed.id === "string" && typeof parsed.secret === "string") {
      return { userID, id: parsed.id, secret: parsed.secret };
    }
  } catch {
    // Fall through.
  }
  return null;
}

/** storedSecretFor returns this browser's secret for the user's key, if it has it. */
export function storedSecretFor(userID: string | null | undefined, keyID: string | undefined): string | null {
  if (!keyID) return null;
  const stored = loadStoredAIKey(userID);
  return stored?.id === keyID ? stored.secret : null;
}

export function saveStoredAIKey(key: StoredAIKey | null) {
  write(SECRET_KEY, key ? JSON.stringify(key) : null);
}

export function isWarningAcknowledged(userID: string | null | undefined): boolean {
  return !!userID && read(WARNING_KEY) === userID;
}

export function acknowledgeWarning(userID: string) {
  write(WARNING_KEY, userID);
}

/** clearAIKeyStorage forgets the secret and the warning flag (on logout). */
export function clearAIKeyStorage() {
  write(SECRET_KEY, null);
  write(WARNING_KEY, null);
}

export function loadAITarget(): AITargetId {
  const value = read(TARGET_KEY);
  return isAITargetId(value) ? value : DEFAULT_AI_TARGET;
}

export function saveAITarget(id: AITargetId) {
  write(TARGET_KEY, id);
}

export function loadLifetimeHours(): number | null {
  const n = Number(read(LIFETIME_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function saveLifetimeHours(hours: number) {
  write(LIFETIME_KEY, String(hours));
}

/**
 * secretFromResponse is the secret for a get-or-create response: the new
 * secret if the request made the key, else this browser's copy of the
 * existing key's secret. Null means this browser can't link with the key.
 */
export function secretFromResponse(userID: string | null | undefined, resp: { key: { id: string }; secret?: string }): string | null {
  return resp.secret ?? storedSecretFor(userID, resp.key.id);
}
