// The browser handles source formats (PNG, WebP, HEIC where supported). Never
// upload the original: remove its metadata and bound the encoded JPEG size.
export async function encodeProofScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image conversion is unavailable in this browser");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = attempt < 2 ? 0.86 - attempt * 0.14 : 0.72;
      const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (result && result.size <= 4 * 1024 * 1024) return result;
      scale *= 0.8;
    }
    throw new Error("Screenshot is too large to upload. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}
