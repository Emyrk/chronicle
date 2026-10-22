import assert from "node:assert/strict";
import test from "node:test";

import { renderImageMetadata } from "../src/maps/renderImage.ts";

function writeUint24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(33, 0);
  bytes.set([73, 69, 78, 68], 37);
  return bytes;
}

function webp(type: string, payload: Uint8Array): Uint8Array {
  const paddedLength = payload.length + (payload.length % 2);
  const bytes = new Uint8Array(20 + paddedLength);
  bytes.set([..."RIFF"].map((character) => character.charCodeAt(0)));
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set([..."WEBP"].map((character) => character.charCodeAt(0)), 8);
  bytes.set([...type].map((character) => character.charCodeAt(0)), 12);
  new DataView(bytes.buffer).setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

test("reads PNG render dimensions and metadata", () => {
  assert.deepEqual(renderImageMetadata(png(2400, 1533)), {
    width: 2400,
    height: 1533,
    extension: "png",
    contentType: "image/png",
  });
});

test("reads extended WebP render dimensions and metadata", () => {
  const payload = new Uint8Array(10);
  writeUint24LE(payload, 4, 2399);
  writeUint24LE(payload, 7, 1532);
  assert.deepEqual(renderImageMetadata(webp("VP8X", payload)), {
    width: 2400,
    height: 1533,
    extension: "webp",
    contentType: "image/webp",
  });
});

test("reads lossy and lossless WebP dimensions", () => {
  const lossy = new Uint8Array(10);
  lossy.set([0x9d, 0x01, 0x2a], 3);
  new DataView(lossy.buffer).setUint16(6, 1600, true);
  new DataView(lossy.buffer).setUint16(8, 1000, true);
  assert.deepEqual(renderImageMetadata(webp("VP8 ", lossy)), {
    width: 1600,
    height: 1000,
    extension: "webp",
    contentType: "image/webp",
  });

  const width = 1774;
  const height = 2400;
  const lossless = new Uint8Array(5);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  lossless[0] = 0x2f;
  lossless[1] = widthMinusOne & 0xff;
  lossless[2] = ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6);
  lossless[3] = (heightMinusOne >> 2) & 0xff;
  lossless[4] = (heightMinusOne >> 10) & 0x0f;
  assert.deepEqual(renderImageMetadata(webp("VP8L", lossless)), {
    width,
    height,
    extension: "webp",
    contentType: "image/webp",
  });
});

test("rejects malformed and unsupported render images", () => {
  assert.throws(() => renderImageMetadata(new Uint8Array([0xff, 0xd8, 0xff])), /valid PNG or WebP/);

  const truncated = webp("VP8X", new Uint8Array(10));
  new DataView(truncated.buffer).setUint32(16, 100, true);
  assert.throws(() => renderImageMetadata(truncated), /truncated chunk/);

  assert.throws(() => renderImageMetadata(webp("EXIF", new Uint8Array(4))), /no supported image chunk/);
});
