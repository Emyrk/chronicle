export interface RenderImageMetadata {
  width: number;
  height: number;
  extension: "png" | "webp";
  contentType: "image/png" | "image/webp";
}

const MAX_RENDER_DIMENSION = 32768;

function uint16LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function uint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function uint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validateDimensions(width: number, height: number, format: string): { width: number; height: number } {
  if (width <= 0 || height <= 0 || width > MAX_RENDER_DIMENSION || height > MAX_RENDER_DIMENSION) {
    throw new TypeError(`render ${format} has invalid dimensions`);
  }
  return { width, height };
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) {
    throw new TypeError("render asset must be a valid PNG or WebP image");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIHDR = false;
  let sawIEND = false;
  while (offset + 12 <= bytes.length) {
    const length = uint32BE(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new TypeError("render PNG has a truncated chunk");
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (!sawIHDR) {
      if (type !== "IHDR" || length !== 13) throw new TypeError("render PNG has no valid IHDR chunk");
      width = uint32BE(bytes, offset + 8);
      height = uint32BE(bytes, offset + 12);
      sawIHDR = true;
    }
    offset = end;
    if (type === "IEND") {
      if (length !== 0 || offset !== bytes.length) throw new TypeError("render PNG has an invalid IEND chunk");
      sawIEND = true;
      break;
    }
  }
  if (!sawIHDR || !sawIEND) throw new TypeError("render PNG has invalid dimensions or chunks");
  return validateDimensions(width, height, "PNG");
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 20 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
      String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP" || uint32LE(bytes, 4) + 8 !== bytes.length) {
    throw new TypeError("render asset must be a valid PNG or WebP image");
  }
  let offset = 12;
  let dimensions: { width: number; height: number } | undefined;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const length = uint32LE(bytes, offset + 4);
    const data = offset + 8;
    const end = data + length;
    const paddedEnd = end + (length % 2);
    if (paddedEnd > bytes.length) throw new TypeError("render WebP has a truncated chunk");

    if (!dimensions && type === "VP8X" && length >= 10) {
      dimensions = validateDimensions(uint24LE(bytes, data + 4) + 1, uint24LE(bytes, data + 7) + 1, "WebP");
    } else if (!dimensions && type === "VP8 " && length >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      dimensions = validateDimensions(uint16LE(bytes, data + 6) & 0x3fff, uint16LE(bytes, data + 8) & 0x3fff, "WebP");
    } else if (!dimensions && type === "VP8L" && length >= 5 && bytes[data] === 0x2f) {
      const width = 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8);
      const height = 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10);
      dimensions = validateDimensions(width, height, "WebP");
    }

    offset = paddedEnd;
  }
  if (offset !== bytes.length) throw new TypeError("render WebP has a truncated chunk");
  if (!dimensions) throw new TypeError("render WebP has no supported image chunk");
  return dimensions;
}

export function renderImageMetadata(bytes: Uint8Array): RenderImageMetadata {
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { ...webpDimensions(bytes), extension: "webp", contentType: "image/webp" };
  }
  return { ...pngDimensions(bytes), extension: "png", contentType: "image/png" };
}
