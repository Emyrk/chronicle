import {
  Award,
  BookOpen,
  Compass,
  Flag,
  Keyboard,
  LayoutGrid,
  Link2,
  Search,
  Settings2,
  Star,
  Telescope,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";

/** Icon keys sent by the API. Unknown keys fall back to a generic award. */
const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  telescope: Telescope,
  "layout-grid": LayoutGrid,
  keyboard: Keyboard,
  search: Search,
  compass: Compass,
  link: Link2,
  users: Users,
  flag: Flag,
  trophy: Trophy,
  cog: Settings2,
  star: Star,
};


export function AchievementIcon({
  icon,
  earned,
  size = "md",
  className,
}: {
  icon: string | undefined;
  earned: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border",
        size === "sm" && "h-8 w-8",
        size === "md" && "h-11 w-11",
        size === "lg" && "h-14 w-14",
        earned
          ? "border-amber-400/60 bg-gradient-to-b from-amber-300/25 to-amber-700/20 text-amber-200 shadow-[0_0_12px_-4px] shadow-amber-400/60"
          : "border-border bg-muted/40 text-muted-foreground/60",
        className,
      )}
    >
      {createElement((icon && ICONS[icon]) || Award, {
        className: cn(size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-7 w-7"),
      })}
    </div>
  );
}
