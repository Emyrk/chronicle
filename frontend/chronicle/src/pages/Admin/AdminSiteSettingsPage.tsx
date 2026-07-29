import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSiteConfig, useUpdateSiteConfig } from "@/api/queries";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

function ExternalVerificationSection() {
  const { data: config } = useSiteConfig();
  const updateConfig = useUpdateSiteConfig();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [instructionsUrl, setInstructionsUrl] = useState("");

  const configured = !!config?.external_verification;

  const handleSave = (disable: boolean) => {
    updateConfig.mutate(
      {
        external_verification: disable
          ? { type: "zug-zug", url: "" }
          : {
              type: "zug-zug",
              url: url.trim(),
              // Blank secret preserves the stored one on the server.
              secret: secret.trim() || undefined,
              instructions_url: instructionsUrl.trim() || undefined,
            },
      },
      {
        onSuccess: () => {
          toast.success(disable ? "External verification disabled." : "External verification saved.");
          setEditing(false);
          setSecret("");
        },
        onError: () => toast.error("Failed to update external verification."),
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">External Verification (Zug Zug)</p>
          <p className="text-sm text-muted-foreground">
            Lets Discord-authenticated players link their verified characters via a community
            provider's API. {configured ? "Currently configured." : "Not configured."}
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={updateConfig.isPending}
                onClick={() => handleSave(true)}
              >
                Disable
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUrl("");
                setSecret("");
                setInstructionsUrl(config?.external_verification?.instructions_url ?? "");
                setEditing(true);
              }}
            >
              {configured ? "Edit" : "Configure"}
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="rounded-lg border p-3 space-y-2">
          <Input
            placeholder="Provider base URL, e.g. https://ambershire.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-8"
          />
          <Input
            type="password"
            placeholder={configured ? "Bearer secret (leave blank to keep current)" : "Bearer secret"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="new-password"
            className="h-8"
          />
          <Input
            placeholder="Instructions URL (optional, shown to players)"
            value={instructionsUrl}
            onChange={(e) => setInstructionsUrl(e.target.value)}
            className="h-8"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={updateConfig.isPending || !url.trim()} onClick={() => handleSave(false)}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
import { ThemeEditor } from "@/components/ThemeEditor/ThemeEditor";
import { LOG_FORMAT_OPTIONS } from "@/config/serverCapabilities";

export function AdminSiteSettingsPage() {
  const { data: config, isLoading } = useSiteConfig();
  const updateConfig = useUpdateSiteConfig();

  // Branding state — synced from server data.
  const [squareLogo, setSquareLogo] = useState("");
  const [logoWide, setLogoWide] = useState("");
  const [favicon, setFavicon] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [backgroundBanner, setBackgroundBanner] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [theme, setTheme] = useState<Record<string, string>>({});

  // Parse defaults state
  const [defaultFormat, setDefaultFormat] = useState("");
  const [availableFormats, setAvailableFormats] = useState<string[]>([]);

  // Sync all server-derived state when config loads.
  useEffect(() => {
    if (!config) return;
    setDefaultFormat(config.default_format ?? "");
    setAvailableFormats([...(config.available_formats ?? [])]);
    if (config.branding) {
      setSquareLogo(config.branding.square_logo ?? "");
      setLogoWide(config.branding.logo_wide ?? "");
      setFavicon(config.branding.favicon ?? "");
      setDisplayName(config.branding.display_name ?? "");
      setTagline(config.branding.tagline ?? "");
      setDescription(config.branding.description ?? "");
      setBackgroundBanner(config.branding.background_banner ?? "");
      setTags(config.branding.tags ? [...config.branding.tags] : []);
      setTheme(config.branding.theme ?? {});
    }
  }, [config]);

  const saveBranding = () => {
    const hasTheme = Object.keys(theme).length > 0;
    const hasBranding = squareLogo || logoWide || favicon || displayName || tagline || description || backgroundBanner || tags.length > 0 || hasTheme;
    updateConfig.mutate({
      branding: hasBranding
        ? {
            square_logo: squareLogo || undefined,
            logo_wide: logoWide || undefined,
            favicon: favicon || undefined,
            display_name: displayName || undefined,
            tagline: tagline || undefined,
            description: description || undefined,
            background_banner: backgroundBanner || undefined,
            tags: tags.length > 0 ? tags : undefined,
            theme: hasTheme ? theme : undefined,
          }
        : ({} as never), // empty object clears branding
    });
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground">Loading settings...</span>
        </div>
      </Card>
    );
  }

  const inputClass = "w-full rounded-md border bg-background px-3 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Site Settings</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Signups Enabled</p>
            <p className="text-sm text-muted-foreground">
              When disabled, new users cannot register via OAuth or email/password.
            </p>
          </div>
          <Button
            variant={config?.signups_enabled ? "default" : "destructive"}
            size="sm"
            disabled={updateConfig.isPending}
            onClick={() => {
              updateConfig.mutate({ signups_enabled: !config?.signups_enabled });
            }}
          >
            {updateConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : config?.signups_enabled ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Enabled
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                Disabled
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Discoverable</p>
            <p className="text-sm text-muted-foreground">
              When enabled, this deployment appears on chronicleclassic.com via the discovery API.
            </p>
          </div>
          <Button
            variant={config?.discoverable ? "default" : "outline"}
            size="sm"
            disabled={updateConfig.isPending}
            onClick={() => {
              updateConfig.mutate({ discoverable: !config?.discoverable });
            }}
          >
            {updateConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : config?.discoverable ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Enabled
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                Disabled
              </>
            )}
          </Button>
        </div>
        <ExternalVerificationSection />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Client Uploads</p>
            <p className="text-sm text-muted-foreground">
              When disabled, non-admin users cannot upload combat logs.
            </p>
          </div>
          <Button
            variant={config?.client_uploads_disabled ? "destructive" : "default"}
            size="sm"
            disabled={updateConfig.isPending}
            onClick={() => {
              updateConfig.mutate({ disable_client_upload: !config?.client_uploads_disabled });
            }}
          >
            {updateConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : config?.client_uploads_disabled ? (
              <>
                <X className="h-4 w-4 mr-1" />
                Disabled
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                Enabled
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Parse Defaults</h2>
        <p className="text-sm text-muted-foreground">
          Default log format and available formats for the primary domain. Tenant subdomains use their own settings.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Default format</label>
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">None (server default)</option>
              {LOG_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Available formats</label>
            <div className="flex flex-wrap gap-1.5">
              {LOG_FORMAT_OPTIONS.map((opt) => {
                const checked = availableFormats.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-mono cursor-pointer select-none transition-colors ${
                      checked
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background border-input text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setAvailableFormats(checked ? availableFormats.filter((f) => f !== opt.value) : [...availableFormats, opt.value])
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            {availableFormats.length === 0 && (
              <p className="text-[10px] text-muted-foreground">None selected — all formats available.</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          disabled={updateConfig.isPending}
          onClick={() => {
            updateConfig.mutate({
              default_format: defaultFormat || undefined,
              available_formats: availableFormats,
            });
          }}
        >
          {updateConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Parse Defaults"}
        </Button>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Primary Domain Branding</h2>
        <p className="text-sm text-muted-foreground">
          Visual identity for the main site. Tenant subdomains use their own branding.
        </p>
        <div className="space-y-2">
          <input className={inputClass} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className={inputClass} placeholder="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <input className={inputClass} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className={inputClass} placeholder="Square logo URL" value={squareLogo} onChange={(e) => setSquareLogo(e.target.value)} />
          <input className={inputClass} placeholder="Wide logo URL" value={logoWide} onChange={(e) => setLogoWide(e.target.value)} />
          <input className={inputClass} placeholder="Favicon URL" value={favicon} onChange={(e) => setFavicon(e.target.value)} />
          <input className={inputClass} placeholder="Background banner URL" value={backgroundBanner} onChange={(e) => setBackgroundBanner(e.target.value)} />
          <ThemeEditor value={theme} onChange={setTheme} />
          <TagPicker tags={tags} onChange={setTags} />
        </div>
        <Button size="sm" disabled={updateConfig.isPending} onClick={saveBranding}>
          {updateConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Branding"}
        </Button>
      </Card>
    </div>
  );
}

const BRANDING_TAGS = [
  { category: "Client", values: ["1.12", "2.4.3", "2.5.3", "3.3.5a"] },
  { category: "Version", values: ["Vanilla", "TBC", "Wrath"] },
  { category: "Style", values: ["Progression", "PvP"] },
  { category: "Extra", values: ["Custom Content"] },
  { category: "Core", values: ["Azeroth Core"] },
  { category: "Logging", values: ["Client Side", "Server Side"] },
];

function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const toggle = (tag: string) => {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Tags</p>
      {BRANDING_TAGS.map((group) => (
        <div key={group.category} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground w-14 shrink-0">{group.category}</span>
          {group.values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                tags.includes(v)
                  ? "border-primary/50 bg-primary/15 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
