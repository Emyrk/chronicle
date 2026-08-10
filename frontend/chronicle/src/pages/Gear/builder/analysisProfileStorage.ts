import type { StatTarget } from "./gearScoring";

const STORAGE_KEY = "chronicle:gear-analysis-targets:v1";

type StoredTargets = Record<string, StatTarget[]>;

function readAll(): StoredTargets {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as StoredTargets)
      : {};
  } catch {
    return {};
  }
}

export function readProfileTargets(profileId: string): StatTarget[] {
  const targets = readAll()[profileId];
  if (!Array.isArray(targets)) return [];
  return targets.filter(
    (target) =>
      target &&
      typeof target.stat === "string" &&
      (target.type === "minimum" || target.type === "maximum") &&
      typeof target.value === "number" &&
      Number.isFinite(target.value),
  );
}

export function writeProfileTargets(
  profileId: string,
  targets: readonly StatTarget[],
): void {
  if (typeof window === "undefined") return;
  const stored = readAll();
  if (targets.length > 0) stored[profileId] = [...targets];
  else delete stored[profileId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}
