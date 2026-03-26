import { useParams, Link } from "react-router-dom";
import { useGuildRoster, useGuildPage } from "@/api/queries";
import { ArrowLeft, Shield, Crown, Users } from "lucide-react";
import { GuildPageHeader } from "./components";

export function GuildRoster() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig } = useGuildPage(guildId);
  const { data: members, isLoading, error } = useGuildRoster(guildId);

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
    <div className="w-full px-4 md:px-12">
      {pageConfig && (
        <GuildPageHeader guild={pageConfig.guild} theme={pageConfig.theme} />
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

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No members found.
        </p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {sorted.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="font-medium">{member.username}</span>
              <div className="flex gap-1.5">
                {member.roles.map((role) => (
                  <RoleBadge key={role} role={role} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
