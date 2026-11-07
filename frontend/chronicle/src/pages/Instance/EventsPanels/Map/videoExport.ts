import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, type VideoCodec } from "mediabunny";
import { canEncodeVideo } from "./videoSupport";
import { createWatermarkedCanvas, loadWatermark } from "./videoWatermark";

/** The rendered video's frame rate. */
export const VIDEO_FPS = 30;
/** Output sizes, best first: 1080p, then 720p where 1080p cannot be encoded. */
export const VIDEO_SIZES = [
  { width: 1920, height: 1080, bitrate: 8_000_000 },
  { width: 1280, height: 720, bitrate: 5_000_000 },
] as const;
// H.264 first: it plays everywhere (Discord, phones, QuickTime). VP9/AV1 in MP4 are fallbacks.
const CODECS: VideoCodec[] = ["avc", "vp9", "av1"];

export interface VideoOutputConfig {
  width: number;
  height: number;
  bitrate: number;
  codec: VideoCodec;
}

/** The best output size and codec this browser can encode, or null when it can encode none. */
export async function pickVideoOutput(): Promise<VideoOutputConfig | null> {
  if (!canEncodeVideo()) return null;
  for (const size of VIDEO_SIZES) {
    const codec = await getFirstEncodableVideoCodec(CODECS, { width: size.width, height: size.height, bitrate: size.bitrate });
    if (codec) return { ...size, codec };
  }
  return null;
}

export interface CanvasVideoExportOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  frameCount: number;
  /** The codec and bitrate (pickVideoOutput); the canvas already has the output size. */
  codec: VideoCodec;
  bitrate: number;
  /** Puts the canvas in the state for frame `index`; resolves once it is drawn. */
  renderFrame: (index: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  /** Called when rendering pauses (the tab is hidden) and resumes. */
  onPausedChange?: (paused: boolean) => void;
  signal?: AbortSignal;
  /** The image burned into the bottom-right of every frame (videoWatermark); null for none. */
  watermarkUrl?: string | null;
  /** Draws over every encoded frame (never the live canvas), after `renderFrame` resolves. */
  overlay?: (context: CanvasRenderingContext2D, width: number, height: number) => void;
}

export interface CanvasVideoExportResult {
  blob: Blob;
  codec: string;
  width: number;
  height: number;
  elapsedMs: number;
}

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

// Resolves once the tab is visible (browsers stall rendering in hidden tabs);
// rejects if aborted meanwhile.
function whileHidden(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      if (document.visibilityState !== "visible" && !signal?.aborted) return;
      document.removeEventListener("visibilitychange", done);
      signal?.removeEventListener("abort", done);
      if (signal?.aborted) reject(abortError());
      else resolve();
    };
    document.addEventListener("visibilitychange", done);
    signal?.addEventListener("abort", done);
  });
}

/**
 * Encodes a canvas frame by frame into an MP4, entirely in the browser
 * (WebCodecs via Mediabunny). Frames are stepped, not recorded, so the output
 * plays smoothly at `fps` however slowly each frame renders. Pauses while the
 * tab is hidden; an abort cancels the encoder and throws an AbortError.
 *
 * Every frame is copied onto a 2D canvas with the Chronicle watermark (and
 * `overlay`) drawn over it, so they are in the file but never on the live
 * canvas. With neither, frames are encoded straight from the canvas.
 *
 * The file is built in memory (about 1 MB per second at 1080p), which keeps a
 * long fight's export to a few hundred megabytes.
 */
export async function exportCanvasVideo({ canvas, fps, frameCount, codec, bitrate, renderFrame, onProgress, onPausedChange, signal, watermarkUrl, overlay }: CanvasVideoExportOptions): Promise<CanvasVideoExportResult> {
  if (!canEncodeVideo()) throw new Error("This browser has no WebCodecs VideoEncoder");
  const { width, height } = canvas;
  const logo = watermarkUrl === null ? null : await loadWatermark(watermarkUrl);
  const watermarked = logo || overlay ? createWatermarkedCanvas(canvas, logo, overlay) : null;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(watermarked?.canvas ?? canvas, { codec, bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const started = performance.now();
  let pausedMs = 0;
  try {
    for (let index = 0; index < frameCount; index += 1) {
      if (signal?.aborted) throw abortError();
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        const pausedAt = performance.now();
        onPausedChange?.(true);
        await whileHidden(signal);
        onPausedChange?.(false);
        pausedMs += performance.now() - pausedAt;
      }
      await renderFrame(index);
      if (signal?.aborted) throw abortError();
      watermarked?.compose();
      await source.add(index / fps, 1 / fps);
      onProgress?.(index + 1, frameCount);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    logo?.close();
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Encoder produced no output");
  return { blob: new Blob([buffer], { type: "video/mp4" }), codec, width, height, elapsedMs: performance.now() - started - pausedMs };
}
