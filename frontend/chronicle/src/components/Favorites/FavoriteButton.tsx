import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  isFavorite: boolean;
  isPending?: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}

export function FavoriteButton({
  isFavorite,
  isPending = false,
  label,
  onToggle,
  className,
}: FavoriteButtonProps) {
  const action = isFavorite ? "Remove from favorites" : "Add to favorites";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`${action}: ${label}`}
      title={action}
      disabled={isPending}
      onClick={onToggle}
      className={cn("gap-1.5", className)}
    >
      <Star
        className={cn(
          "h-4 w-4",
          isFavorite && "fill-amber-400 text-amber-400",
        )}
      />
      <span className="hidden sm:inline">{isFavorite ? "Favorited" : "Favorite"}</span>
    </Button>
  );
}
