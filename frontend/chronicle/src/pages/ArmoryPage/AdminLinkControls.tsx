import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Link2, Link2Off, Loader2, ShieldCheck, X } from "lucide-react";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import {
  useAdminCharacterLink,
  useAdminLinkCharacter,
  useAdminUnlinkCharacter,
  useAdminUsers,
  useAuthorizationCheck,
  type RequestError,
} from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADMIN_CHECKS = { admin_users: "chronicle:chronicle#admin_users" };

function errorToast(fallback: string, error: unknown) {
  const requestError = error as RequestError;
  toast.error(requestError?.message || fallback);
}

function UserPicker({
  onPick,
  onCancel,
  pending,
}: {
  onPick: (userId: string, username: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const { data: usersData, isLoading } = useAdminUsers();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !usersData) return [];
    return usersData.users
      .filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, usersData]);

  return (
    <div className="w-full space-y-2 text-left">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          placeholder="Search users by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8"
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading users...
        </div>
      ) : matches.length > 0 ? (
        <div className="max-h-48 overflow-y-auto divide-y rounded border">
          {matches.map((user) => (
            <button
              key={user.id}
              type="button"
              className="w-full flex flex-col px-3 py-1.5 text-left hover:bg-muted/50 disabled:opacity-50"
              disabled={pending}
              onClick={() => onPick(user.id, user.username)}
            >
              <span className="text-sm font-medium">{user.username}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-1">
          {query.trim().length < 2 ? "Type at least 2 characters to search." : "No users found."}
        </p>
      )}
    </div>
  );
}

/**
 * Admin-only link/unlink controls for the armory page, shown as a floating
 * panel in the bottom-right corner. Desktop only; renders nothing for
 * non-admins or on mobile.
 */
export function AdminLinkControls({ player }: { player: ArmoryPlayer }) {
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuth();
  const { data: authz } = useAuthorizationCheck(ADMIN_CHECKS, {
    enabled: isAuthenticated && !isMobile,
  });
  const isAdmin = authz?.admin_users ?? false;

  const { data: link, isLoading } = useAdminCharacterLink(
    { realm_id: player.realm_id, character_guid: player.id },
    { enabled: isAdmin && !isMobile },
  );
  const linkMutation = useAdminLinkCharacter();
  const unlinkMutation = useAdminUnlinkCharacter();
  const [picking, setPicking] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (isMobile || !isAdmin || isLoading) return null;

  const handleUnlink = () => {
    if (!link) return;
    if (!window.confirm(`Unlink ${player.name} from ${link.username}?`)) return;
    unlinkMutation.mutate(
      { userId: link.user_id, realmId: player.realm_id, characterGuid: player.id },
      {
        onSuccess: () => toast.success(`${player.name} unlinked.`),
        onError: (error) => errorToast("Failed to unlink character", error),
      },
    );
  };

  const handlePick = (userId: string, username: string) => {
    linkMutation.mutate(
      { userId, request: { realm_id: player.realm_id, character_guid: player.id } },
      {
        onSuccess: () => {
          toast.success(`${player.name} linked to ${username}.`);
          setPicking(false);
        },
        onError: (error) => errorToast("Failed to link character", error),
      },
    );
  };

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full shadow-lg"
          onClick={() => setCollapsed(false)}
          aria-label="Show admin link controls"
        >
          <ShieldCheck className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 rounded-lg border bg-popover shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin · Character Link
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse admin link controls"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-2">
        {link ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm min-w-0">
              <span className="text-muted-foreground">{player.name} is linked to </span>
              <Link to="/admin/users" className="font-medium hover:underline">
                {link.username}
              </Link>
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive shrink-0"
              disabled={unlinkMutation.isPending}
              onClick={handleUnlink}
            >
              <Link2Off className="h-3 w-3 mr-1" />
              Unlink
            </Button>
          </div>
        ) : picking ? (
          <UserPicker onPick={handlePick} onCancel={() => setPicking(false)} pending={linkMutation.isPending} />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{player.name} is not linked to an account.</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={() => setPicking(true)}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
