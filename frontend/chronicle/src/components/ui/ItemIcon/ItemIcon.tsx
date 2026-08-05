import { Package } from "lucide-react";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { getQualityBorderClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";

export interface ItemIconProps {
  /** Icon file name (e.g. "inv_helmet_21"). Empty renders a placeholder. */
  icon?: string;
  /** Item quality 0-6; colors the border. */
  quality?: number;
  /** Square size in pixels. */
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * Quality-bordered square item icon. Resolves the icon CDN URL from the
 * surrounding DatasetProvider.
 */
export function ItemIcon({ icon, quality = 1, size = 32, alt = "", className }: ItemIconProps) {
  const iconBaseUrl = useIconBaseUrl();
  const border = getQualityBorderClass(quality);

  if (!icon) {
    return (
      <div
        className={cn("rounded border bg-zinc-800 flex items-center justify-center shrink-0", border, className)}
        style={{ width: size, height: size }}
      >
        <Package className="h-4 w-4 text-zinc-600" />
      </div>
    );
  }

  return (
    <img
      src={iconUrl(icon, iconBaseUrl)}
      alt={alt}
      className={cn("rounded border shrink-0", border, className)}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}
