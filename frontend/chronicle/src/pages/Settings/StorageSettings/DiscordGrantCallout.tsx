import { ExternalLink } from "lucide-react";
import { useSession } from "@/api/queries";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
// Mirrors storagegrants.DiscordMemberStorageBytes.
const DISCORD_MEMBER_STORAGE_BYTES = 50_000_000;

/**
 * Prompts users without the Discord member grant to join the server for bonus
 * storage. The grant follows the account's linked Discord, so accounts without
 * one are asked to connect it too.
 */
export function DiscordGrantCallout({ compact = false }: { compact?: boolean }) {
  const { data: session } = useSession();
  const needsLink = !!session && !(session.auth_providers?.includes("discord") ?? false);
  const buttonClass = cn("shrink-0", compact && "self-start");
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/10 p-4", !compact && "sm:flex-row sm:items-center")}>
      {/* Compact keeps the icon inline with the text; otherwise this wrapper is layout-transparent. */}
      <div className={compact ? "flex items-start gap-3" : "contents"}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
          <DiscordIcon className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            Unlock +{formatBytes(DISCORD_MEMBER_STORAGE_BYTES)} of storage by{" "}
            {needsLink ? "connecting your Discord account and joining our Discord" : "joining our Discord"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {needsLink
              ? "Connect Discord to your Chronicle account, then join the Chronicle Discord server. The bonus is applied automatically and stays active as long as you remain a member."
              : "Members of the Chronicle Discord server get a bonus storage grant. It's applied automatically after you join and stays active as long as you remain a member."}
          </p>
        </div>
      </div>
      <div className={cn("flex shrink-0 flex-wrap gap-2", compact && "ml-[3.25rem]")}>
        {needsLink && (
          <Button asChild size="sm" className={cn(buttonClass, "bg-[#5865F2] text-white hover:bg-[#4752C4]")}>
            <a href="/auth/discord/link?from=/account/storage">
              <DiscordIcon className="size-3.5" />
              Connect Discord
            </a>
          </Button>
        )}
        <Button
          asChild
          size="sm"
          variant={needsLink ? "outline" : "default"}
          className={cn(buttonClass, !needsLink && "bg-[#5865F2] text-white hover:bg-[#4752C4]")}
        >
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Join Discord
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
