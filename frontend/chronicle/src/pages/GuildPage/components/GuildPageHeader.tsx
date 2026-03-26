import type { GuildInfo, GuildPageTheme, SocialPlatform } from "@/api/typesGenerated";
import { Youtube, Twitch, Twitter, Globe } from "lucide-react";
import { DiscordIcon } from "@/components/icons/DiscordIcon";

export const SOCIAL_PLATFORM_META: Record<
  SocialPlatform,
  { label: string; icon: React.ReactNode; placeholder: string }
> = {
  discord: {
    label: "Discord",
    icon: <DiscordIcon className="h-4 w-4" />,
    placeholder: "https://discord.gg/...",
  },
  youtube: {
    label: "YouTube",
    icon: <Youtube className="h-4 w-4" />,
    placeholder: "https://youtube.com/...",
  },
  twitch: {
    label: "Twitch",
    icon: <Twitch className="h-4 w-4" />,
    placeholder: "https://twitch.tv/...",
  },
  twitter: {
    label: "Twitter / X",
    icon: <Twitter className="h-4 w-4" />,
    placeholder: "https://x.com/...",
  },
  website: {
    label: "Website",
    icon: <Globe className="h-4 w-4" />,
    placeholder: "https://...",
  },
};

// Re-export generated constants for convenience
export { GuildTags as AVAILABLE_TAGS, SocialPlatforms as AVAILABLE_SOCIAL_PLATFORMS } from "@/api/typesGenerated";

interface GuildPageHeaderProps {
  guild: GuildInfo;
  theme: GuildPageTheme;
  /** Rendered to the left of the logo (e.g. Join Guild button) */
  leading?: React.ReactNode;
}

export function GuildPageHeader({ guild, theme, leading }: GuildPageHeaderProps) {
  const tags = theme.tags ?? [];
  const socials = theme.socials ?? {};
  const hasSocials = Object.values(socials).some((url) => url);

  return (
    <div className="mb-6 pt-6">
      {/* Desktop: row with tags+socials | logo+name. Mobile: stacked centered */}
      <div className="flex flex-col md:flex-row items-center md:justify-center gap-3 md:gap-6">
        {/* Tags + Socials — left on desktop, below on mobile */}
        {(tags.length > 0 || hasSocials) && (
          <div className="order-2 md:order-2 flex flex-col items-center md:items-start gap-2">
            {tags.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-md border border-border bg-muted/50 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {hasSocials && (
              <div className="flex items-center gap-1.5">
                {(Object.entries(socials) as [SocialPlatform, string][]).map(([platform, url]) => {
                  if (!url) return null;
                  const meta = SOCIAL_PLATFORM_META[platform];
                  if (!meta) return null;
                  return (
                    <a
                      key={platform}
                      href={url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title={meta.label}
                    >
                      {meta.icon}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logo + Name + Realm — center */}
        <div className="order-1 md:order-1 flex items-center gap-3">
          {leading}
          {theme.logo_url ? (
            <img
              src={theme.logo_url}
              alt={`${guild.name} logo`}
              className="w-20 h-20 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted border-2 border-border flex items-center justify-center">
              <span className="text-3xl font-bold text-muted-foreground">
                {guild.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="text-left">
            <h1 className="text-3xl font-bold">{guild.name}</h1>
            <p className="text-sm text-muted-foreground">{guild.realm_name}</p>
          </div>
        </div>
      </div>

      {/* Description — always centered below */}
      {theme.description && (
        <p className="mt-3 text-sm text-white text-center max-w-2xl mx-auto">
          {theme.description}
        </p>
      )}
    </div>
  );
}
