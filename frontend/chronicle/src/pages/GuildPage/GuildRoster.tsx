import { useParams, Link } from "react-router-dom";
import {
  useGuildRoster, useGuildPage, useGuildJoinRequests,
  useAcceptJoinRequest, useDenyJoinRequest,
  useUpdateGuildMemberRole, useRemoveGuildMember,
} from "@/api/queries";
import type { GuildJoinRequest, GuildRosterMember } from "@/api/queries";
import { ArrowLeft, Shield, Crown, Users, UserPlus, Check, X, Trash2, ChevronDown } from "lucide-react";
import { GuildPageHeader, GuildActionsMenu } from "./components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";

export function GuildRoster() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig } = useGuildPage(guildId);
  const { data: members, isLoading, error } = useGuildRoster(guildId);
  const canAdmin = pageConfig?.guild.can_edit ?? false;
  const { data: joinRequests } = useGuildJoinRequests(canAdmin ? guildId : undefined);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Unable to View Roster</h2>
        <p className="text-muted-foreground">
          You don't have permission to view this guild's roster.
        </p>
        <Link to={`/g/${guildId}`} className="mt-4 text-primary hover:underline">
          Back to Guild Page
        </Link>
      </div>
    );
  }

  const sorted = [...(members ?? [])].sort((a, b) => {
    // Leaders first, then alphabetical
    const aLeader = a.roles.includes("leader") ? 0 : 1;
    const bLeader = b.roles.includes("leader") ? 0 : 1;
    if (aLeader !== bLeader) return aLeader - bLeader;
    return a.username.localeCompare(b.username);
  });

  return (
    <div className="relative w-full px-4 md:px-12 pb-10">
      {pageConfig && (
        <>
          <GuildActionsMenu
            guildId={guildId!}
            canEdit={pageConfig.guild.can_edit}
            canViewRoster={pageConfig.guild.can_view_roster}
          />
          <GuildPageHeader guild={pageConfig.guild} theme={pageConfig.theme} />
        </>
      )}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to={`/g/${guildId}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Guild Members
        </h1>
        <span className="text-muted-foreground text-sm">
          ({sorted.length})
        </span>
      </div>

      {/* Pending Join Requests (admin only) */}
      {canAdmin && joinRequests && joinRequests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <UserPlus className="h-5 w-5" />
            Pending Join Requests
            <span className="text-sm text-muted-foreground font-normal">
              ({joinRequests.length})
            </span>
          </h2>
          <div className="border border-border rounded-lg divide-y divide-border">
            {joinRequests.map((req) => (
              <JoinRequestRow key={req.id} guildId={guildId!} request={req} />
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No members found.
        </p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {sorted.map((member) => (
            <MemberRow
              key={member.user_id}
              guildId={guildId!}
              member={member}
              canAdmin={canAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ guildId, member, canAdmin }: { guildId: string; member: GuildRosterMember; canAdmin: boolean }) {
  const updateRole = useUpdateGuildMemberRole(guildId);
  const removeMember = useRemoveGuildMember(guildId);
  const isPending = updateRole.isPending || removeMember.isPending;
  const isLeader = member.roles.includes("leader");

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="font-medium">{member.username}</span>
      <div className="flex items-center gap-1.5">
        {member.roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
        {canAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" disabled={isPending}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  updateRole.mutate({
                    userId: member.user_id,
                    role: isLeader ? "member" : "leader",
                  })
                }
              >
                <Crown className="h-4 w-4 mr-2" />
                {isLeader ? "Demote to Member" : "Promote to Leader"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => removeMember.mutate(member.user_id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove from Guild
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function JoinRequestRow({ guildId, request }: { guildId: string; request: GuildJoinRequest }) {
  const acceptMutation = useAcceptJoinRequest(guildId);
  const denyMutation = useDenyJoinRequest(guildId);
  const isPending = acceptMutation.isPending || denyMutation.isPending;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0">
        <span className="font-medium">{request.username}</span>
        {request.message && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {request.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {new Date(request.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => acceptMutation.mutate(request.id)}
          className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
        >
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => denyMutation.mutate(request.id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
        >
          <X className="h-4 w-4 mr-1" />
          Deny
        </Button>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "leader") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-500">
        <Crown className="h-3 w-3" />
        Leader
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500">
      Member
    </span>
  );
}
