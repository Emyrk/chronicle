import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";

/** Class icon image with the standard unknown-class fallback. */
export function ClassIcon({ cls, className }: { cls: string; className?: string }) {
  return (
    <img
      src={`/c/icons/class_${cls.toLowerCase()}.png`}
      alt={CLASS_DISPLAY[cls] ?? cls}
      className={className}
      onError={(e) => {
        (e.target as HTMLImageElement).src = "/c/icons/class_unknown.png";
      }}
    />
  );
}
