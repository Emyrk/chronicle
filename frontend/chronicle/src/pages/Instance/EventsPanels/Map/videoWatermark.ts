/** The Chronicle "C" burned into every rendered video. */
export const WATERMARK_URL = "/c/chronicle/ChronicleIcon.png";
/** Icon size as a fraction of the output height. */
export const WATERMARK_HEIGHT_FRACTION = 0.07;
/** Gap to the bottom and right edges as a fraction of the output height. */
export const WATERMARK_MARGIN_FRACTION = 0.03;
export const WATERMARK_OPACITY = 0.85;

/** Where the watermark goes in a width x height frame: bottom-right, scaled with the height. */
export function watermarkRect(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.round(height * WATERMARK_HEIGHT_FRACTION);
  const margin = Math.round(height * WATERMARK_MARGIN_FRACTION);
  return { x: width - margin - size, y: height - margin - size, size };
}

/** Loads and decodes the watermark; null when it cannot load (the video renders without it). */
export async function loadWatermark(url: string = WATERMARK_URL): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/**
 * A 2D canvas at the source's size that receives each frame plus the
 * watermark, so only the encoded video carries it, never the live view.
 */
export function createWatermarkedCanvas(source: HTMLCanvasElement, logo: ImageBitmap): { canvas: HTMLCanvasElement; compose: () => void } | null {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  const { x, y, size } = watermarkRect(canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  return {
    canvas,
    compose: () => {
      context.globalAlpha = 1;
      context.drawImage(source, 0, 0);
      context.globalAlpha = WATERMARK_OPACITY;
      context.drawImage(logo, x, y, size, size);
    },
  };
}
