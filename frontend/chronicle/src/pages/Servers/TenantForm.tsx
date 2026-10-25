import { useState } from "react";
import { TENANT_AD_DISABLE_OPTIONS } from "@/components/Ads/adPolicy";
import { Button } from "@/components/ui/button";
import { useUpsertTenant, useFlavors } from "@/api/queries";
import { LOG_FORMAT_OPTIONS } from "@/config/serverCapabilities";
import { Loader2 } from "lucide-react";
import type { Tenant } from "@/api/typesGenerated";
import { ThemeEditor } from "@/components/ThemeEditor/ThemeEditor";

export function TenantForm({ tenant, onDone }: { tenant?: Tenant; onDone: () => void }) {
  const upsertTenant = useUpsertTenant();
  const [name, setName] = useState(tenant?.name ?? "");
  const [slug, setSlug] = useState(tenant?.slug ?? "");
  const [includeInAll, setIncludeInAll] = useState(tenant?.include_in_all ?? true);
  const [disableUpload, setDisableUpload] = useState(tenant?.disable_client_upload ?? false);
  const [discoverable, setDiscoverable] = useState(tenant?.discoverable ?? false);
  const [adsEnabled, setAdsEnabled] = useState(tenant?.ads_enabled ?? false);
  const [disabledAds, setDisabledAds] = useState<string[]>([...(tenant?.disabled_ads ?? [])]);

  // Parse mode (spec / class / disabled)
  const [parseMode, setParseMode] = useState(tenant?.parse_config?.cohort_mode || "spec");

  // Parse-axis defaults
  const [defaultFormat, setDefaultFormat] = useState(tenant?.default_format ?? "");
  const [availableFormats, setAvailableFormats] = useState<string[]>([...(tenant?.available_formats ?? [])]);
  const [additionalFlavor, setAdditionalFlavor] = useState<string[]>([...(tenant?.additional_flavor ?? [])]);
  const { data: allFlavors = [] } = useFlavors();

  // Each character linking method has independent visibility and callout.
  const [zugZugEnabled, setZugZugEnabled] = useState(tenant?.external_linking?.methods?.["zug-zug"]?.enabled ?? false);
  const [zugZugCallout, setZugZugCallout] = useState(tenant?.external_linking?.methods?.["zug-zug"]?.callout ?? "");
  const [photoProofEnabled, setPhotoProofEnabled] = useState(tenant?.external_linking?.methods?.["photo-proof"]?.enabled ?? false);
  const [photoProofCallout, setPhotoProofCallout] = useState(tenant?.external_linking?.methods?.["photo-proof"]?.callout ?? "");

  // Branding fields
  const [squareLogo, setSquareLogo] = useState(tenant?.branding?.square_logo ?? "");
  const [logoWide, setLogoWide] = useState(tenant?.branding?.logo_wide ?? "");
  const [favicon, setFavicon] = useState(tenant?.branding?.favicon ?? "");
  const [displayName, setDisplayName] = useState(tenant?.branding?.display_name ?? "");
  const [tagline, setTagline] = useState(tenant?.branding?.tagline ?? "");
  const [description, setDescription] = useState(tenant?.branding?.description ?? "");
  const [backgroundBanner, setBackgroundBanner] = useState(tenant?.branding?.background_banner ?? "");
  const [tags, setTags] = useState<string[]>(tenant?.branding?.tags ? [...tenant.branding.tags] : []);
  const [theme, setTheme] = useState<Record<string, string>>(tenant?.branding?.theme ?? {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasTheme = Object.keys(theme).length > 0;
    const hasBranding = squareLogo || logoWide || favicon || displayName || tagline || description || backgroundBanner || tags.length > 0 || hasTheme;
    upsertTenant.mutate(
      {
        id: tenant?.id ?? "",
        name,
        slug: slug || null,
        include_in_all: includeInAll,
        disable_client_upload: disableUpload,
        discoverable,
        ads_enabled: adsEnabled,
        disabled_ads: disabledAds,
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
              theme: Object.keys(theme).length > 0 ? theme : undefined,
            }
          : null,
        // Spread so parse settings this form does not edit (lookback, metrics) survive.
        parse_config: { ...tenant?.parse_config, cohort_mode: parseMode || undefined },
        default_format: defaultFormat || null,
        available_formats: availableFormats,
        additional_flavor: additionalFlavor,
        external_linking: {
          methods: {
            "zug-zug": { enabled: zugZugEnabled, callout: zugZugCallout.trim() || undefined },
            "photo-proof": { enabled: photoProofEnabled, callout: photoProofCallout.trim() || undefined },
          },
        },
      },
      { onSuccess: onDone },
    );
  };

  const inputClass = "w-full rounded-md border bg-background px-3 py-1.5 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border p-3">
      <input className={inputClass} placeholder="Tenant name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className={inputClass}
        placeholder="Slug (optional, e.g. epoch)"
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeInAll} onChange={(e) => setIncludeInAll(e.target.checked)} />
        Include in root domain listing
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={disableUpload} onChange={(e) => setDisableUpload(e.target.checked)} />
        Disable client uploads
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
        Discoverable (appear on chronicleclassic.com)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={adsEnabled} onChange={(e) => setAdsEnabled(e.target.checked)} />
        Enable ads
        <span className="text-xs text-muted-foreground">(requires deployment configuration)</span>
      </label>
      <fieldset className="ml-6 space-y-1" disabled={!adsEnabled}>
        <legend className="text-xs font-medium text-muted-foreground">Disable ad groups</legend>
        {TENANT_AD_DISABLE_OPTIONS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={disabledAds.includes(key)}
              onChange={(e) =>
                setDisabledAds((current) =>
                  e.target.checked ? [...current, key] : current.filter((disabled) => disabled !== key),
                )
              }
            />
            {label}
          </label>
        ))}
        <p className="text-[10px] text-muted-foreground">
          Opt-outs are retained while ads are disabled and apply when ads are turned back on.
        </p>
      </fieldset>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Parses</p>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Parse mode</label>
          <select
            value={parseMode}
            onChange={(e) => setParseMode(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="spec">By spec (default)</option>
            <option value="class">By class</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="text-[10px] text-muted-foreground">
            {parseMode === "spec" && "Players are ranked against others of the same class+spec."}
            {parseMode === "class" && "Players are ranked against others of the same class (any spec)."}
            {parseMode === "disabled" && "Parse scoring is turned off — no snapshots will be created."}
          </p>
        </div>
      </div>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Parse Defaults</p>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Default format</label>
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
          <label className="block text-xs text-muted-foreground">Available formats</label>
          <div className="flex flex-wrap gap-1.5">
            {LOG_FORMAT_OPTIONS.map((opt) => {
              const checked = availableFormats.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono cursor-pointer select-none ${
                    checked ? "bg-primary/10 border-primary text-primary" : "border-input text-muted-foreground hover:border-foreground/30"
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
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Additional flavors</label>
          <div className="flex flex-wrap gap-1.5">
            {allFlavors.map((flavor) => {
              const checked = additionalFlavor.includes(flavor);
              return (
                <label
                  key={flavor}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono cursor-pointer select-none ${
                    checked ? "bg-primary/10 border-primary text-primary" : "border-input text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() =>
                      setAdditionalFlavor(checked ? additionalFlavor.filter((tag) => tag !== flavor) : [...additionalFlavor, flavor])
                    }
                  />
                  {flavor}
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Added to the selected dataset&apos;s default flavor for new and reprocessed logs.
          </p>
        </div>
      </div>
      <div className="pt-2 border-t space-y-3">
        <p className="text-xs font-medium text-muted-foreground">External Character Linking</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={zugZugEnabled} onChange={(e) => setZugZugEnabled(e.target.checked)} />
            Zug Zug verification
          </label>
          <input
            className={inputClass}
            aria-label="Zug Zug linking callout"
            placeholder="Zug Zug callout (optional)"
            value={zugZugCallout}
            onChange={(e) => setZugZugCallout(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            Only shown when the deployment has a Zug Zug verification provider configured.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={photoProofEnabled} onChange={(e) => setPhotoProofEnabled(e.target.checked)} />
            Photo proof
          </label>
          <input
            className={inputClass}
            aria-label="Photo proof linking callout"
            placeholder="Photo proof callout (optional)"
            value={photoProofCallout}
            onChange={(e) => setPhotoProofCallout(e.target.value)}
          />
        </div>
      </div>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Branding</p>
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
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={upsertTenant.isPending}>
          {upsertTenant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tenant ? "Save" : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {upsertTenant.isError && <p className="text-sm text-destructive">{upsertTenant.error.message}</p>}
    </form>
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
