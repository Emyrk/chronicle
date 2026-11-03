import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";

/** Class icon image with the standard unknown-class fallback. */
export function ClassIcon({ cls, className }: { cls: string; className?: string }) {
  return (
    <img
      src={`/c/icons/class_${cls ? cls.toLowerCase() : "unknown"}.png`}
      alt={CLASS_DISPLAY[cls] ?? cls}
      className={className}
      onError={(e) => {
        const image = e.currentTarget;
        const fallback = "/c/icons/class_unknown.png";
        if (image.getAttribute("src") === fallback) image.removeAttribute("src");
        else image.src = fallback;
      }}
    />
  );
}
