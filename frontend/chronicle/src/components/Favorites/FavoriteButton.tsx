import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  isFavorite: boolean;
  isPending?: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
  iconOnly?: boolean;
}

export function FavoriteButton({
  isFavorite,
  isPending = false,
  label,
  onToggle,
  className,
  iconOnly = false,
}: FavoriteButtonProps) {
  const action = isFavorite ? "Remove from favorites" : "Add to favorites";

  return (
    <Button
      type="button"
      variant={iconOnly ? "ghost" : "outline"}
      size={iconOnly ? "icon" : "sm"}
      aria-label={`${action}: ${label}`}
      title={action}
      disabled={isPending}
      onClick={onToggle}
      className={cn("gap-1.5", iconOnly && "size-8", className)}
    >
      <Star
        className={cn(
          iconOnly ? "size-5" : "size-4",
          isFavorite && "fill-amber-400 text-amber-400",
        )}
      />
      {!iconOnly && <span className="hidden sm:inline">{isFavorite ? "Favorited" : "Favorite"}</span>}
    </Button>
  );
}
