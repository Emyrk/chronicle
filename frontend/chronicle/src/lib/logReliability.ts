interface LogReliabilityMetadata {
  format?: string;
  versions?: Record<string, string>;
  capabilities?: readonly string[];
}

export function shouldShowChronicleCompanionWarning(log: LogReliabilityMetadata): boolean {
  const hasAddon = !!log.versions?.["addon"] || !!log.versions?.["chronicle_companion"];
  const isReliableWithoutAddon =
    log.format === "v9-cleu" || log.capabilities?.includes("server-side");

  return !hasAddon && !isReliableWithoutAddon;
}
