import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ICON_LIST_URL } from "@/config/iconUrl";
import { toast } from "sonner";
import { HardDrive, Clock, LayoutTemplate, Download, Upload, Plus, Trash2, BookOpenText, Save, Pencil, Trash, Share2, ChevronLeft, ChevronRight, Copy, Eye, Monitor, Smartphone, Menu, X, User, Swords, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useInstance,
  useMyCharacters,
  useMyStorage,
  useSession,
  useSetPrimaryCharacter,
  useUnlinkMyCharacter,
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
  type ActionBarSlotsResponse,
  type UserPanelLayout,
  type RequestError,
} from "@/api/queries";
import type { CreateUserPanelLayoutRequest, DataGrant, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles } from "@/api/typesGenerated";
import { GridLayoutEditor, type GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { EventsPanel, type EventsPanelType } from "@/pages/Instance/EventsPanels";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import type { PanelContext } from "@/pages/Instance/EventsPanels/types";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
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
import { buildLayoutSpellTooltip } from "@/features/layoutBook/buildLayoutSpellTooltip";
import { parseLayoutLab, parsePanelLayout, serializeLayoutLab } from "@/features/layoutBook/parseLayout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { getSpellIconUrl } from "@/api/wowdb";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";

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
const ICON_PAGE_SIZE = 24;
const MAX_PANELS = 8;
const LAYOUT_TITLE_PATTERN = /^[A-Za-z0-9_\-\s]+$/;

function createEmptyActionBarSlots(): LayoutActionBarSlots {
  return Object.fromEntries(LAYOUT_ACTION_BAR_KEYS.map((key) => [key, null])) as LayoutActionBarSlots;
}

function fromActionBarResponse(slots: ActionBarSlotsResponse | null | undefined): LayoutActionBarSlots {
  return {
    "1": slots?.slot_1 ?? null,
    "2": slots?.slot_2 ?? null,
    "3": slots?.slot_3 ?? null,
    "4": slots?.slot_4 ?? null,
    "5": slots?.slot_5 ?? null,
    "6": slots?.slot_6 ?? null,
    "7": slots?.slot_7 ?? null,
    "8": slots?.slot_8 ?? null,
    "9": slots?.slot_9 ?? null,
    "0": slots?.slot_0 ?? null,
  };
}

function toActionBarResponse(slots: LayoutActionBarSlots): ActionBarSlotsResponse {
  return {
    slot_1: slots["1"],
    slot_2: slots["2"],
    slot_3: slots["3"],
    slot_4: slots["4"],
    slot_5: slots["5"],
    slot_6: slots["6"],
    slot_7: slots["7"],
    slot_8: slots["8"],
    slot_9: slots["9"],
    slot_0: slots["0"],
  };
}

function showRequestErrorToast(fallbackMessage: string, error: unknown) {
  const requestError = error as RequestError;
  const message = requestError?.message || fallbackMessage;
  const detail = requestError?.detail;

  toast.error(message, {
    description: detail ? (
      <span className="mt-1 block font-mono text-xs whitespace-pre-wrap break-all">
        {detail}
      </span>
    ) : undefined,
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatExpirationDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  if (diffDays <= 30) return `Expires in ${Math.ceil(diffDays / 7)} weeks`;
  
  return `Expires ${date.toLocaleDateString()}`;
}

type Tab = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const allTabs: Tab[] = [
  { path: "/account/settings", label: "Profile", icon: User },
  { path: "/account/characters", label: "Characters", icon: Swords },
  { path: "/account/storage", label: "Storage", icon: HardDrive },
  // { path: "/account/notifications", label: "Notifications", icon: Bell },
  // { path: "/account/privacy", label: "Privacy", icon: Shield },
  // { path: "/account/appearance", label: "Appearance", icon: Palette },
  { path: "/account/layout-book", label: "Layout Book", icon: BookOpenText },
  { path: "/account/layout-lab", label: "Layout Lab", icon: LayoutTemplate },
];

export function AccountLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { data: siteConfig } = useSiteConfig();
  const tabs = siteConfig?.client_uploads_disabled
    ? allTabs.filter((t) => t.path !== "/account/storage")
    : allTabs;

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

export function ProfileSettings() {
  const { data: session } = useSession();
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

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
      <h3 className="text-sm font-medium">
        {providerName ? `Link characters via ${providerName}` : "Link characters"}
      </h3>
      {providerName && (
        <p className="text-sm text-muted-foreground">Character linking is provided by {providerName}.</p>
      )}
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

export function CharacterSettings() {
  const { data: characters, isLoading } = useMyCharacters();
  const setPrimary = useSetPrimaryCharacter();
  const unlink = useUnlinkMyCharacter();

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Characters</h2>
        <p className="text-muted-foreground">In-game characters linked to your account.</p>
      </div>

      <ExternalVerificationCard />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading characters...</p>
      ) : !characters || characters.length === 0 ? (
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            No characters are linked to your account yet. Character linking is currently managed
            by site administrators.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {characters.map((character) => (
            <div
              key={`${character.realm_id}-${character.character_guid}`}
              className="rounded-lg border p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/armory/${encodeURIComponent(character.realm_name)}/${character.character_guid}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: getClassColorVar(character.class) }}
                  >
                    {character.name}
                  </Link>
                  {character.is_primary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">
                      <Star className="h-3 w-3" />
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Level {character.level} {character.race} {character.class}
                  {" · "}
                  {character.realm_name}
                  {character.guild_name ? ` · <${character.guild_name}>` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!character.is_primary && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setPrimary.isPending}
                    onClick={() => handleSetPrimary(character)}
                  >
                    Set as primary
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={unlink.isPending}
                  onClick={() => handleUnlink(character)}
                >
                  Unlink
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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

function getUnitName(guidStr: string, units: Record<string, InstanceUnit>): string {
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
  },
): Instance {
  const { players, units } = apiInstance;

  const encounters = apiInstance.encounters.map((enc) => ({
    id: enc.id,
    name: enc.name,
    boss: enc.boss,
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
  onPanelOptionChange: (option: string | null) => void;
  seedFilters?: PanelFilter[];
  seedFiltersVersion?: number;
  onFiltersChange?: (filters: PanelFilter[]) => void;
}) {
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
    next[item.id] = type in PANELS ? type : "empty";
  });
  return next;
}

export function LayoutLabSettings() {
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
  const [iconSearch, setIconSearch] = useState("");
  const [iconPage, setIconPage] = useState(0);
  const [metaIcon, setMetaIcon] = useState("INV_Misc_Book_09");
  const [iconOptions, setIconOptions] = useState<string[]>([]);

  const [items, setItems] = useState<GridEditorItem[]>(DEFAULT_INSTANCE_LAYOUT_ITEMS);
  const [panelTypesById, setPanelTypesById] = useState<Record<string, EventsPanelType>>(DEFAULT_INSTANCE_PANEL_TYPES);
  const [panelOptionsById, setPanelOptionsById] = useState<Record<string, string | null>>({});
  const [panelFiltersById, setPanelFiltersById] = useState<Record<string, PanelFilter[]>>({});
  // Separate seed state: only set on load/import, not from live editing feedback.
  const [seedFiltersById, setSeedFiltersById] = useState<Record<string, PanelFilter[]>>({});
  const [seedFiltersVersion, setSeedFiltersVersion] = useState(0);
  const [instanceReferenceInput, setInstanceReferenceInput] = useState<string>(() => getStoredLayoutLabInstanceReference());
  const [instanceReference, setInstanceReference] = useState<string>(() => normalizeInstanceReference(getStoredLayoutLabInstanceReference()));
  const [hasDismissedResizeHint, setHasDismissedResizeHint] = useState<boolean>(() => getStoredLayoutLabResizeHintDismissed());
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const filteredIcons = useMemo(() => {
    const source = iconOptions.length > 0 ? iconOptions : [metaIcon];
    const q = iconSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((icon) => icon.toLowerCase().includes(q));
  }, [iconOptions, metaIcon, iconSearch]);

  const iconPageCount = Math.max(1, Math.ceil(filteredIcons.length / ICON_PAGE_SIZE));

  const currentIconPage = Math.min(iconPage, iconPageCount - 1);

  const pagedIcons = useMemo(() => {
    const start = currentIconPage * ICON_PAGE_SIZE;
    return filteredIcons.slice(start, start + ICON_PAGE_SIZE);
  }, [filteredIcons, currentIconPage]);

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
    void fetch(ICON_LIST_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setIconOptions(data.filter((v): v is string => typeof v === "string"));
          return;
        }
        if (data && typeof data === "object" && "names" in data) {
          const names = (data as { names?: unknown }).names;
          if (Array.isArray(names)) {
            setIconOptions(names.filter((v): v is string => typeof v === "string"));
            return;
          }
        }
        setIconOptions([]);
      })
      .catch(() => setIconOptions([]));
  }, []);

  useEffect(() => {
    if (!activeLayout) return;
    const parsed = parsePanelLayout(activeLayout);
    queueMicrotask(() => {
      setItems(parsed.items);
      setPanelTypesById(parsed.panelTypesById);
      setPanelOptionsById(Object.fromEntries(
        Object.entries(parsed.panelOptionsById ?? {}).map(([itemId, value]) => [itemId, value ?? null]),
      ));
      setPanelFiltersById(parsed.panelFiltersById ?? {});
      setSeedFiltersById(parsed.panelFiltersById ?? {});
      setSeedFiltersVersion((v) => v + 1);
      setMetaTitle(activeLayout.title);
      setMetaDescription(activeLayout.description ?? "");
      setMetaIcon(activeLayout.icon || "INV_Misc_Book_09");
    });
  }, [activeLayout]);

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
        payload: JSON.parse(serializeLayoutLab(items, panelTypesById, panelOptionsById, panelFiltersById)),
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


  const handlePanelTypeChange = (itemId: string, nextType: EventsPanelType) => {
    if (readOnly) return;
    setPanelTypesById((prev) => ({ ...prev, [itemId]: nextType }));
    setPanelOptionsById((prev) => ({ ...prev, [itemId]: null }));
    // Set the new panel type's default filters (or clear stale ones).
    const newPanel = PANELS[nextType as keyof typeof PANELS];
    const defaults = newPanel?.defaultFilters;
    setPanelFiltersById((prev) => {
      if (defaults && defaults.length > 0) {
        return { ...prev, [itemId]: defaults };
      }
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              title: PANELS[nextType]?.label ?? item.title,
            }
          : item,
      ),
    );
  };

  const handleRemovePanel = (itemId: string) => {
    if (readOnly) return;
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setPanelTypesById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setPanelFiltersById((prev) => { const { [itemId]: _, ...rest } = prev; return rest; });
    setPanelOptionsById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleAddPanel = () => {
    if (readOnly) return;
    if (items.length >= MAX_PANELS) return;
    const nextIndex = items.reduce((max, item) => {
      const match = item.id.match(/^panel-(\d+)$/);
      const n = match ? Number(match[1]) : 0;
      return Math.max(max, n);
    }, 0) + 1;

    const maxY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const newId = `panel-${nextIndex}`;
    const newType: EventsPanelType = "damage_done";

    setItems((prev) => [
      ...prev,
      {
        id: newId,
        title: PANELS[newType].label,
        x: 0,
        y: maxY,
        w: 6,
        h: 4,
        minW: 4,
        minH: 4,
      },
    ]);
    setPanelTypesById((prev) => ({ ...prev, [newId]: newType }));
    setPanelOptionsById((prev) => ({ ...prev, [newId]: null }));
  };

  const handlePanelOptionChange = (itemId: string, option: string | null) => {
    if (readOnly) return;
    setPanelOptionsById((prev) => ({ ...prev, [itemId]: option }));
  };

  const handleResizeStop = () => {
    if (hasDismissedResizeHint) return;
    setHasDismissedResizeHint(true);
    setStoredLayoutLabResizeHintDismissed();
  };

  const handleExport = async () => {
    const serialized = serializeLayoutLab(items, panelTypesById, panelOptionsById, panelFiltersById);
    await navigator.clipboard.writeText(serialized);
    toast.success("Layout copied to clipboard");
  };

  const handleImport = () => {
    if (readOnly) return;
    try {
      const parsed = parseLayoutLab(importText);
      setItems(parsed.items);
      setPanelTypesById(parsed.panelTypesById);
      setPanelOptionsById(Object.fromEntries(
        Object.entries(parsed.panelOptionsById ?? {}).map(([itemId, value]) => [itemId, value ?? null]),
      ));
      setPanelFiltersById(parsed.panelFiltersById ?? {});
      setSeedFiltersById(parsed.panelFiltersById ?? {});
      setSeedFiltersVersion((v) => v + 1);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid layout JSON");
    }
  };

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
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Title</label>
          <div className="flex items-center gap-2">
            <img
              src={getSpellIconUrl({ ID: 1, TextureFilename: metaIcon || "INV_Misc_Book_09" })}
              alt=""
              className="h-8 w-8 rounded border border-border"
            />
            <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Layout title" disabled={readOnly} />
          </div>
          {metaTitle && !LAYOUT_TITLE_PATTERN.test(metaTitle) ? (
            <p className="text-xs text-destructive">Title can only contain letters, numbers, spaces, hyphens, and underscores</p>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2 items-start">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              className="min-h-[223px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Describe what this layout is for"
              disabled={readOnly}
              maxLength={500}
            />
            {!readOnly ? <div className="text-right text-xs text-muted-foreground">{metaDescription.length}/500</div> : null}

            {readOnly && !isActiveLayoutOwnedByCurrentUser ? (
              <div className="text-xs text-muted-foreground">
                <div>Created by {activeLayout.owner_username ?? "Unknown user"}</div>
                <div>Saved by {activeLayoutOtherTrackerCount} other users</div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
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

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Icon</label>
            <div className="space-y-2 rounded-md border border-border/70 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={iconSearch}
                  onChange={(e) => {
                    setIconSearch(e.target.value);
                    setIconPage(0);
                  }}
                  placeholder="Search icons (e.g. INV_Misc_Book_09)"
                  className="min-w-[260px] flex-1"
                  disabled={readOnly}
                />
                <div className="text-xs text-muted-foreground">
                  {filteredIcons.length} icons • Page {currentIconPage + 1}/{iconPageCount}
                </div>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {pagedIcons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon}
                    onClick={() => setMetaIcon(icon)}
                    disabled={readOnly}
                    className={`h-9 w-9 rounded border p-0.5 ${metaIcon === icon ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}
                  >
                    <img src={getSpellIconUrl({ ID: 1, TextureFilename: icon })} alt="" className="h-full w-full rounded object-cover" />
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIconPage(Math.max(0, currentIconPage - 1))}
                  disabled={currentIconPage === 0 || readOnly}
                  className="gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">Selected: {metaIcon}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIconPage(Math.min(iconPageCount - 1, currentIconPage + 1))}
                  disabled={currentIconPage >= iconPageCount - 1 || readOnly}
                  className="gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
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
                  disabled={readOnly || items.length >= MAX_PANELS}
                >
                  <Plus className="h-4 w-4" />
                  Add panel
                </Button>
                <span className="text-xs text-muted-foreground">Panels: {items.length} / {MAX_PANELS}</span>
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
                    setItems(parsed.items);
                    setPanelTypesById(parsed.panelTypesById);
                    setPanelOptionsById(Object.fromEntries(
                      Object.entries(parsed.panelOptionsById ?? {}).map(([itemId, value]) => [itemId, value ?? null]),
                    ));
                    setPanelFiltersById(parsed.panelFiltersById ?? {});
                    setSeedFiltersById(parsed.panelFiltersById ?? {});
                    setSeedFiltersVersion((v) => v + 1);
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
          <div className="p-6 text-sm text-destructive">Failed to load the referenced instance.</div>
        ) : (
          <InstanceEventsProvider instanceId={instance.id}>
            <PanelTimingProvider panelCount={items.length}>
            <ChartDataRegistryProvider>
              <GridLayoutEditor
                cols={12}
                rowHeight={96}
                items={items}
                onItemsChange={setItems}
                showItemHeader={false}
                editable={!readOnly}
                pulseFirstResizeHandle={!readOnly && !hasDismissedResizeHint}
                onResizeStop={handleResizeStop}
                renderItem={(item) => {
                  const panelType = panelTypesById[item.id] ?? "damage_done";
                  return (
                    <div className="group relative h-full">
                      <LivePanelTile
                        item={item}
                        panelType={panelType}
                        panelOption={panelOptionsById[item.id] ?? null}
                        context={context}
                        durationMs={durationMs}
                        onPanelTypeChange={(next) => handlePanelTypeChange(item.id, next)}
                        onPanelOptionChange={(option) => handlePanelOptionChange(item.id, option)}
                        seedFilters={seedFiltersById[item.id]}
                        seedFiltersVersion={seedFiltersVersion}
                        onFiltersChange={(filters) => {
                          setPanelFiltersById((prev) => {
                            if (filters.length === 0) {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            }
                            return { ...prev, [item.id]: filters };
                          });
                        }}
                      />

                      {!readOnly ? (
                        <>
                          <div className="pointer-events-none absolute inset-0 z-20 rounded-md bg-background/20 opacity-0 transition-opacity group-hover:opacity-100" />
                          <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="pointer-events-auto h-8 px-2"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleRemovePanel(item.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                }}
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

const SOURCE_LABELS: Record<string, string> = {
  base: "Base Allocation",
  support: "Supporter Bonus",
  "alpha-tester": "Alpha Tester Reward",
  "beta-tester": "Beta Tester Reward",
  promotion: "Promotional Bonus",
};

function formatSource(source: string): string {
  return SOURCE_LABELS[source] || source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StorageSettings() {
  const { data: storage, isLoading } = useMyStorage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">Loading storage information...</p>
      </div>
    );
  }

  if (!storage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">Unable to load storage information.</p>
      </div>
    );
  }

  const usagePercent = storage.max_storage_bytes > 0
    ? (storage.consumed_storage_bytes / storage.max_storage_bytes) * 100
    : 0;

  const getProgressColor = () => {
    if (usagePercent >= 95) return "bg-red-500";
    if (usagePercent >= 80) return "bg-yellow-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">View your storage usage and grants.</p>
      </div>

      {/* Storage Usage Bar */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Storage Used</span>
          <span className="text-sm text-muted-foreground">
            {formatBytes(storage.consumed_storage_bytes)} of {formatBytes(storage.max_storage_bytes)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full transition-all ${getProgressColor()}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        {usagePercent >= 80 && (
          <p className={`text-sm ${usagePercent >= 95 ? "text-red-500" : "text-yellow-500"}`}>
            {usagePercent >= 95
              ? "You've nearly reached your storage limit. Delete some logs to free up space."
              : "You're approaching your storage limit."}
          </p>
        )}
      </div>

      {/* Storage Grants */}
      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-medium">Storage Grants</h3>
          <p className="text-sm text-muted-foreground">
            Your total storage is the sum of all active grants below.
          </p>
        </div>
        <div className="divide-y">
          {storage.grants.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No storage grants found.</div>
          ) : (
            storage.grants.map((grant: DataGrant) => {
              const isExpired = grant.expires_at && new Date(grant.expires_at) < new Date();
              const isExpiringSoon = grant.expires_at && !isExpired && 
                new Date(grant.expires_at).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000;
              
              return (
                <div key={grant.id} className={`p-4 flex justify-between items-center ${isExpired ? "opacity-50" : ""}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatSource(grant.source)}</span>
                      {grant.expires_at && (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                          isExpired 
                            ? "bg-destructive/15 text-destructive" 
                            : isExpiringSoon 
                              ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          <Clock className="h-3 w-3" />
                          {formatExpirationDate(grant.expires_at)}
                        </span>
                      )}
                    </div>
                    {grant.description && (
                      <div className="text-sm text-muted-foreground">{grant.description}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatBytes(grant.storage_bytes)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(grant.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
