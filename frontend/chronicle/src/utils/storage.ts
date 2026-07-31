const BYTES_PER_KILOBYTE = 1_000;
const BYTES_PER_MEGABYTE = 1_000_000;
const STORAGE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatStorageBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const unitIndex = Math.max(
    0,
    Math.min(
      Math.floor(Math.log(Math.abs(bytes)) / Math.log(BYTES_PER_KILOBYTE)),
      STORAGE_UNITS.length - 1,
    ),
  );
  const value = bytes / BYTES_PER_KILOBYTE ** unitIndex;

  return `${parseFloat(value.toFixed(2))} ${STORAGE_UNITS[unitIndex]}`;
}

export function bytesToMegabytes(bytes: number): number {
  return bytes / BYTES_PER_MEGABYTE;
}

export function megabytesToBytes(megabytes: number): number {
  return megabytes * BYTES_PER_MEGABYTE;
}
