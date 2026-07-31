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

export function formatInstancePopulation(instanceID: string): string {
  return `Raid ${instanceID}`;
}
