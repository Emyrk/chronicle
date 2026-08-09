import type { GuildPageTheme, GuildTag, SocialPlatform } from "@/api/typesGenerated";
import { GuildTags, SocialPlatforms } from "@/api/typesGenerated";
import { ICON_BASE_URL } from "@/config/iconUrl";
import { SOCIAL_PLATFORM_META } from "./GuildPageHeader";
import { ChevronDown, Settings2 } from "lucide-react";
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
    <div
      className={`overflow-hidden rounded-lg border bg-card transition-colors ${
        expanded ? "border-primary/50" : "border-border hover:border-primary/40"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="page-header-settings"
        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          <Settings2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Page Header Settings</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Customize your logo, layout, description, tags, and social links
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-primary">
          {expanded ? "Close" : "Customize"}
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {expanded && (
        <div id="page-header-settings" className="px-4 pb-4 space-y-5 border-t border-border pt-4">
          {/* Layout */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Layout</label>
            <select
              value={
                theme.header_layout === "left" || theme.header_layout === "left_joined"
                  ? theme.header_layout
                  : "centered"
              }
              onChange={(e) => onChange({ ...theme, header_layout: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="centered">Centered</option>
              <option value="left">Left aligned</option>
              <option value="left_joined">Left aligned — joined</option>
            </select>
          </div>

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
