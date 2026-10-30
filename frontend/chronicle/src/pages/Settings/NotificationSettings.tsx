import { Bell, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { NotificationChannel, NotificationEvent } from "@/api/typesGenerated";
import { useMyNotificationSettings, useUpdateNotificationSetting } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Switch } from "@/components/ui/Switch/Switch";
import { DiscordIcon } from "@/components/icons/DiscordIcon";

const EVENTS: { event: NotificationEvent; label: string; description: string }[] = [
  {
    event: "sidekick_upload_accepted",
    label: "Sidekick upload accepted",
    description: "Chronicle received a log that Sidekick uploaded for you.",
  },
  {
    event: "upload_processed",
    label: "Upload processed",
    description: "A log you uploaded finished processing. Reparses are not included.",
  },
];

export function NotificationSettings() {
  const { data, isLoading, error } = useMyNotificationSettings();
  const updateSetting = useUpdateNotificationSetting();
  const discordLinked = data?.discord_linked ?? false;

  const isEnabled = (channel: NotificationChannel, event: NotificationEvent) =>
    data?.settings.some((setting) => setting.channel === channel && setting.event === event && setting.enabled) ?? false;

  const toggle = (channel: NotificationChannel, event: NotificationEvent, enabled: boolean) => {
    updateSetting.mutate(
      { channel, event, enabled },
      { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update notification setting") },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Notifications</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">Choose what Chronicle tells you about, and where.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading notification settings...</div>
      ) : error ? (
        <Card className="border-destructive/40 p-5 text-sm text-destructive">Could not load your notification settings.</Card>
      ) : (
        <Card className="overflow-x-auto p-0 styled-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="w-32 px-5 py-3 text-center font-medium">
                  <span className="inline-flex items-center gap-1.5"><DiscordIcon className="size-4 text-[#5865F2]" /> Discord</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(({ event, label, description }) => (
                <tr key={event} className="border-b last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium">{label}</div>
                    <div className="text-muted-foreground">{description}</div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Switch
                      aria-label={`${label} via Discord`}
                      checked={discordLinked && isEnabled("discord", event)}
                      disabled={!discordLinked || updateSetting.isPending}
                      onCheckedChange={(enabled) => toggle("discord", event, enabled)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!discordLinked && (
            <p className="border-t px-5 py-3 text-muted-foreground">
              <Link to="/account/settings" className="text-primary hover:underline">Connect Discord</Link> on your profile to get notifications as direct messages.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
