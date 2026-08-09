export function validateSharedViewPayload(
  payload: unknown,
  sharedInstanceID: string,
  loadedInstanceID: string,
): Record<string, unknown> {
  if (sharedInstanceID !== loadedInstanceID) {
    throw new Error("Shared view belongs to a different instance");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Shared view payload is invalid");
  }

  // Legacy payloads may contain the UUID from before an instance was reparsed.
  // The share API's resolved instance ID is authoritative, so ignore embedded IDs.
  return payload as Record<string, unknown>;
}
