// Return feedback rather than leaving clipboard rejections unhandled.
export async function copyPossibleHostilesCode(code: string, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard): Promise<string> {
  try {
    await clipboard.writeText(code);
    return "Copied!";
  } catch {
    return "Copy failed. Select and copy the code manually.";
  }
}
