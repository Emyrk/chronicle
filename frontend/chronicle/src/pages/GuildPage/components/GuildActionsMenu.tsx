import { Link } from "react-router-dom";
import { BarChart3, MoreVertical, Pencil, Users, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";

interface GuildActionsMenuProps {
  guildId: string;
  canEdit: boolean;
  canViewRoster: boolean;
  hasFavoriteButton?: boolean;
}

export function GuildActionsMenu({ guildId, canEdit, canViewRoster, hasFavoriteButton = false }: GuildActionsMenuProps) {
  if (!canEdit && !canViewRoster) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`absolute top-2 z-10 hidden h-8 w-8 md:flex ${hasFavoriteButton ? "right-32" : "right-4"}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/g/${guildId}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Page
            </Link>
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/g/${guildId}/analytics`}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Popularity
            </Link>
          </DropdownMenuItem>
        )}
        {canViewRoster && (
          <DropdownMenuItem asChild>
            <Link to={`/g/${guildId}/roster`}>
              <Users className="h-4 w-4 mr-2" />
              View Members
            </Link>
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/g/${guildId}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
