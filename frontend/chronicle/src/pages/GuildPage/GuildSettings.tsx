import { useParams, Link } from "react-router-dom";
import { useGuildSettings, useUpdateGuildSettings, useGuildPage } from "@/api/queries";
import { ArrowLeft, Settings } from "lucide-react";
import { GuildPageHeader } from "./components";
import { Button } from "@/components/ui/button";

export function GuildSettings() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig } = useGuildPage(guildId);
  const { data: settings, isLoading } = useGuildSettings(guildId);
  const updateSettings = useUpdateGuildSettings(guildId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

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
          <Settings className="h-6 w-6" />
          Guild Settings
        </h1>
      </div>

      <div className="border border-border rounded-lg p-6 max-w-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Allow Join Requests</h3>
            <p className="text-sm text-muted-foreground mt-1">
              When enabled, users can request to join your guild from the guild page.
              Requests must be approved by a guild leader.
            </p>
          </div>
          <Button
            variant={settings?.allow_join_requests ? "default" : "outline"}
            size="sm"
            disabled={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({
                allow_join_requests: !settings?.allow_join_requests,
              })
            }
          >
            {settings?.allow_join_requests ? "Enabled" : "Disabled"}
          </Button>
        </div>
      </div>
    </div>
  );
}
