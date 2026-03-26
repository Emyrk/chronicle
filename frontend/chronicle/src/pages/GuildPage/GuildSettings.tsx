import { useParams, Link } from "react-router-dom";
import { useGuildSettings, useUpdateGuildSettings, useGuildPage } from "@/api/queries";
import { ArrowLeft, Settings } from "lucide-react";
import { GuildPageHeader } from "./components";
import { Button } from "@/components/ui/button";

function isOpen(until: string | null | undefined): boolean {
  if (!until) return false;
  return new Date(until) > new Date();
}

const DURATION_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
] as const;

export function GuildSettings() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig } = useGuildPage(guildId);
  const { data: settings, isLoading } = useGuildSettings(guildId);
  const updateSettings = useUpdateGuildSettings(guildId);

  const open = isOpen(settings?.allow_join_requests_until);

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
        <div>
          <h3 className="font-medium">Allow Join Requests</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Open join requests for a set duration. Users can request to join your
            guild from the guild page. Requests must be approved by a guild leader.
          </p>

          {open && settings?.allow_join_requests_until && (
            <p className="text-sm text-green-600 mt-2">
              Open until{" "}
              {new Date(settings.allow_join_requests_until).toLocaleString()}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {DURATION_OPTIONS.map((opt) => (
              <Button
                key={opt.hours}
                variant="outline"
                size="sm"
                disabled={updateSettings.isPending}
                onClick={() => {
                  const until = new Date(
                    Date.now() + opt.hours * 60 * 60 * 1000,
                  ).toISOString();
                  updateSettings.mutate({
                    allow_join_requests_until: until,
                  });
                }}
              >
                {opt.label}
              </Button>
            ))}
            {open && (
              <Button
                variant="destructive"
                size="sm"
                disabled={updateSettings.isPending}
                onClick={() =>
                  updateSettings.mutate({ allow_join_requests_until: null })
                }
              >
                Close Now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
