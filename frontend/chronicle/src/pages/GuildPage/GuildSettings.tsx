import { useState } from "react";
import { Navigate, useParams, useSearchParams, Link } from "react-router-dom";
import {
  useDeleteGuildDiscordInstallation,
  useGuildDiscordIntegration,
  useGuildSettings,
  useUpdateGuildDiscordIntegration,
  useUpdateGuildDiscordRaidLogAnnouncements,
  useUpdateGuildSettings,
  useGuildPage,
  type GuildDiscordIntegrationSettings,
  type RequestError,
} from "@/api/queries";
import { ArrowLeft, BellRing, Bot, UserPlus, Menu, X } from "lucide-react";
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

function DiscordRaidLogAnnouncementSettings({
  guildId,
  settings,
}: {
  guildId: string | undefined;
  settings: GuildDiscordIntegrationSettings;
}) {
  const announcements = settings.raid_log_announcements;
  const [enabled, setEnabled] = useState(announcements.enabled);
  const [scope, setScope] = useState(announcements.scope || "raids_only");
  const [channelId, setChannelId] = useState(announcements.channel_id || "");
  const updateAnnouncements = useUpdateGuildDiscordRaidLogAnnouncements(guildId);

  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Announce Raid Logs
            </label>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                enabled
                  ? "bg-green-500/15 text-green-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Post a Discord message when Chronicle receives a new log for this guild.
          </p>

          <fieldset
            disabled={!enabled}
            className={`mt-4 grid gap-4 transition-opacity sm:grid-cols-2 ${
              enabled ? "opacity-100" : "opacity-50"
            }`}
          >
            <label className="space-y-1.5 text-sm font-medium">
              Announce
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal disabled:cursor-not-allowed"
              >
                <option value="raids_only">Raids only</option>
                <option value="dungeons_only">Dungeons only</option>
                <option value="all">All</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              Discord channel
              {enabled && !channelId && (
                <span className="ml-1 text-xs font-normal text-destructive">Required</span>
              )}
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                aria-invalid={enabled && !channelId}
                className={`block h-9 w-full rounded-md border bg-background px-3 text-sm font-normal disabled:cursor-not-allowed ${
                  enabled && !channelId
                    ? "border-destructive ring-1 ring-destructive/50 focus:ring-destructive"
                    : "border-input"
                }`}
              >
                <option value="">Select a channel</option>
                {(settings.channels || []).map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          {enabled && settings.channels?.length === 0 && (
            <p className="mt-3 text-sm text-amber-600">
              Chronicle cannot find a text channel where it can post messages.
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button
              size="sm"
              disabled={updateAnnouncements.isPending || (enabled && !channelId)}
              onClick={() =>
                updateAnnouncements.mutate({
                  enabled,
                  scope,
                  channel_id: channelId,
                })
              }
            >
              {updateAnnouncements.isPending ? "Saving..." : "Save announcement settings"}
            </Button>
            {updateAnnouncements.isSuccess && (
              <span className="text-sm text-green-600">Saved</span>
            )}
          </div>

          {updateAnnouncements.error && (
            <p className="mt-3 text-sm text-destructive">
              {updateAnnouncements.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function GuildSettings() {
  const { guildId } = useParams<{ guildId: string }>();
  const [searchParams] = useSearchParams();
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
  const deleteDiscordInstallation = useDeleteGuildDiscordInstallation(guildId);
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get("tab") === "discord-integration"
      ? "discord-integration"
      : "join-requests",
  );

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

          <div className="relative border border-border rounded-lg p-6">
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
                        ? "Install Chronicle to link this guild with a Discord server."
                        : "Allow this guild to link Chronicle to a Discord server."}
                    </p>

                    {discordSettings.enabled && discordSettings.installed && (
                      <div className="mt-4 rounded-md border border-border bg-muted/40 p-4">
                        <p className="font-medium">{discordSettings.discord_guild_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Discord server ID: {discordSettings.discord_guild_id}
                        </p>
                        <div className="mt-4">
                          <DiscordRaidLogAnnouncementSettings
                            guildId={guildId}
                            settings={discordSettings}
                          />
                        </div>
                        <Button
                          className="mt-3"
                          variant="destructive"
                          size="sm"
                          disabled={deleteDiscordInstallation.isPending}
                          onClick={() => deleteDiscordInstallation.mutate()}
                        >
                          {deleteDiscordInstallation.isPending
                            ? "Unlinking..."
                            : "Unlink Discord Server"}
                        </Button>
                      </div>
                    )}

                    {discordSettings.enabled &&
                      !discordSettings.installed &&
                      discordSettings.install_url && (
                        <Button className="mt-4" asChild>
                          <a href={discordSettings.install_url}>
                            Install Chronicle on Discord
                          </a>
                        </Button>
                      )}

                    {discordSettings.can_enable && (
                      <Button
                        className="mt-4 md:absolute md:right-6 md:top-6 md:mt-0"
                        size="sm"
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

                    {deleteDiscordInstallation.error && (
                      <p className="mt-3 text-sm text-destructive">
                        {deleteDiscordInstallation.error.message}
                      </p>
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
