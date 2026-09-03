import { useState } from "react";
import { Link } from "react-router-dom";
import { useGuildDiscordAnnouncementAttempts } from "@/api/queries";
import type {
  DiscordChannel,
  GuildDiscordAnnouncementAttempt,
} from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 5;

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-500/15 text-green-600",
  failed: "bg-destructive/15 text-destructive",
  attempted: "bg-amber-500/15 text-amber-600",
  pending: "bg-muted text-muted-foreground",
};

function statusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "attempted":
      return "Attempted";
    default:
      return "Pending";
  }
}

export function DiscordAnnouncementHistoryList({
  attempts,
  channels,
  page,
  hasMore,
  onPrevious,
  onNext,
}: {
  attempts: readonly GuildDiscordAnnouncementAttempt[];
  channels: readonly DiscordChannel[];
  page: number;
  hasMore: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));

  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div>
        <h4 className="font-medium">Announcement history</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent Discord announcement attempts for this guild.
        </p>
      </div>

      {attempts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No announcements have been attempted yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {attempts.map((attempt) => {
            const timestamp = attempt.delivery_attempted_at || attempt.created_at;
            const channelName = channelNames.get(attempt.discord_channel_id);
            return (
              <div key={attempt.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[attempt.status] || STATUS_STYLES.pending}`}>
                      {statusLabel(attempt.status)}
                    </span>
                    <span className="text-muted-foreground">
                      {channelName ? `#${channelName}` : `Channel ${attempt.discord_channel_id}`}
                    </span>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={timestamp}>
                    {new Date(timestamp).toLocaleString()}
                  </time>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {attempt.instance_slug ? (
                    <Link className="text-primary hover:underline" to={`/instances/${attempt.instance_slug}`}>
                      View log
                    </Link>
                  ) : (
                    <span>Run {attempt.run_id}</span>
                  )}
                </div>
                {attempt.delivery_error && (
                  <p className="mt-2 break-words rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {attempt.delivery_error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={onPrevious}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button size="sm" variant="outline" disabled={!hasMore} onClick={onNext}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function DiscordAnnouncementHistory({
  guildId,
  channels,
}: {
  guildId: string | undefined;
  channels: readonly DiscordChannel[];
}) {
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useGuildDiscordAnnouncementAttempts(
    guildId,
    page,
    PAGE_SIZE,
  );

  if (isLoading && !data) {
    return <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">Loading announcement history...</div>;
  }
  if (error) {
    return <div className="rounded-md border border-border bg-background p-4 text-sm text-destructive">Unable to load announcement history.</div>;
  }

  return (
    <DiscordAnnouncementHistoryList
      attempts={data?.attempts || []}
      channels={channels}
      page={page}
      hasMore={data?.has_more || false}
      onPrevious={() => setPage((current) => Math.max(0, current - 1))}
      onNext={() => setPage((current) => current + 1)}
    />
  );
}
