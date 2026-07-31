export type PopulationSelection =
  | { kind: "instance"; instanceId: string }
  | { kind: "cohort"; scope: "server" | "guild"; anchorInstanceId: string; lookbackDays: number };

export function parseInstanceURL(value: string): string | null {
  try {
    const url = new URL(value, "https://chronicle.invalid");
    const match = url.pathname.match(/^\/instances\/([^/]+)\/?$/);
    const instanceID = match?.[1];
    if (!instanceID || instanceID === "compare") return null;
    return decodeURIComponent(instanceID);
  } catch {
    return null;
  }
}

export function parsePopulationSelection(
  value: string | null,
  fixedAnchorInstanceId?: string,
): PopulationSelection | undefined {
  if (!value) return undefined;
  if (value === "server" || value === "guild") {
    return fixedAnchorInstanceId
      ? { kind: "cohort", scope: value, anchorInstanceId: fixedAnchorInstanceId, lookbackDays: 60 }
      : undefined;
  }

  const separator = value.indexOf(":");
  if (separator === -1) return { kind: "instance", instanceId: value };

  const kind = value.slice(0, separator);
  const id = decodeURIComponent(value.slice(separator + 1));
  if (!id) return undefined;
  if (kind === "instance") return { kind: "instance", instanceId: id };
  if (kind === "server" || kind === "guild") {
    return { kind: "cohort", scope: kind, anchorInstanceId: id, lookbackDays: 60 };
  }
  return undefined;
}

export function serializePopulationSelection(
  selection: PopulationSelection | undefined,
  fixedAnchorInstanceId?: string,
): string | undefined {
  if (!selection) return undefined;
  if (selection.kind === "instance") return `instance:${encodeURIComponent(selection.instanceId)}`;
  if (fixedAnchorInstanceId === selection.anchorInstanceId) return selection.scope;
  return `${selection.scope}:${encodeURIComponent(selection.anchorInstanceId)}`;
}

export function formatPopulationSelection(selection: PopulationSelection): string {
  if (selection.kind === "instance") return `Raid ${selection.instanceId}`;
  return `${selection.scope === "server" ? "Server" : "Guild"} cohort · ${selection.lookbackDays} days`;
}
