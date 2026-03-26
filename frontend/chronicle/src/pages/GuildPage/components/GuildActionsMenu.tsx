import { Link } from "react-router-dom";
import { MoreVertical, Pencil, Users, Settings } from "lucide-react";
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
}

export function GuildActionsMenu({ guildId, canEdit, canViewRoster }: GuildActionsMenuProps) {
  if (!canEdit && !canViewRoster) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="absolute top-2 right-4 z-10 hidden md:flex h-8 w-8"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/guilds/${guildId}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Page
            </Link>
          </DropdownMenuItem>
        )}
        {canViewRoster && (
          <DropdownMenuItem asChild>
            <Link to={`/guilds/${guildId}/roster`}>
              <Users className="h-4 w-4 mr-2" />
              View Members
            </Link>
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link to={`/guilds/${guildId}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
