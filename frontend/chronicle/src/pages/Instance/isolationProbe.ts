export function isolationTestEnabled(search: string): boolean {
  const values = new URLSearchParams(search).getAll("isolationTest");
  return values.length === 1 && values[0] === "1";
}

export function isolationExitURL(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("isolationTest");
  return url.href;
}

export function verifyIsolationProbe(data: unknown, view: Int32Array): boolean {
  if (typeof data !== "object" || data === null || !("type" in data) || data.type !== "result" ||
      !("isolated" in data) || typeof data.isolated !== "boolean") {
    throw new Error("Worker returned an invalid response");
  }
  if (Atomics.load(view, 0) !== 42) throw new Error("Shared memory mutation was not observed");
  return data.isolated;
}
