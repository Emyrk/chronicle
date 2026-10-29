import { useEffect, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { toast } from "sonner";

interface ProofScreenshotDropzoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  title?: string;
  description?: string;
}

// Remount (via key) to clear the selection.
export function ProofScreenshotDropzone({
  file,
  onChange,
  title = "Upload your screenshot",
  description = "Click to browse or drag an image here",
}: ProofScreenshotDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const choose = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setPreview(previewRef.current);
    onChange(next);
  };

  return <label
    className={`relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-muted/40"}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped?.type.startsWith("image/")) choose(dropped);
      else toast.error("Drop an image file.");
    }}
  >
    <input type="file" accept="image/*" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
    {preview ? <>
      <img src={preview} alt="Selected screenshot" className="absolute inset-0 size-full bg-black object-contain" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-3 py-1.5 text-xs text-white">{file?.name} · Click to change</span>
    </> : <>
      <ImageUp className="size-8 text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </>}
  </label>;
}
