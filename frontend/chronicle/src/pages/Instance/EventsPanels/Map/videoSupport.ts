/**
 * Whether this browser can encode video at all (WebCodecs). Kept apart from
 * videoExport so checking it doesn't pull mediabunny into the instance page.
 */
export function canEncodeVideo(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}
