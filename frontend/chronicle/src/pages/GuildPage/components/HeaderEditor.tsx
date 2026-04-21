import type { GuildPageTheme, GuildTag, SocialPlatform } from "@/api/typesGenerated";
import { GuildTags, SocialPlatforms } from "@/api/typesGenerated";
import { ICON_BASE_URL } from "@/config/iconUrl";
import { SOCIAL_PLATFORM_META } from "./GuildPageHeader";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

const ALLOWED_IMAGE_HOSTS = [
  "cdn.brandfetch.io",
  new URL(ICON_BASE_URL).hostname,
  "cdn.discordapp.com",
  "i.imgur.com",
  "avatars.githubusercontent.com",
];

function validateLogoUrl(url: string): string | null {
  if (!url) return null;
  if (!url.startsWith("https://")) return "Must use HTTPS";
  try {
    const parsed = new URL(url);
    if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
      return `Domain not allowed. Use: ${ALLOWED_IMAGE_HOSTS.join(", ")}`;
    }
  } catch {
    return "Invalid URL";
  }
  return null;
}

interface HeaderEditorProps {
  theme: GuildPageTheme;
  onChange: (theme: GuildPageTheme) => void;
}

export function HeaderEditor({ theme, onChange }: HeaderEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const logoError = useMemo(() => validateLogoUrl(theme.logo_url ?? ""), [theme.logo_url]);

  const tags = theme.tags ?? [];
  const socials: Partial<Record<SocialPlatform, string>> = theme.socials ?? {};

  const toggleTag = (tag: GuildTag) => {
    const newTags = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    onChange({ ...theme, tags: newTags });
  };

  const setSocial = (platform: SocialPlatform, url: string) => {
    onChange({ ...theme, socials: { ...socials, [platform]: url } as Record<SocialPlatform, string> });
  };

  return (
    <div className="border border-border rounded-lg bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>Page Header Settings</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">
          {/* Logo URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Logo URL</label>
            <input
              type="text"
              value={theme.logo_url ?? ""}
              onChange={(e) => onChange({ ...theme, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
              className={`w-full px-3 py-2 rounded-md border bg-background text-sm ${logoError ? "border-destructive" : "border-input"}`}
            />
            {logoError ? (
              <p className="text-xs text-destructive">{logoError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Must be HTTPS. Leave empty for default.</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Description</label>
              <span className="text-xs text-muted-foreground">
                {(theme.description ?? "").length} / 500
              </span>
            </div>
            <textarea
              value={theme.description ?? ""}
              onChange={(e) => onChange({ ...theme, description: e.target.value })}
              placeholder="Tell visitors about your guild..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-2">
              {GuildTags.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Select up to 10 tags</p>
          </div>

          {/* Socials */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Social Links</label>
            {SocialPlatforms.map((platform) => {
              const meta = SOCIAL_PLATFORM_META[platform];
              return (
                <div key={platform} className="flex items-center gap-2">
                  <span className="text-muted-foreground flex-shrink-0 w-5">{meta.icon}</span>
                  <input
                    type="text"
                    value={socials[platform] ?? ""}
                    onChange={(e) => setSocial(platform, e.target.value)}
                    placeholder={meta.placeholder}
                    className="flex-1 px-3 py-1.5 rounded-md border border-input bg-background text-sm"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
