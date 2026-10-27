import { ExternalLink } from "lucide-react";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
// Mirrors storagegrants.DiscordMemberStorageBytes.
const DISCORD_MEMBER_STORAGE_BYTES = 50_000_000;

/** Prompts users without the Discord member grant to join the server for bonus storage. */
export function DiscordGrantCallout({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/10 p-4", !compact && "sm:flex-row sm:items-center")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
        <DiscordIcon className="size-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">
          Unlock +{formatBytes(DISCORD_MEMBER_STORAGE_BYTES)} of storage by joining our Discord
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Members of the Chronicle Discord server get a bonus storage grant. It's applied automatically after you
          join and stays active as long as you remain a member.
        </p>
      </div>
      <Button asChild size="sm" className={cn("shrink-0 bg-[#5865F2] text-white hover:bg-[#4752C4]", compact && "self-start")}>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          Join Discord
          <ExternalLink className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}
