import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, QUALITY_HIGH } from "mediabunny";

export interface CanvasVideoExportOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  frameCount: number;
  /** Puts the canvas in the state for frame `index`; resolves once it is drawn. */
  renderFrame: (index: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface CanvasVideoExportResult {
  blob: Blob;
  codec: string;
  width: number;
  height: number;
  elapsedMs: number;
}

/**
 * Encodes a canvas frame by frame into an MP4, entirely in the browser
 * (WebCodecs via Mediabunny). Frames are stepped, not recorded, so the output
 * plays smoothly at `fps` however slowly each frame renders.
 */
export async function exportCanvasVideo({ canvas, fps, frameCount, renderFrame, onProgress, signal }: CanvasVideoExportOptions): Promise<CanvasVideoExportResult> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser has no WebCodecs VideoEncoder");
  const width = canvas.width;
  const height = canvas.height;
  // H.264 first: it plays everywhere (Discord, phones). AV1/VP9 in MP4 are fallbacks.
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
  if (!codec) throw new Error(`No encodable video codec for ${width}x${height}`);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const started = performance.now();
  try {
    for (let index = 0; index < frameCount; index += 1) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      await renderFrame(index);
      await source.add(index / fps, 1 / fps);
      onProgress?.(index + 1, frameCount);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Encoder produced no output");
  return { blob: new Blob([buffer], { type: "video/mp4" }), codec, width, height, elapsedMs: performance.now() - started };
}
