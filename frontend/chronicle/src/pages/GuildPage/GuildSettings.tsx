import { useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import {
  useGuildDiscordIntegration,
  useGuildSettings,
  useUpdateGuildDiscordIntegration,
  useUpdateGuildSettings,
  useGuildPage,
  type RequestError,
} from "@/api/queries";
import { ArrowLeft, Bot, UserPlus, Menu, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GuildPageHeader, GuildActionsMenu } from "./components";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";

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

type Tab = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  { id: "join-requests", label: "Join Requests", icon: UserPlus },
  { id: "discord-integration", label: "Discord Integration", icon: Bot },
];

export function GuildSettings() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig, isLoading: isPageLoading } = useGuildPage(guildId);
  const {
    data: discordSettings,
    error: discordSettingsError,
    isLoading: isDiscordSettingsLoading,
  } = useGuildDiscordIntegration(guildId);
  const hasSettingsAccess = discordSettings !== undefined;
  const { data: settings, isLoading: isSettingsLoading } = useGuildSettings(
    guildId,
    hasSettingsAccess,
  );
  const updateSettings = useUpdateGuildSettings(guildId);
  const updateDiscordIntegration = useUpdateGuildDiscordIntegration(guildId);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("join-requests");

  const open = isOpen(settings?.allow_join_requests_until);

  if ((discordSettingsError as RequestError | null)?.status === 403) {
    return <Navigate to={`/g/${guildId}`} replace />;
  }

  if (discordSettingsError) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Unable to load guild settings.
      </div>
    );
  }

  if (
    isPageLoading ||
    isDiscordSettingsLoading ||
    (hasSettingsAccess && isSettingsLoading)
  ) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const renderNavLinks = (closeOnNavigate: boolean) => (
    <ul className="space-y-1">
      {TABS.map((tab) => (
        <li key={tab.id}>
          <button
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              if (closeOnNavigate) setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        </li>
      ))}
    </ul>
  );

  const settingsContent = (
    <>
      {activeTab === "join-requests" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Join Requests</h2>
            <p className="text-muted-foreground">
              Control whether users can request to join your guild.
            </p>
          </div>

          <div className="border border-border rounded-lg p-6">
            <h3 className="font-medium">Open Join Window</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Open join requests for a set duration. Users can request to join
              your guild from the guild page. Requests must be approved by a
              guild leader.
            </p>

            {open && settings?.allow_join_requests_until && (
              <p className="text-sm text-green-600 mt-3">
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
      )}
      {activeTab === "discord-integration" && discordSettings && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Discord Integration</h2>
            <p className="text-muted-foreground">
              Link Chronicle to your Discord server and announce new raid logs.
            </p>
          </div>

          <div className="border border-border rounded-lg p-6">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                {!discordSettings.available ? (
                  <>
                    <h3 className="font-medium">Discord integration is not supported</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      The Discord bot is not configured on this Chronicle deployment.
                    </p>
                  </>
                ) : !discordSettings.enabled &&
                  !discordSettings.can_enable ? (
                  <>
                    <h3 className="font-medium">Discord linking is not enabled</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Contact a Chronicle administrator to enable Discord integration for
                      this guild.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium">
                      {discordSettings.enabled
                        ? "Discord linking is enabled"
                        : "Enable Discord linking"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {discordSettings.enabled
                        ? "Guild administrators can link the Discord bot when installation support is added."
                        : "Allow this guild to link Chronicle to a Discord server."}
                    </p>

                    {discordSettings.can_enable && (
                      <Button
                        className="mt-4"
                        variant={
                          discordSettings.enabled
                            ? "destructive"
                            : "default"
                        }
                        disabled={updateDiscordIntegration.isPending}
                        onClick={() =>
                          updateDiscordIntegration.mutate({
                            enabled: !discordSettings.enabled,
                          })
                        }
                      >
                        {updateDiscordIntegration.isPending
                          ? "Saving..."
                          : discordSettings.enabled
                            ? "Disable Discord Linking"
                            : "Enable Discord Linking"}
                      </Button>
                    )}

                    {updateDiscordIntegration.error && (
                      <p className="mt-3 text-sm text-destructive">
                        {updateDiscordIntegration.error.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="relative w-full px-4 md:px-12">
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
        <h1 className="text-lg font-semibold">Guild Settings</h1>
      </div>

      {isMobile ? (
        <div className="relative min-h-[calc(100vh-16rem)]">
          {mobileSidebarOpen && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close settings menu"
            />
          )}

          <nav
            className={`fixed left-0 top-0 z-50 h-full w-72 border-r bg-background p-4 shadow-xl transition-transform duration-200 ${
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Settings</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close settings menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderNavLinks(true)}
          </nav>

          <main>
            <Button
              variant="outline"
              size="sm"
              className="mb-4 gap-2"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
              Settings menu
            </Button>
            {settingsContent}
          </main>
        </div>
      ) : (
        <div className="flex min-h-[calc(100vh-16rem)]">
          <nav className="w-56 border-r pr-4">
            {renderNavLinks(false)}
          </nav>
          <main className="flex-1 pl-8">
            {settingsContent}
          </main>
        </div>
      )}
    </div>
  );
}
