import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Blocks, CreditCard, HardDrive, LayoutTemplate, Download, Upload, Plus, BookOpenText, Save, Pencil, Trash, Share2, Copy, Eye, Laptop, Monitor, Smartphone, Menu, X, User, Swords, Star, LayoutPanelTop, BadgeCheck, Crown, Camera, RefreshCw, Lock, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useInstance,
  useMyCharacters,
  useMyCharacterCosmetics,
  useMyFavorites,
  useSession,
  useSetPrimaryCharacter,
  useUnlinkMyCharacter,
  useUpdateMyCharacterCosmetics,
  useExternalCharacterSync,
  useExternalSyncStatus,
  type LinkedCharacter,
  useUserPanelLayouts,
  useCreatePanelLayout,
  useDeletePanelLayout,
  useUpdatePanelLayout,
  useSharedLayout,
  useSharedLayoutByCode,
  useTrackLayout,
  useUntrackLayout,
  useUpdateLayoutDefaults,
  useUpdateActionBarSlots,
  useLogGroups,
  useSiteConfig,
  useAuthorizationCheck,
  type UserPanelLayout,
} from "@/api/queries";
import {
  useUpdateCharacterCosmeticsPreference,
  type CharacterCosmeticsDisplayMode,
  type SessionWithCharacterCosmetics,
} from "@/api/characterCosmetics";
import type { CreateUserPanelLayoutRequest, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles } from "@/api/typesGenerated";
import { COSMETIC_CSS, combineCosmetics, selectionFromAPI, selectionSummary, selectionToAPI, supporterTier, type CosmeticStyleSelection } from "@/components/ui/PlayerMetricChart/PlayerCosmetics";
import { CharacterCosmeticsEditor, MiniRow, TierBadge } from "@/features/characterCosmetics/CharacterCosmeticsEditor";
import type { PlayerRowCosmetic } from "@/components/ui/PlayerMetricChart/PlayerMetricChartModel";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { LayoutEditorCanvas } from "@/features/layoutEditor/LayoutEditorCanvas";
import { MAX_LAYOUT_PANELS, layoutDraftFromExport, layoutDraftToExport } from "@/features/layoutEditor/layoutDraft";
import { useLayoutDraft } from "@/features/layoutEditor/useLayoutDraft";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { DatasetProvider, useTenantDatasetScope } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { EventsPanel, type EventsPanelType } from "@/pages/Instance/EventsPanels";
import { isCustomPanelRef } from "@/pages/Instance/EventsPanels/custom/pluginTypes";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import { Strip } from "@/pages/Instance/EventsPanels/Strips/Strip";
import { resolveStripType } from "@/pages/Instance/EventsPanels/Strips/strips";
import type { StripType } from "@/pages/Instance/EventsPanels/Strips/types";
import type { PanelContext } from "@/pages/Instance/EventsPanels/types";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
import { resolveInstanceUnits, type ResolvedInstanceUnit } from "@/pages/Instance/instanceUnits";
import type { Instance } from "@/pages/Instance/InstancePage";
import { PanelTimingProvider } from "@/pages/Instance/EventsPanels/PanelTimingContext";
import { ChartDataRegistryProvider } from "@/pages/Instance/EventsPanels/ChartDataRegistry";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  ALTERNATE_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
  DEFAULT_INSTANCE_PANEL_OPTIONS,
  DEFAULT_INSTANCE_PANEL_FILTERS,
} from "@/pages/Instance/viewDefaults";
import { InstanceActionBar } from "@/components/InstanceActionBar/InstanceActionBar";
import { LAYOUT_ACTION_BAR_KEYS, type LayoutActionBarKey, type LayoutActionBarSlots } from "@/features/layoutBook/layoutBookStore";
import { fromActionBarResponse, toActionBarResponse } from "@/features/layoutBook/actionBarSlots";
import { showRequestErrorToast } from "@/lib/requestErrorToast";
import { LayoutMetadataFields } from "@/features/layoutBook/LayoutMetadataFields";
import { LAYOUT_TITLE_PATTERN } from "@/features/layoutBook/layoutMetadata";
import { buildLayoutSpellTooltip } from "@/features/layoutBook/buildLayoutSpellTooltip";
import { parseLayoutLab, parsePanelLayout, serializeLayoutLab } from "@/features/layoutBook/parseLayout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { getSpellIconUrl } from "@/api/wowdb";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { InferenceSettings } from "@/features/chat/InferenceSettings";
import { FavoritesList } from "@/components/Favorites";
import { PhotoProofCard, PhotoProofHistory } from "./Settings/PhotoProof";

export { BillingSettings } from "./Settings/BillingSettings";
export { CustomPanelSettings } from "./Settings/CustomPanelSettings";
export { SidekickSettings } from "./Settings/SidekickSettings";

const LAYOUT_LAB_INSTANCE_REFERENCE_STORAGE_KEY = "layout-lab.instance-reference";
const LAYOUT_LAB_RESIZE_HINT_DISMISSED_STORAGE_KEY = "layout-lab.resize-hint-dismissed";

function getStoredLayoutLabInstanceReference(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAYOUT_LAB_INSTANCE_REFERENCE_STORAGE_KEY) ?? "";
}

function setStoredLayoutLabInstanceReference(value: string) {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(LAYOUT_LAB_INSTANCE_REFERENCE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(LAYOUT_LAB_INSTANCE_REFERENCE_STORAGE_KEY, value);
}


function getStoredLayoutLabResizeHintDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LAYOUT_LAB_RESIZE_HINT_DISMISSED_STORAGE_KEY) === "1";
}

function setStoredLayoutLabResizeHintDismissed() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAYOUT_LAB_RESIZE_HINT_DISMISSED_STORAGE_KEY, "1");
}
// Color inputs need a hex value; mirrors the default --primary.

function createEmptyActionBarSlots(): LayoutActionBarSlots {
  return Object.fromEntries(LAYOUT_ACTION_BAR_KEYS.map((key) => [key, null])) as LayoutActionBarSlots;
}

type Tab = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const allTabs: Tab[] = [
  { path: "/account/settings", label: "Profile", icon: User },
  { path: "/account/characters", label: "Characters", icon: Swords },
  { path: "/account/billing", label: "Billing", icon: CreditCard },
  { path: "/account/storage", label: "Storage", icon: HardDrive },
  // { path: "/account/notifications", label: "Notifications", icon: Bell },
  // { path: "/account/privacy", label: "Privacy", icon: Shield },
  // { path: "/account/appearance", label: "Appearance", icon: Palette },
  { path: "/account/sidekick", label: "Sidekick", icon: Laptop },
  { path: "/account/custom-panels", label: "Custom panels", icon: Blocks },
  { path: "/account/layout-book", label: "Layout Book", icon: BookOpenText },
  { path: "/account/layout-lab", label: "Layout Lab", icon: LayoutTemplate },
];

export function AccountLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { data: siteConfig } = useSiteConfig();
  const tabs = allTabs.filter((tab) => {
    if (tab.path === "/account/storage" && siteConfig?.client_uploads_disabled) return false;
    if (tab.path === "/account/billing" && !siteConfig?.billing_enabled) return false;
    return true;
  });

  const renderNavLinks = (closeOnNavigate: boolean) => (
    <ul className="space-y-1">
      {tabs.map((tab) => (
        <li key={tab.path}>
          <Link
            to={tab.path}
            onClick={closeOnNavigate ? () => setMobileSidebarOpen(false) : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              location.pathname === tab.path
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  if (isMobile) {
    return (
      <div className="relative min-h-[calc(100vh-8rem)]">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close settings menu"
          />
        ) : null}

        <nav
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r bg-background p-4 shadow-xl transition-transform duration-200 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Settings</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Collapse settings menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {renderNavLinks(true)}
        </nav>

        <main className="p-4">
          <Button
            variant="outline"
            size="sm"
            className="mb-4 gap-2"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
            Open settings menu
          </Button>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <nav className="w-64 border-r p-4">
        <h1 className="text-lg font-semibold mb-4">Settings</h1>
        {renderNavLinks(false)}
      </nav>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

const CHARACTER_COSMETICS_OPTIONS: readonly {
  value: CharacterCosmeticsDisplayMode;
  label: string;
  description: string;
}[] = [
  {
    value: "enabled",
    label: "Enabled",
    description: "Show all character cosmetics, including animated names, backgrounds, and borders.",
  },
  {
    value: "limited",
    label: "Limited",
    description: "Show static cosmetics only. Animated and flashy effects are hidden.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Hide all character cosmetics and use the standard player-row appearance.",
  },
];

export function ProfileSettings() {
  const { data: baseSession } = useSession();
  const session = baseSession as SessionWithCharacterCosmetics | null | undefined;
  const updateCharacterCosmetics = useUpdateCharacterCosmeticsPreference();
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const characterCosmeticsMode = updateCharacterCosmetics.isPending
    ? updateCharacterCosmetics.variables
    : session?.preferences.character_cosmetics ?? "enabled";
  const isPasswordAuth = session?.auth_provider === "password";
  const email = session?.email;
  const emailVerified = session?.email_verified ?? false;

  const handleResendVerification = async () => {
    if (!email) return;
    setResending(true);
    setResendSuccess(false);
    try {
      const res = await fetch("/auth/password/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        toast.error("Please wait before requesting another verification email.");
      } else if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.message || "Failed to send verification email.";
        toast.error(message, {
          description: body?.detail ? (
            <span className="mt-1 block font-mono text-xs whitespace-pre-wrap break-all">{body.detail}</span>
          ) : undefined,
        });
      } else {
        setResendSuccess(true);
        toast.success("Verification email sent.");
      }
    } catch {
      toast.error("Failed to send verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Profile Settings</h2>
        <p className="text-muted-foreground">Manage your profile information.</p>
      </div>

      {email && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Email</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm">{email}</span>
            {isPasswordAuth && (
              emailVerified ? (
                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">
                  Unverified
                </span>
              )
            )}
          </div>
          {isPasswordAuth && !emailVerified && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={resending || resendSuccess}
                onClick={handleResendVerification}
              >
                {resending ? "Sending..." : resendSuccess ? "Email sent" : "Resend verification email"}
              </Button>
              <span className="text-xs text-muted-foreground">Check your inbox for a verification link.</span>
            </div>
          )}
        </div>
      )}

      {session?.auth_provider && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Sign-in Method</h3>
          <span className="text-sm capitalize">{session.auth_provider === "password" ? "Email & Password" : session.auth_provider}</span>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium">Character Cosmetics</h3>
          <p className="text-xs text-muted-foreground">
            Choose how supporter cosmetics appear on player rows in raid analysis.
          </p>
        </div>
        <div role="radiogroup" aria-label="Character cosmetics display mode" className="grid gap-2 sm:grid-cols-3">
          {CHARACTER_COSMETICS_OPTIONS.map((option) => {
            const selected = characterCosmeticsMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={updateCharacterCosmetics.isPending}
                onClick={() => updateCharacterCosmetics.mutate(option.value, {
                  onError: () => toast.error("Failed to update character cosmetics preference."),
                })}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <InferenceSettings />
    </div>
  );
}

const EXTERNAL_SYNC_THROTTLE_KEY = "characters.external-sync.last";
const EXTERNAL_SYNC_THROTTLE_MS = 5 * 60 * 1000;

function ExternalVerificationCard() {
  const { data: session } = useSession();
  const { data: siteConfig } = useSiteConfig();
  const syncMutation = useExternalCharacterSync();
  const { data: lastSync } = useExternalSyncStatus({ enabled: !!siteConfig?.external_verification });
  // Client-side throttle: checked in the click handler (localStorage), with
  // component state only to disable the button. The server enforces the
  // real rate limit.
  const [throttled, setThrottled] = useState(false);

  const provider = siteConfig?.external_verification;
  if (!provider) return null;

  const isDiscord = session?.auth_provider === "discord";

  const handleSync = () => {
    const at = Date.now();
    const last = Number(window.localStorage.getItem(EXTERNAL_SYNC_THROTTLE_KEY) ?? 0);
    const remaining = last + EXTERNAL_SYNC_THROTTLE_MS - at;
    if (remaining > 0) {
      setThrottled(true);
      window.setTimeout(() => setThrottled(false), remaining);
      toast.info("Synced recently — try again in a few minutes.");
      return;
    }
    window.localStorage.setItem(EXTERNAL_SYNC_THROTTLE_KEY, String(at));
    setThrottled(true);
    window.setTimeout(() => setThrottled(false), EXTERNAL_SYNC_THROTTLE_MS);
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.verified) {
          toast.info("You are not verified yet.", {
            description: provider.instructions_url
              ? "Follow the instructions link to get verified, then try again."
              : "Get verified with your community, then try again.",
          });
          return;
        }
        if (result.linked.length > 0) {
          toast.success(`Linked ${result.linked.length} character${result.linked.length === 1 ? "" : "s"}: ${result.linked.map((c) => c.name).join(", ")}`);
        } else if (result.conflicts.length === 0 && result.unmatched.length === 0) {
          toast.info("No characters to link.");
        }
        for (const name of result.conflicts) {
          toast.error(`${name} is already linked to another account. Ask for support in Discord.`);
        }
        if (result.unmatched.length > 0) {
          toast.warning(`Not seen in any logs yet: ${result.unmatched.join(", ")}`, {
            description: "These characters can be linked once they appear in an uploaded log.",
          });
        }
      },
      onError: (error) => showRequestErrorToast("Failed to sync characters", error),
    });
  };

  const providerName = provider.type === "zug-zug" ? 'the Guild "Zug Zug"' : null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <RefreshCw className="size-4 text-muted-foreground" />
        {providerName ? `Sync from ${providerName}` : "Sync from your community"}
      </h3>
      {provider.callout && (
        <p className="text-sm rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-500">
          {provider.callout}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Verified members can automatically link their characters using their Discord identity.
        {provider.instructions_url && (
          <>
            {" "}
            <a
              href={provider.instructions_url}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              How do I get verified?
            </a>
          </>
        )}
      </p>
      {!isDiscord ? (
        <p className="text-sm text-yellow-500">Must be authenticated with Discord to link characters.</p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={syncMutation.isPending || throttled}
          onClick={handleSync}
        >
          {syncMutation.isPending ? "Syncing..." : throttled ? "Synced recently — try again in a few minutes" : "Sync my characters"}
        </Button>
      )}

      {lastSync && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Last sync {new Date(lastSync.synced_at).toLocaleString()}
            {!lastSync.verified && " — not verified with the provider"}
          </p>
          {lastSync.unmatched.length > 0 && (
            <p className="text-xs text-yellow-500">
              Characters failed to link as they do not exist in Chronicle yet:{" "}
              {lastSync.unmatched.join(", ")}. They can be linked once they appear in an uploaded log.
            </p>
          )}
          {lastSync.conflicts.length > 0 && (
            <p className="text-xs text-destructive">
              Already linked to another account: {lastSync.conflicts.join(", ")}. Ask for support in Discord.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function linkSourceLabel(source: string): string {
  if (source === "manual") return "Linked by an administrator";
  if (source === "photo-proof") return "Linked with photo proof";
  if (source.startsWith("zug-zug/")) return 'Linked via the Guild "Zug Zug"';
  return "Linked";
}

const SECTION_ACCENTS = {
  linked: { border: "border-primary/30", header: "bg-primary/5" },
  favorites: { border: "border-amber-500/30", header: "bg-amber-500/5" },
};

function CharacterSection({ accent, icon: Icon, iconClassName, title, count, description, children }: {
  accent: keyof typeof SECTION_ACCENTS;
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  count?: number;
  description: string;
  children: ReactNode;
}) {
  const { border, header } = SECTION_ACCENTS[accent];
  return (
    <section className={cn("overflow-hidden rounded-xl border", border)}>
      <div className={cn("space-y-1 border-b px-5 py-4", border, header)}>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className={cn("size-5", iconClassName)} />
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
          )}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function LinkedVsFavoritesExplainer() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <BadgeCheck className="size-4 text-primary" />
          Linked characters
          <span className="text-xs font-normal text-muted-foreground">— characters you play</span>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Verified as yours. A character can only be linked to one account.</li>
          <li>Requires proof, such as a guild sync or a screenshot.</li>
          <li>Choose one as your primary character.</li>
        </ul>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <Star className="size-4 fill-amber-400 text-amber-400" />
          Favorites
          <span className="text-xs font-normal text-muted-foreground">— characters you follow</span>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Bookmarks to any character or guild, including other players'.</li>
          <li>No verification. Add one with the star on its armory or guild page.</li>
          <li>Private to you. Favoriting does not claim a character.</li>
        </ul>
      </div>
    </div>
  );
}

function LinkedCharacterRow({ character, cosmetic, cosmeticSummary, onCustomize, onSetPrimary, onUnlink, busy, customizeDisabled }: {
  character: LinkedCharacter;
  cosmetic: PlayerRowCosmetic;
  cosmeticSummary: string;
  onCustomize: () => void;
  onSetPrimary: () => void;
  onUnlink: () => void;
  busy: boolean;
  customizeDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <img
        src={`/c/icons/class_${character.class.toLowerCase()}.png`}
        alt=""
        className="size-9 shrink-0 rounded border border-border bg-muted"
      />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2">
          <Link
            to={`/armory/${encodeURIComponent(character.realm_name)}/${character.character_guid}`}
            className="truncate font-medium hover:underline"
            style={{ color: getClassColorVar(character.class) }}
          >
            {character.name}
          </Link>
          {character.is_primary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              <Crown className="size-3" />
              Primary
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {character.guild_name ? `<${character.guild_name}> · ` : ""}
          Level {character.level} {character.race} {character.class} · {character.realm_name}
        </p>
        <p className="truncate text-xs text-muted-foreground/70">
          {linkSourceLabel(character.link_source)} · {new Date(character.linked_at).toLocaleDateString()}
        </p>
        <button
          type="button"
          className="mt-2 block w-full max-w-sm rounded-md text-left disabled:cursor-default"
          disabled={customizeDisabled}
          onClick={onCustomize}
          title={`Customize ${character.name}`}
        >
          <MiniRow character={character} cosmetic={cosmetic} />
          <span className="mt-1 block truncate text-xs text-muted-foreground/70">Appearance · {cosmeticSummary}</span>
        </button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!character.is_primary && (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
            disabled={busy}
            onClick={onSetPrimary}
          >
            <Crown className="size-3.5" />
            Make Primary
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={customizeDisabled} onClick={onCustomize}>
          <Sparkles className="size-3.5" />
          Customize
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={onUnlink}
        >
          Unlink
        </Button>
      </div>
    </div>
  );
}

export function CharacterSettings() {
  const { data: siteConfig } = useSiteConfig();
  const photoProof = siteConfig?.tenant?.external_linking?.methods?.["photo-proof"];
  const { data: proofAccess, isLoading: proofAccessLoading, error: proofAccessError } = useAuthorizationCheck(
    { submit: `wow_tenant:${siteConfig?.tenant?.id ?? ""}#submit_photo_proof` },
    { enabled: !!photoProof?.enabled && !!siteConfig?.tenant?.id },
  );
  const { data: characters, isLoading } = useMyCharacters();
  const { data: cosmetics, isLoading: cosmeticsLoading } = useMyCharacterCosmetics();
  const favorites = useMyFavorites();
  const setPrimary = useSetPrimaryCharacter();
  const unlink = useUnlinkMyCharacter();
  const updateCosmetics = useUpdateMyCharacterCosmetics();
  const [editingLinkID, setEditingLinkID] = useState<string | null>(null);
  const sortedCharacters = useMemo(
    () => [...(characters ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    [characters],
  );
  const cosmeticsByLinkID = useMemo(
    () => new Map((cosmetics?.characters ?? []).map((entry) => [entry.link_id, entry])),
    [cosmetics?.characters],
  );
  const editingCharacter = sortedCharacters.find((character) => character.link_id === editingLinkID);
  const supporter = supporterTier(cosmetics?.catalog ?? [], cosmetics?.allowed_ids ?? []);
  const hasLinkMethod = !!siteConfig?.external_verification || !!photoProof?.enabled;
  const favoriteCount = (favorites.data?.guilds.length ?? 0) + (favorites.data?.players.length ?? 0);

  const handleSetPrimary = (character: LinkedCharacter) => {
    setPrimary.mutate(
      { realm_id: character.realm_id, character_guid: character.character_guid },
      {
        onSuccess: () => toast.success(`${character.name} is now your primary character.`),
        onError: (error) => showRequestErrorToast("Failed to set primary character", error),
      },
    );
  };

  const handleUnlink = (character: LinkedCharacter) => {
    if (!window.confirm(`Unlink ${character.name} from your account?`)) return;
    unlink.mutate(
      { realm_id: character.realm_id, character_guid: character.character_guid },
      {
        onSuccess: () => toast.success(`${character.name} has been unlinked.`),
        onError: (error) => showRequestErrorToast("Failed to unlink character", error),
      },
    );
  };

  const handleSaveCosmetics = (selection: CosmeticStyleSelection, applyToAll: boolean) => {
    if (!editingCharacter) return;
    updateCosmetics.mutate(
      {
        link_id: editingCharacter.link_id,
        selection: selectionToAPI(selection),
        apply_to_all: applyToAll,
      },
      {
        onSuccess: () => {
          toast.success(applyToAll ? "Appearance applied to all linked characters." : `${editingCharacter.name}'s appearance was updated.`);
          setEditingLinkID(null);
        },
        onError: (error) => showRequestErrorToast("Failed to update character appearance", error),
      },
    );
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            Characters
            {supporter !== "Free" && <TierBadge tier={supporter} />}
          </h2>
          <p className="text-muted-foreground">The characters you play, and the ones you keep an eye on.</p>
        </div>
        <LinkedVsFavoritesExplainer />
      </div>

      <CharacterSection
        accent="linked"
        icon={BadgeCheck}
        iconClassName="text-primary"
        title="Linked characters"
        count={characters?.length}
        description="Characters verified as yours."
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading characters...</p>
        ) : sortedCharacters.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {hasLinkMethod
              ? "No characters are linked to your account yet. Use one of the methods below to link them."
              : "Account linking is not supported for this server."}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            <style>{COSMETIC_CSS}</style>
            {sortedCharacters.map((character) => {
              const characterCosmetics = cosmeticsByLinkID.get(character.link_id);
              return (
                <LinkedCharacterRow
                  key={character.link_id}
                  character={character}
                  cosmetic={combineCosmetics(selectionFromAPI(characterCosmetics?.active))}
                  cosmeticSummary={selectionSummary(selectionFromAPI(characterCosmetics?.requested))}
                  busy={setPrimary.isPending || unlink.isPending}
                  customizeDisabled={cosmeticsLoading || !cosmetics}
                  onCustomize={() => setEditingLinkID(character.link_id)}
                  onSetPrimary={() => handleSetPrimary(character)}
                  onUnlink={() => handleUnlink(character)}
                />
              );
            })}
          </div>
        )}

        {hasLinkMethod && (
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-medium">Link more characters</h4>
            <ExternalVerificationCard />
            {photoProof?.enabled && (proofAccessLoading ? (
              <p className="text-sm text-muted-foreground">Checking photo proof access...</p>
            ) : proofAccess?.submit ? (
              <PhotoProofCard callout={photoProof.callout} />
            ) : (
              <div className={cn("rounded-lg border p-4 space-y-2", !proofAccessError && "border-destructive/40 bg-destructive/5")}>
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  {proofAccessError ? <Camera className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-destructive" />}
                  Link with photo proof
                </h3>
                {photoProof.callout && <p className="text-sm text-muted-foreground">{photoProof.callout}</p>}
                {proofAccessError
                  ? <p className="text-sm text-muted-foreground">Could not verify photo proof access. Please refresh the page or try again shortly.</p>
                  : <p className="text-sm text-destructive/90">You do not have permission to submit photo proof on this server, so this method is unavailable for your account.</p>}
              </div>
            ))}
          </div>
        )}
        <PhotoProofHistory />
      </CharacterSection>

      {editingCharacter && cosmetics && (
        <CharacterCosmeticsEditor
          key={editingCharacter.link_id}
          character={editingCharacter}
          cosmetics={cosmeticsByLinkID.get(editingCharacter.link_id)}
          catalog={cosmetics.catalog}
          allowedIDs={cosmetics.allowed_ids}
          open
          saving={updateCosmetics.isPending}
          onOpenChange={(open) => !open && setEditingLinkID(null)}
          onSave={handleSaveCosmetics}
        />
      )}

      <CharacterSection
        accent="favorites"
        icon={Star}
        iconClassName="fill-amber-400 text-amber-400"
        title="Favorites"
        count={favoriteCount}
        description="Quick links to characters and guilds you follow. These are not linked to your account."
      >
        <FavoritesList data={favorites.data} isLoading={favorites.isLoading} />
      </CharacterSection>
    </div>
  );
}

export function NotificationSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Notification Preferences</h2>
      <p className="text-muted-foreground">Configure how you receive notifications.</p>
    </div>
  );
}

export function PrivacySettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Privacy Settings</h2>
      <p className="text-muted-foreground">Control your privacy and data.</p>
    </div>
  );
}

export function AppearanceSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Appearance</h2>
      <p className="text-muted-foreground">Customize the look and feel.</p>
    </div>
  );
}

export function LayoutBookSettings() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: siteConfig } = useSiteConfig();
  useInstanceDefaultsCache(!!session?.user_id);
  const { data: layoutsResponse } = useUserPanelLayouts(session?.user_id ?? "");
  const createLayout = useCreatePanelLayout();
  const deleteLayout = useDeletePanelLayout();
  const untrackLayout = useUntrackLayout();
  const updateLayoutDefaults = useUpdateLayoutDefaults();
  const updateActionBarSlots = useUpdateActionBarSlots();

  const layouts = layoutsResponse?.layouts ?? [];
  const defaultDesktopLayoutID = layoutsResponse?.default_desktop_layout_id;
  const defaultMobileLayoutID = layoutsResponse?.default_mobile_layout_id;
  const [name, setName] = useState("");
  const [actionBarSlots, setActionBarSlots] = useState<LayoutActionBarSlots>(createEmptyActionBarSlots);
  const [layoutType, setLayoutType] = useState<"standard" | "alternate">("standard");

  useEffect(() => {
    setActionBarSlots(fromActionBarResponse(layoutsResponse?.action_bar_slots));
  }, [layoutsResponse?.action_bar_slots]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Layout name required");
      return;
    }
    if (!LAYOUT_TITLE_PATTERN.test(trimmed)) {
      toast.error("Title can only contain letters, numbers, spaces, hyphens, and underscores");
      return;
    }

    const items = layoutType === "alternate" ? ALTERNATE_INSTANCE_LAYOUT_ITEMS : DEFAULT_INSTANCE_LAYOUT_ITEMS;
    const orderedItems = [...items].sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.id.localeCompare(b.id));
    const panelTypesById = buildPanelTypesById(orderedItems, orderedItems.map((item) => DEFAULT_INSTANCE_PANEL_TYPES[item.id] ?? "empty"));

    try {
      await createLayout.mutateAsync({
        title: trimmed,
        icon: "INV_Misc_Book_09",
        description: "",
        payload: JSON.parse(serializeLayoutLab(orderedItems, panelTypesById, layoutType === "standard" ? DEFAULT_INSTANCE_PANEL_OPTIONS : undefined, layoutType === "standard" ? DEFAULT_INSTANCE_PANEL_FILTERS : undefined)),
      } as CreateUserPanelLayoutRequest);
      setName("");
      toast.success("Layout created", { description: trimmed });
    } catch (error) {
      showRequestErrorToast("Failed to create layout", error);
    }
  };

  const handleClone = async (layout: UserPanelLayout) => {
    try {
      await createLayout.mutateAsync({
        title: `Copy of ${layout.title}`,
        icon: layout.icon || "INV_Misc_Book_09",
        description: layout.description || "",
        payload: layout.payload,
      } as CreateUserPanelLayoutRequest);
      toast.success("Layout cloned", { description: layout.title });
    } catch (error) {
      showRequestErrorToast("Failed to clone layout", error);
    }
  };

  const handleToggleDefault = async (
    device: "desktop" | "mobile",
    layout: UserPanelLayout,
    isCurrentlyDefault: boolean,
  ) => {
    try {
      await updateLayoutDefaults.mutateAsync(
        device === "desktop"
          ? { default_desktop_layout_id: isCurrentlyDefault ? null : layout.id }
          : { default_mobile_layout_id: isCurrentlyDefault ? null : layout.id },
      );

      const actionLabel = isCurrentlyDefault ? "cleared" : "updated";
      toast.success(`${device === "desktop" ? "Desktop" : "Mobile"} default ${actionLabel}`, {
        description: layout.title,
      });
    } catch (error) {
      showRequestErrorToast(
        `Failed to ${isCurrentlyDefault ? "clear" : "set"} ${device} default`,
        error,
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Layout Book</h2>
        <p className="text-muted-foreground">Manage and edit your saved layouts.</p>
      </div>

      <div className="sticky top-3 z-20 space-y-3 rounded-lg border border-zinc-700/70 bg-background/95 p-4 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <h3 className="font-medium flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4" />
          Instance Action Bar
        </h3>
        <p className="text-sm text-muted-foreground">Assign layouts to hotkey slots (1-0). Click a slot to assign a layout. Middle click to empty a slot.</p>
        <InstanceActionBar
          slots={actionBarSlots}
          layouts={layouts}
          onAssign={(key: LayoutActionBarKey, layoutID: string | null) => {
            const nextSlots = {
              ...actionBarSlots,
              [key]: layoutID,
            };
            setActionBarSlots(nextSlots);
            void updateActionBarSlots.mutateAsync(toActionBarResponse(nextSlots)).catch((error) => {
              setActionBarSlots(actionBarSlots);
              showRequestErrorToast("Failed to update action bar slot", error);
            });
          }}
        />
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium flex items-center gap-2"><Save className="h-4 w-4" />Create layout</h3>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Layout name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-[240px] max-w-sm"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={layoutType}
            onChange={(event) => setLayoutType(event.target.value as "standard" | "alternate")}
          >
            <option value="standard">Standard</option>
            <option value="alternate">Alternate</option>
          </select>
          <Button onClick={() => void handleCreate()} disabled={createLayout.isPending}>Create</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-medium">Saved layouts ({layouts.length})</h3>
        </div>
        <div className="p-4">
          {layouts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved layouts yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {layouts.map((layout) => {
                const tooltipLayout = {
                  title: layout.title,
                  description: layout.description,
                  icon: layout.icon,
                };
                const isDesktopDefault = layout.id === defaultDesktopLayoutID;
                const isMobileDefault = layout.id === defaultMobileLayoutID;

                return (
                <div key={layout.id} className={`rounded-md border p-3 sm:p-4 ${layout.is_tracked ? "bg-secondary/15" : "bg-primary/10"}`}>
                  <div className="group flex w-full items-start gap-3 text-left rounded-md px-1.5 py-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="shrink-0">
                          <div className="h-12 w-12 rounded-sm border-2 border-amber-900/70 bg-amber-950/40 shadow-inner overflow-hidden">
                            <img
                              src={getSpellIconUrl(buildLayoutSpellTooltip(tooltipLayout).spell_icon)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="p-0 bg-transparent border-0" hideArrow>
                        <SpellTooltip spell={buildLayoutSpellTooltip(tooltipLayout)} />
                      </TooltipContent>
                    </Tooltip>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-lg leading-none font-medium text-amber-100 tracking-tight [text-shadow:0_1px_0_rgba(0,0,0,0.65)]">
                          {layout.title}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className={`h-8 w-8 border-2 transition-all ${
                              isDesktopDefault
                                ? "border-blue-400 bg-blue-500 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.55)] hover:brightness-110"
                                : "border-blue-400/70 bg-blue-500/15 text-blue-100 hover:border-blue-300 hover:bg-blue-500/30 hover:shadow-[0_0_0_1px_rgba(96,165,250,0.35)]"
                            }`}
                            title={isDesktopDefault ? "Clear desktop default" : "Set desktop default"}
                            onClick={() => void handleToggleDefault("desktop", layout, isDesktopDefault)}
                            disabled={updateLayoutDefaults.isPending}
                          >
                            <Monitor className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className={`h-8 w-8 border-2 transition-all ${
                              isMobileDefault
                                ? "border-green-400 bg-green-500 text-white shadow-[0_0_0_1px_rgba(74,222,128,0.55)] hover:brightness-110"
                                : "border-green-400/70 bg-green-500/15 text-green-100 hover:border-green-300 hover:bg-green-500/30 hover:shadow-[0_0_0_1px_rgba(74,222,128,0.35)]"
                            }`}
                            title={isMobileDefault ? "Clear mobile default" : "Set mobile default"}
                            onClick={() => void handleToggleDefault("mobile", layout, isMobileDefault)}
                            disabled={updateLayoutDefaults.isPending}
                          >
                            <Smartphone className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {(isDesktopDefault || isMobileDefault) ? (
                        <div className="-mt-1 flex flex-wrap items-center gap-1">
                          {isDesktopDefault ? (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                              <Monitor className="h-3 w-3" />
                              Desktop default
                            </span>
                          ) : null}
                          {isMobileDefault ? (
                            <span className="inline-flex items-center gap-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-300">
                              <Smartphone className="h-3 w-3" />
                              Mobile default
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {layout.description ? (
                        <div className="mt-1 text-sm text-zinc-100/90">{layout.description.slice(0, 120)}{layout.description.length > 120 ? "…" : ""}</div>
                      ) : null}
                      {!layout.is_tracked ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <div>Created by You</div>
                          {layout.tracker_count > 0 ? <div>Saved by {layout.tracker_count} other users</div> : null}
                        </div>
                      ) : null}
                      {layout.is_tracked ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <div>Created by {layout.owner_username ?? "Unknown user"}</div>
                          <div>Saved by {Math.max(0, layout.tracker_count - 1)} other users</div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-1.5">
                        {layout.is_tracked ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7"
                              title="Untrack layout"
                              onClick={async () => {
                                try {
                                  await untrackLayout.mutateAsync(layout.id);
                                  toast.success("Layout untracked", { description: layout.title });
                                } catch (error) {
                                  showRequestErrorToast("Failed to untrack layout", error);
                                }
                              }}
                              disabled={untrackLayout.isPending}
                            >
                              Untrack
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 border-cyan-400/60 bg-cyan-500/10 text-cyan-100 transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-500/30 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
                              title="View layout"
                              onClick={() => {
                                navigate(`/account/layout-lab?shared=${layout.id}`);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-7 w-7 transition-transform hover:animate-[delete-shake_220ms_ease-in-out]"
                              title="Delete layout"
                              onClick={async () => {
                                const trackerWarning = layout.tracker_count > 0
                                  ? `\n\n${layout.tracker_count} user${layout.tracker_count === 1 ? " is" : "s are"} tracking this layout. You will no longer be able to push updates to them.`
                                  : "";
                                const confirmed = window.confirm(`Delete layout "${layout.title}"? This cannot be undone.${trackerWarning}`);
                                if (!confirmed) return;
                                try {
                                  await deleteLayout.mutateAsync(layout.id);
                                  toast.success("Layout deleted", { description: layout.title });
                                } catch (error) {
                                  showRequestErrorToast("Failed to delete layout", error);
                                }
                              }}
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-500/25 hover:text-amber-100 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
                              title="Edit layout"
                              onClick={() => {
                                navigate(`/account/layout-lab?layoutId=${layout.id}`);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 border-violet-400/60 bg-violet-500/10 text-violet-100 transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-500/30 hover:shadow-[0_0_0_1px_rgba(192,132,252,0.35)]"
                          title="Clone layout"
                          onClick={() => void handleClone(layout)}
                          disabled={createLayout.isPending}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-500/25 hover:text-sky-100 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.35)]"
                          title="Share layout"
                          onClick={async () => {
                            // Mirrors the backend's LayoutShareURL: only use the
                            // short link domain when this deployment has one
                            // configured, otherwise fall back to a same-origin link.
                            const shortLinkDomain = cleanShortLinkDomain(siteConfig?.short_link_domain);
                            const shareURL = layout.code && shortLinkDomain
                              ? `https://${shortLinkDomain}/l/${layout.code}`
                              : `${window.location.origin}/account/layout-lab?shared=${layout.id}`;
                            await navigator.clipboard.writeText(shareURL);
                            toast.success("Share link copied", { description: layout.title });
                          }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// cleanShortLinkDomain strips any scheme prefix and trailing slash so the
// share URL can safely prepend https:// (mirrors cleanDomain in api/share.go).
function cleanShortLinkDomain(domain: string | undefined): string {
  if (!domain) return "";
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function parseSimpleParsedInstances(output: unknown): { id: string; name: string; slug?: string; encounters?: { start_time: string }[] }[] {
  if (!output || typeof output !== "object") return [];
  const maybeInstances = (output as { instances?: unknown }).instances;
  if (!Array.isArray(maybeInstances)) return [];

  return maybeInstances.filter((inst): inst is { id: string; name: string; slug?: string; encounters?: { start_time: string }[] } => {
    if (!inst || typeof inst !== "object") return false;
    const row = inst as { id?: unknown; name?: unknown; encounters?: unknown };
    return typeof row.id === "string" && typeof row.name === "string" && (!row.encounters || Array.isArray(row.encounters));
  });
}

function normalizeInstanceReference(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/instances/")) {
    return `${window.location.origin}${trimmed}`;
  }

  const instanceIdMatch = trimmed.match(/^[a-zA-Z0-9_-]+$/);
  if (instanceIdMatch) {
    return `${window.location.origin}/instances/${trimmed}`;
  }

  return "";
}

function extractInstanceId(reference: string): string | null {
  try {
    const parsed = new URL(reference);
    const match = parsed.pathname.match(/^\/instances\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getUnitName(guidStr: string, units: Record<string, ResolvedInstanceUnit>): string {
  const unit = units[guidStr];
  if (unit) return unit.name;
  return `Enemy ${guidStr}`;
}

function transformToInstance(
  apiInstance: {
    id: string;
    name: string;
    realm_name?: string;
    guild?: { id: string; name: string };
    encounters: readonly WoWEncounterWithHostiles[];
    players: Record<string, InstancePlayer>;
    units: Record<string, InstanceUnit>;
    names_by_entry?: Record<number, string>;
    summons_by_owner?: Record<string, readonly string[]>;
  },
): Instance {
  const players = apiInstance.players;
  const units = resolveInstanceUnits(
    apiInstance.units,
    apiInstance.names_by_entry,
    apiInstance.summons_by_owner,
  );

  const encounters = apiInstance.encounters.map((enc) => ({
    id: enc.id,
    name: enc.name,
    boss: enc.boss,
    mapId: enc.map_id,
    kill_type: enc.kill_type,
    start_time: enc.start_time,
    end_time: enc.end_time,
    enemies: enc.hostiles.map((hostile) => ({
      id: String(hostile.id),
      name: getUnitName(String(hostile.id), units),
      boss: hostile.boss,
      damageTaken: 0,
      damageDone: 0,
      periods: hostile.periods,
    })),
    remaining: enc.remaining as string[] | undefined,
  }));

  const sortedEncounters = [...apiInstance.encounters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return {
    id: apiInstance.id,
    name: apiInstance.name,
    realm: apiInstance.realm_name,
    guild: apiInstance.guild,
    startTime: sortedEncounters[0]?.start_time || new Date().toISOString(),
    endTime: sortedEncounters[sortedEncounters.length - 1]?.end_time,
    encounters,
    players,
    units,
    capabilities: [],
  };
}

function LivePanelTile({
  item,
  panelType,
  panelOption,
  context,
  durationMs,
  onPanelTypeChange,
  onStripTypeChange,
  onPanelOptionChange,
  seedFilters,
  seedFiltersVersion,
  onFiltersChange,
}: {
  item: GridEditorItem;
  panelType: EventsPanelType;
  panelOption: string | null;
  context: PanelContext;
  durationMs: number;
  onPanelTypeChange: (next: EventsPanelType) => void;
  onStripTypeChange: (next: StripType) => void;
  onPanelOptionChange: (option: string | null) => void;
  seedFilters?: PanelFilter[];
  seedFiltersVersion?: number;
  onFiltersChange?: (filters: PanelFilter[]) => void;
}) {
  const stripType = item.kind === "strip" ? resolveStripType(item.stripType) : null;
  if (stripType) {
    return (
      <Strip
        stripType={stripType}
        orientation={item.orientation ?? "horizontal"}
        durationMs={durationMs}
        context={context}
        stripIndex={Number(item.id.replace("strip-", "")) - 1}
        stripId={item.id}
        onStripTypeChange={onStripTypeChange}
        panelOption={panelOption}
        onPanelOptionChange={onPanelOptionChange}
        seedFilters={seedFilters}
        seedFiltersVersion={seedFiltersVersion}
        onFiltersChange={onFiltersChange}
      />
    );
  }

  return (
    <EventsPanel
      panelType={panelType}
      onPanelTypeChange={onPanelTypeChange}
      durationMs={durationMs}
      context={context}
      panelOption={panelOption}
      onPanelOptionChange={onPanelOptionChange}
      panelIndex={Number(item.id.replace("panel-", "")) - 1}
      panelId={item.id}
      showHints={false}
      seedFilters={seedFilters}
      seedFiltersVersion={seedFiltersVersion}
      onFiltersChange={onFiltersChange}
    />
  );
}

function buildPanelTypesById(items: GridEditorItem[], panels: EventsPanelType[]): Record<string, EventsPanelType> {
  const next: Record<string, EventsPanelType> = {};
  items.forEach((item, idx) => {
    const type = panels[idx] ?? "empty";
    next[item.id] = type in PANELS || isCustomPanelRef(type) ? type : "empty";
  });
  return next;
}

export function LayoutLabSettings() {
  const tenantDatasetScope = useTenantDatasetScope();

  return (
    <DatasetProvider
      datasetId={tenantDatasetScope.datasetId}
      iconBaseUrl={tenantDatasetScope.iconBaseUrl}
    >
      <LayoutLabSettingsContent />
    </DatasetProvider>
  );
}

function LayoutLabSettingsContent() {
  const [searchParams] = useSearchParams();
  const editingLayoutID = searchParams.get("layoutId");
  const sharedLayoutID = searchParams.get("shared");
  const sharedLayoutCode = searchParams.get("shared_code");
  const isSharedMode = !!sharedLayoutID || !!sharedLayoutCode;
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user_id;
  const { data: layoutsResponse } = useUserPanelLayouts(session?.user_id ?? "");
  const {
    data: sharedLayoutByID,
    isLoading: isSharedLayoutByIDLoading,
    error: sharedLayoutByIDError,
  } = useSharedLayout(sharedLayoutID ?? "", { enabled: !!sharedLayoutID });
  const {
    data: sharedLayoutByCode,
    isLoading: isSharedLayoutByCodeLoading,
    error: sharedLayoutByCodeError,
  } = useSharedLayoutByCode(sharedLayoutCode ?? "", { enabled: !!sharedLayoutCode });
  const updateLayout = useUpdatePanelLayout();
  const createLayout = useCreatePanelLayout();
  const trackLayout = useTrackLayout();
  const untrackLayout = useUntrackLayout();

  const editingLayout = useMemo(
    () => layoutsResponse?.layouts.find((layout) => layout.id === editingLayoutID) ?? null,
    [layoutsResponse?.layouts, editingLayoutID],
  );
  const sharedLayout = sharedLayoutByID ?? sharedLayoutByCode ?? null;
  const activeLayout = isSharedMode ? sharedLayout : editingLayout;
  const readOnly = isSharedMode;
  const isActiveLayoutOwnedByCurrentUser = activeLayout?.owner_id === session?.user_id;
  const activeLayoutOtherTrackerCount = Math.max(0, (activeLayout?.tracker_count ?? 0) - (activeLayout?.is_tracked ? 1 : 0));


  const [metaTitle, setMetaTitle] = useState("Layout");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaIcon, setMetaIcon] = useState("INV_Misc_Book_09");

  const layoutDraft = useLayoutDraft(() => ({
    items: DEFAULT_INSTANCE_LAYOUT_ITEMS,
    panelTypesById: DEFAULT_INSTANCE_PANEL_TYPES,
    panelOptionsById: {},
    panelFiltersById: {},
    appearance: {},
  }));
  const { items, appearance } = layoutDraft.draft;
  const resetLayoutDraft = layoutDraft.reset;
  const [instanceReferenceInput, setInstanceReferenceInput] = useState<string>(() => getStoredLayoutLabInstanceReference());
  const [instanceReference, setInstanceReference] = useState<string>(() => normalizeInstanceReference(getStoredLayoutLabInstanceReference()));
  const [hasDismissedResizeHint, setHasDismissedResizeHint] = useState<boolean>(() => getStoredLayoutLabResizeHintDismissed());
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const panelItemCount = layoutDraft.panelCount;

  const normalizedReference = useMemo(
    () => normalizeInstanceReference(instanceReferenceInput),
    [instanceReferenceInput],
  );

  const instanceId = useMemo(() => extractInstanceId(instanceReference), [instanceReference]);

  const { data: logGroups } = useLogGroups();

  const recentRaidReferences = useMemo(() => {
    if (!logGroups) return [] as { id: string; name: string; startTime: Date | null; reference: string }[];

    const allInstances = logGroups.flatMap((log) => {
      return parseSimpleParsedInstances(log.processing_output).map((inst) => {
        const firstEncounter = inst.encounters?.[0];
        const startTime = firstEncounter?.start_time ? new Date(firstEncounter.start_time) : null;
        return {
          id: inst.id,
          name: inst.name,
          startTime,
          reference: `${window.location.origin}/instances/${inst.slug || inst.id}`,
        };
      });
    });

    const unique = new Map<string, { id: string; name: string; startTime: Date | null; reference: string }>();
    for (const inst of allInstances) {
      const existing = unique.get(inst.id);
      if (!existing) {
        unique.set(inst.id, inst);
        continue;
      }

      const existingTime = existing.startTime?.getTime() ?? 0;
      const nextTime = inst.startTime?.getTime() ?? 0;
      if (nextTime > existingTime) {
        unique.set(inst.id, inst);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => (b.startTime?.getTime() ?? 0) - (a.startTime?.getTime() ?? 0))
      .slice(0, 6);
  }, [logGroups]);

  const { data: apiInstance, isLoading, error } = useInstance(instanceId ?? "", {
    enabled: !!instanceId,
  });

  const instance = useMemo(() => {
    if (!apiInstance) return null;
    return transformToInstance(apiInstance);
  }, [apiInstance]);

  const selectedEncounterIds = useMemo(() => {
    if (!instance) return [];
    return instance.encounters.map((encounter) => encounter.id);
  }, [instance]);

  const durationMs = useMemo(() => {
    if (!instance) return 1;
    return Math.max(
      1,
      instance.encounters.reduce((total, encounter) => {
        const start = new Date(encounter.start_time).getTime();
        const end = new Date(encounter.end_time).getTime();
        return total + Math.max(0, end - start);
      }, 0),
    );
  }, [instance]);

  const context = useMemo<PanelContext | null>(() => {
    if (!instance) return null;
    return {
      renderMode: "layout_lab",
      instance,
      selectedEncounterIds,
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
    };
  }, [instance, selectedEncounterIds]);

  useEffect(() => {
    if (!activeLayout) return;
    const parsed = parsePanelLayout(activeLayout);
    queueMicrotask(() => {
      resetLayoutDraft(layoutDraftFromExport(parsed));
      setMetaTitle(activeLayout.title);
      setMetaDescription(activeLayout.description ?? "");
      setMetaIcon(activeLayout.icon || "INV_Misc_Book_09");
    });
  }, [activeLayout, resetLayoutDraft]);

  const handleSave = async () => {
    if (!editingLayout) {
      toast.error("Open a layout from Layout Book to edit.");
      return;
    }

    const trimmedTitle = metaTitle.trim();
    if (trimmedTitle && !LAYOUT_TITLE_PATTERN.test(trimmedTitle)) {
      toast.error("Title can only contain letters, numbers, spaces, hyphens, and underscores");
      return;
    }

    try {
      await updateLayout.mutateAsync({
        layoutID: editingLayout.id,
        title: trimmedTitle || editingLayout.title,
        description: metaDescription,
        icon: metaIcon,
        payload: layoutDraftToExport(layoutDraft.draft),
      } as never);
      toast.success("Layout saved", { description: trimmedTitle || editingLayout.title });
    } catch (error) {
      showRequestErrorToast("Failed to save layout", error);
    }
  };

  const handleTrack = async () => {
    if (!activeLayout) return;

    try {
      if (activeLayout.is_tracked) {
        await untrackLayout.mutateAsync(activeLayout.id);
        toast.success("Layout untracked", { description: activeLayout.title });
      } else {
        await trackLayout.mutateAsync(activeLayout.id);
        toast.success("Layout tracked", { description: activeLayout.title });
      }
    } catch (error) {
      showRequestErrorToast(activeLayout.is_tracked ? "Failed to untrack layout" : "Failed to track layout", error);
    }
  };

  const handleSaveCopy = async () => {
    if (!activeLayout) return;

    try {
      await createLayout.mutateAsync({
        title: `Copy of ${activeLayout.title}`,
        icon: activeLayout.icon || "INV_Misc_Book_09",
        description: activeLayout.description || "",
        payload: activeLayout.payload,
      } as CreateUserPanelLayoutRequest);
      toast.success("Layout copied", { description: activeLayout.title });
    } catch (error) {
      showRequestErrorToast("Failed to save a copy", error);
    }
  };


  const handleAddPanel = () => {
    if (readOnly) return;
    if (layoutDraft.addPanel()) toast.success("Panel added below");
  };

  const handleAddStrip = () => {
    if (readOnly) return;
    if (layoutDraft.addStrip()) toast.success("Strip added below");
  };

  const handleAddGroup = () => {
    if (readOnly) return;
    layoutDraft.addGroup();
    toast.success("Group row added below");
  };


  const handleResizeStop = () => {
    if (hasDismissedResizeHint) return;
    setHasDismissedResizeHint(true);
    setStoredLayoutLabResizeHintDismissed();
  };

  const handleExport = async () => {
    const serialized = JSON.stringify(layoutDraftToExport(layoutDraft.draft), null, 2);
    await navigator.clipboard.writeText(serialized);
    toast.success("Layout copied to clipboard");
  };

  const handleImport = () => {
    if (readOnly) return;
    try {
      const parsed = parseLayoutLab(importText);
      layoutDraft.reset(layoutDraftFromExport(parsed));
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid layout JSON");
    }
  };

  const renderLayoutTile = (item: GridEditorItem) => (
    <LivePanelTile
      item={item}
      panelType={layoutDraft.draft.panelTypesById[item.id] ?? "damage_done"}
      panelOption={layoutDraft.draft.panelOptionsById[item.id] ?? null}
      context={context!}
      durationMs={durationMs}
      onPanelTypeChange={(next) => !readOnly && layoutDraft.setPanelType(item.id, next)}
      onStripTypeChange={(next) => !readOnly && layoutDraft.setStripType(item.id, next)}
      onPanelOptionChange={(option) => !readOnly && layoutDraft.setPanelOption(item.id, option)}
      seedFilters={layoutDraft.seedFiltersById[item.id]}
      seedFiltersVersion={layoutDraft.seedFiltersVersion}
      onFiltersChange={(filters) => layoutDraft.setPanelFilters(item.id, filters)}
    />
  );


  if (!session?.user_id && !isSharedMode) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">You must be logged in to view this</p>
      </div>
    );
  }

  if (!editingLayoutID && !sharedLayoutID && !sharedLayoutCode) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">
          Select a layout from your <Link to="/account/layout-book" className="text-primary underline">Layout Book</Link> to begin editing.
        </p>
      </div>
    );
  }

  const isSharedLayoutLoading = isSharedLayoutByIDLoading || isSharedLayoutByCodeLoading;
  const sharedLayoutError = sharedLayoutByIDError ?? sharedLayoutByCodeError;

  if (isSharedMode && isSharedLayoutLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">Loading shared layout…</p>
      </div>
    );
  }

  if (isSharedMode && !activeLayout && sharedLayoutError) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">This shared layout link is invalid or no longer available.</p>
      </div>
    );
  }

  if (!activeLayout) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">
          Layout not found. Go to <Link to="/account/layout-book" className="text-primary underline">Layout Book</Link> and select a layout.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">
          Prototype custom panel layouts with a 12-column grid (minimum panel width: 4 columns) and render
          live EventsPanels directly in each tile.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Metadata</h3>
        <LayoutMetadataFields
          title={metaTitle}
          onTitleChange={setMetaTitle}
          description={metaDescription}
          onDescriptionChange={setMetaDescription}
          icon={metaIcon}
          onIconChange={setMetaIcon}
          readOnly={readOnly}
          descriptionFooter={readOnly && !isActiveLayoutOwnedByCurrentUser ? (
            <div className="text-xs text-muted-foreground">
              <div>Created by {activeLayout.owner_username ?? "Unknown user"}</div>
              <div>Saved by {activeLayoutOtherTrackerCount} other users</div>
            </div>
          ) : null}
        />

        <div className="space-y-3 border-t border-border/60 pt-3">
          <div>
            <h3 className="text-sm font-medium">Panel layout</h3>
            <p className="text-xs text-muted-foreground">Choose how panels and strips connect in this layout.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { value: false, label: "Cards", description: "Spaced with rounded corners" },
              { value: true, label: "Seamless", description: "Joined with sharp edges" },
            ] as const).map((option) => {
              const selected = (appearance.seamless === true) === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={selected}
                  onClick={() => layoutDraft.setAppearance((previous) => ({
                    ...previous,
                    seamless: option.value ? true : undefined,
                  }))}
                  className={cn(
                    "flex items-center gap-3 border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-80",
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                    option.value ? "rounded-sm" : "rounded-lg",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-11 shrink-0 grid-cols-2 border border-border bg-background",
                      option.value ? "gap-0 rounded-none" : "gap-1 rounded-md p-1",
                    )}
                    aria-hidden="true"
                  >
                    {[0, 1, 2, 3].map((cell) => (
                      <span
                        key={cell}
                        className={cn(
                          "bg-muted-foreground/40",
                          option.value ? "border border-background/60" : "rounded-[2px]",
                        )}
                      />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {readOnly ? (
              <>
                <Button
                  type="button"
                  variant={activeLayout.is_tracked ? "destructive" : "default"}
                  onClick={() => void handleTrack()}
                  className="gap-1.5"
                  disabled={trackLayout.isPending || untrackLayout.isPending || !isLoggedIn}
                >
                  {activeLayout.is_tracked ? "Remove from Book" : "Save to Book"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSaveCopy()}
                  className="gap-1.5"
                  disabled={createLayout.isPending || !isLoggedIn}
                >
                  <Copy className="h-4 w-4" />
                  Save a Copy
                </Button>
                <span className="text-xs text-muted-foreground">
                  {!isLoggedIn ? "Must be logged in to save" : "Viewing shared layout"}
                </span>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  className="gap-1.5"
                  disabled={updateLayout.isPending || !isLoggedIn}
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <span className="text-xs text-muted-foreground">
                  {!isLoggedIn ? "Must be logged in to save" : `Editing: ${activeLayout.title}`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {isMobile ? (
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Layout Labs is only available on desktop.</p>
        </div>
      ) : (
      <div className="rounded-lg border p-3 space-y-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {!instanceId ? (
              <>
                <Input
                  id="instance-reference"
                  className="min-w-[280px] flex-1"
                  placeholder="Reference instance URL or ID"
                  value={instanceReferenceInput}
                  onChange={(event) => setInstanceReferenceInput(event.target.value)}
                />
                <Button
                  type="button"
                  onClick={() => {
                    setInstanceReference(normalizedReference);
                    setStoredLayoutLabInstanceReference(instanceReferenceInput.trim());
                  }}
                  disabled={!normalizedReference}
                >
                  Apply reference
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">Using reference: {instanceId}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInstanceReference("");
                    setInstanceReferenceInput(instanceReference);
                  }}
                >
                  Change reference
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddPanel}
                  className="gap-1.5"
                  disabled={readOnly || panelItemCount >= MAX_LAYOUT_PANELS}
                >
                  <Plus className="h-4 w-4" />
                  Add panel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddStrip}
                  className="gap-1.5"
                  disabled={readOnly || panelItemCount >= MAX_LAYOUT_PANELS}
                >
                  <Plus className="h-4 w-4" />
                  Add strip
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddGroup}
                  className="gap-1.5"
                >
                  <LayoutPanelTop className="h-4 w-4" />
                  Add group row
                </Button>
                <span className="text-xs text-muted-foreground">Panels: {panelItemCount} / {MAX_LAYOUT_PANELS}</span>
              </div>
            ) : <div />}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleExport}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!activeLayout) return;
                    if (!window.confirm("Reset layout to the last saved state? This will discard unsaved changes in Layout Lab.")) {
                      return;
                    }
                    const parsed = parsePanelLayout(activeLayout);
                    layoutDraft.reset(layoutDraftFromExport(parsed));
                  }}
                >
                  Reset layout
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {!readOnly ? (
          <details className="rounded-md border border-border/70 bg-muted/20">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium hover:bg-muted/40">
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-4 w-4" />
                Import layout JSON
              </span>
            </summary>
            <div className="space-y-2 border-t border-border/70 p-3">
              <textarea
                id="layout-import"
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder='{"version":1,"items":[],"panelTypesById":{}}'
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button type="button" onClick={handleImport} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
                {importError && <span className="text-sm text-destructive">{importError}</span>}
              </div>
            </div>
          </details>
        ) : null}

        {!instanceId ? (
          <div className="space-y-4 p-6 text-sm text-muted-foreground">
            <div>Add an instance URL above to load live panel data. Or click a recent raid below to use that.</div>
            {recentRaidReferences.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">Recent raids</div>
                <div className="flex flex-wrap gap-2">
                  {recentRaidReferences.map((raid) => (
                    <Button
                      key={raid.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInstanceReferenceInput(raid.reference);
                        setInstanceReference(raid.reference);
                        setStoredLayoutLabInstanceReference(raid.reference);
                      }}
                    >
                      {raid.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading instance data…</div>
        ) : error || !instance || !context ? (
          <div className="flex items-center gap-3 p-6">
            <span className="text-sm text-destructive">Failed to load the referenced instance.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInstanceReference("")}
            >
              Change reference
            </Button>
          </div>
        ) : (
          <InstanceEventsProvider instanceId={instance.id}>
            <PanelTimingProvider panelCount={items.filter((item) => item.kind !== "group").length}>
            <ChartDataRegistryProvider>
              <LayoutEditorCanvas
                controller={layoutDraft}
                renderTile={renderLayoutTile}
                readOnly={readOnly}
                pulseFirstResizeHandle={!readOnly && !hasDismissedResizeHint}
                onResizeStop={handleResizeStop}
              />
            </ChartDataRegistryProvider>
            </PanelTimingProvider>
          </InstanceEventsProvider>
        )}
      </div>
      )}
    </div>
  );
}


export { StorageSettings } from "./Settings/StorageSettings";
