import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Settings, Upload, LogOut, FileText, Shield, Key, Menu, Database, Server, Sparkles, Crown, ChevronDown, Compass, Star } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { uploadsDisabledForSite, useAuthorizationCheck, useMarkWhatsNewRead, useMyFavorites, useSiteConfig, useWhatsNewStatus } from "@/api/queries"
import type { Branding } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { FavoritesMenu } from "../Favorites"
import { WhatsNewDialog } from "../WhatsNew/WhatsNewDialog"
import { RootCommunityNavButton } from "../RootCommunityContext/RootCommunityContext"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/DropdownMenu/DropdownMenu"
import { SearchPalette, SearchTrigger } from "./GlobalSearch/GlobalSearch"
import { useSearchHotkey } from "./GlobalSearch/useGlobalSearch"
import { guildHref, playerHref } from "./GlobalSearch/globalSearch"
import { allNavLinks, isActiveLink, navGroups, type NavGroup } from "./navItems"

type AccountItem = {
  title: string
  icon: LucideIcon
  indicator?: boolean
  /** Gold supporter styling, so the item reads as an invitation rather than a setting. */
  highlight?: boolean
} & ({ href: string; external?: boolean } | { onClick: () => void })

const HIGHLIGHT_CLASS = "font-medium text-[#f0c060] hover:text-[#ffd580] focus:text-[#ffd580]"

function useNavBarState(searchEnabled: boolean) {
  const location = useLocation()
  const { session, isAuthenticated, isLoading, logout } = useAuth()
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  useSearchHotkey(openSearch, searchEnabled)

  const { data: siteConfig } = useSiteConfig()
  const tenantID = siteConfig?.tenant?.id
  // Check admin permissions via SpiceDB
  const authzChecks = useMemo(() => ({
    admin: "chronicle:chronicle#admin_users",
    proofReviewer: tenantID ? `wow_tenant:${tenantID}#review_photo_proof` : "chronicle:chronicle#review_photo_proof",
    adminAuthz: "chronicle:chronicle#administer_authz",
    adminWorldData: "chronicle:chronicle#admin_world_data",
    manageConsumables: "chronicle:chronicle#admin_consumables",
    canAdminSomeServer: "lookup:wow_server#administer",
    adminServers: "chronicle:chronicle#admin_servers",
    adminLogs: "chronicle:chronicle#admin_logs",
  }), [tenantID])
  const { data: authz } = useAuthorizationCheck(authzChecks, { enabled: isAuthenticated })
  const isAdmin = authz?.admin ?? false
  const canReviewProofs = !!(authz?.proofReviewer || (!tenantID && authz?.admin))
  const canAdminWorldData = authz?.adminWorldData ?? false
  const canManageServers = (authz?.canAdminSomeServer ?? false) || (authz?.adminServers ?? false)
  const hasAdminLogs = authz?.adminLogs ?? false

  const userID = session?.user_id ?? ""
  const whatsNewStatus = useWhatsNewStatus(userID, isAuthenticated)
  const { mutate: markWhatsNewRead, isPending: markingWhatsNewRead } = useMarkWhatsNewRead(userID)
  const hasUnreadWhatsNew = whatsNewStatus.data?.has_unread ?? false
  const { data: favorites } = useMyFavorites({ enabled: isAuthenticated })
  const hasFavorites = !!favorites && (favorites.guilds.length > 0 || favorites.players.length > 0)
  const uploadsEnabled = !uploadsDisabledForSite(siteConfig) || hasAdminLogs

  useEffect(() => {
    if (whatsNewOpen && hasUnreadWhatsNew && !markingWhatsNewRead) markWhatsNewRead()
  }, [hasUnreadWhatsNew, markWhatsNewRead, markingWhatsNewRead, whatsNewOpen])

  const accountItems: AccountItem[] = [
    ...(uploadsEnabled ? [{ title: "My Logs", href: "/logs", icon: FileText }, { title: "Upload", href: "/upload", icon: Upload }] : []),
    { title: "Settings", href: "/account/settings", icon: Settings },
    { title: "What's New", onClick: () => setWhatsNewOpen(true), icon: Sparkles, indicator: hasUnreadWhatsNew },
    // Only invite accounts without a supporter tier.
    ...(siteConfig?.billing_enabled && !session?.ads_free ? [{ title: "Supporter Perks", href: "/supporter", icon: Crown, highlight: true }] : []),
  ]
  const adminItems: AccountItem[] = [
    ...(isAdmin ? [{ title: "Admin", href: "/admin", icon: Shield }] : []),
    ...(!isAdmin && canReviewProofs ? [{ title: "Review photo proofs", href: "/admin/photo-proofs", icon: Shield }] : []),
    ...(canAdminWorldData ? [{ title: "Game Data", href: "/game-data", icon: Database }] : []),
    ...(!canAdminWorldData && (authz?.manageConsumables ?? false) ? [{ title: "Consumables", href: "/technical/consumables", icon: Database }] : []),
    ...(canManageServers ? [{ title: "Servers", href: "/servers", icon: Server }] : []),
    ...((authz?.adminAuthz ?? false) ? [{ title: "Saffron", href: "/saffron", icon: Key, external: true }] : []),
  ]
  const signOut: AccountItem = { title: "Sign Out", onClick: logout, icon: LogOut }

  // Resolve branding: tenant overrides site-level.
  const branding: Branding | null = siteConfig?.tenant?.branding ?? siteConfig?.branding ?? null
  return {
    location, isAuthenticated, isLoading, siteConfig, favorites, hasFavorites, hasUnreadWhatsNew,
    accountItems, adminItems, signOut, branding,
    hasBranding: !!(branding?.logo_wide || branding?.square_logo || branding?.display_name),
    loginUrl: `/login?from=${encodeURIComponent(location.pathname + location.search)}`,
    whatsNewOpen, setWhatsNewOpen, searchEnabled, searchOpen, setSearchOpen, openSearch,
  }
}

type NavState = ReturnType<typeof useNavBarState>

function Brand({ state, className }: { state: NavState; className?: string }) {
  const { branding, hasBranding } = state
  if (state.location.pathname.startsWith("/g/")) {
    return (
      <Link to="/" className={cn("rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", className)}>
        Back to {branding?.display_name || "Chronicle"}
      </Link>
    )
  }
  return (
    <Link to="/" className={cn("flex items-center", className)}>
      {hasBranding ? (
        branding?.logo_wide ? (
          <img src={branding.logo_wide} alt={branding?.display_name ?? ""} className="h-15 -my-2 object-contain" />
        ) : (
          <div className="flex items-center gap-2">
            {branding?.square_logo && <img src={branding.square_logo} alt="" className="h-8 w-8 rounded object-contain" />}
            {branding?.display_name && <span className="text-lg font-semibold text-foreground">{branding.display_name}</span>}
          </div>
        )
      ) : (
        <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="h-15 -my-2" />
      )}
    </Link>
  )
}

function AccountMenuItem({ item }: { item: AccountItem }) {
  if ("href" in item) {
    return (
      <DropdownMenuItem asChild>
        {item.external ? (
          <a href={item.href} className="flex items-center gap-2"><item.icon className="h-4 w-4" />{item.title}</a>
        ) : (
          <Link to={item.href} className={cn("flex items-center gap-2", item.highlight && HIGHLIGHT_CLASS)}><item.icon className="h-4 w-4" />{item.title}</Link>
        )}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuItem onSelect={item.onClick} className="flex items-center gap-2">
      <item.icon className="h-4 w-4" />
      {item.title}
      {item.indicator && <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-label="New" />}
    </DropdownMenuItem>
  )
}

/** Desktop account dropdown. Favorites and admin tools have their own menus beside it. */
function AccountMenu({ state }: { state: NavState }) {
  if (state.isLoading) return null
  if (!state.isAuthenticated) {
    return <Link to={state.loginUrl}><Button size="sm">Sign In</Button></Link>
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 px-3 text-sm font-medium">
          Account
          {state.hasUnreadWhatsNew && <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-primary" aria-label="New What's New update" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        {state.accountItems.map((item) => <AccountMenuItem key={item.title} item={item} />)}
        <DropdownMenuSeparator />
        <AccountMenuItem item={state.signOut} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const iconTrigger = "rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"

/** Starred guilds and characters, one click from any page. */
function FavoritesNavMenu({ state }: { state: NavState }) {
  if (!state.isAuthenticated) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Favorites" className={iconTrigger}>
          <Star className={cn("h-4 w-4", state.hasFavorites && "fill-amber-400 text-amber-400")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        <FavoritesMenu data={state.favorites} />
        {!state.hasFavorites && (
          <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Star className="size-3.5" />Favorites
          </DropdownMenuLabel>
        )}
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          {state.hasFavorites ? "Star any guild or character to add it here." : "Star a guild or character and it shows up here, one click from any page."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Admin tools, shown only to accounts with admin permissions. */
function AdminNavMenu({ state }: { state: NavState }) {
  if (state.adminItems.length === 0) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Admin" className={iconTrigger}><Shield className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">Admin</DropdownMenuLabel>
        {state.adminItems.map((item) => <AccountMenuItem key={item.title} item={item} />)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const mobileRow = "flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"

function MobileAccountItem({ item, close }: { item: AccountItem; close: () => void }) {
  if ("href" in item) {
    const body = <><item.icon className="h-4 w-4" />{item.title}</>
    return item.external
      ? <a href={item.href} onClick={close} className={mobileRow}>{body}</a>
      : <Link to={item.href} onClick={close} className={cn(mobileRow, item.highlight && HIGHLIGHT_CLASS)}>{body}</Link>
  }
  return (
    <button type="button" onClick={() => { item.onClick(); close() }} className={cn(mobileRow, "w-full text-left")}>
      <item.icon className="h-4 w-4" />{item.title}
      {item.indicator && <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-label="New" />}
    </button>
  )
}

function MobileFavoritesSection({ state, close }: { state: NavState; close: () => void }) {
  const favorites = state.favorites
  if (!state.isAuthenticated || !favorites || !state.hasFavorites) return null
  return (
    <div className="flex flex-col border-b pb-3">
      <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />Favorites
      </div>
      {favorites.guilds.map((guild) => (
        <Link key={guild.id} to={guildHref(guild)} onClick={close} className={mobileRow}>
          <Shield className="h-4 w-4 text-amber-500" /><span className="font-medium text-amber-500">{guild.name}</span>
        </Link>
      ))}
      {favorites.players.map((player) => (
        <Link key={`${player.realm_id}:${player.id}`} to={playerHref(player)} onClick={close} className={mobileRow}>
          <img src={`/c/icons/class_${player.class.toLowerCase()}.png`} alt="" className="h-4 w-4 rounded-sm" />
          <span className="font-medium" style={{ color: `var(--color-class-${player.class.toLowerCase()})` }}>{player.name}</span>
          {player.guild_name && <span className="truncate text-xs">&lt;{player.guild_name}&gt;</span>}
        </Link>
      ))}
    </div>
  )
}

function MobileAccountSection({ state, close }: { state: NavState; close: () => void }) {
  if (state.isLoading) return null
  if (!state.isAuthenticated) {
    return <Link to={state.loginUrl} onClick={close}><Button className="w-full">Sign In</Button></Link>
  }
  return (
    <div className="flex flex-col">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Account</div>
      {state.accountItems.map((item) => <MobileAccountItem key={item.title} item={item} close={close} />)}
      {state.adminItems.length > 0 && (
        <details className="group">
          <summary className={cn(mobileRow, "cursor-pointer list-none")}><Shield className="h-4 w-4" />Admin<ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" /></summary>
          <div className="pl-4">{state.adminItems.map((item) => <MobileAccountItem key={item.title} item={item} close={close} />)}</div>
        </details>
      )}
      <MobileAccountItem item={state.signOut} close={close} />
    </div>
  )
}

function GroupColumn({ group, onSelect, asMenuItems, compact }: { group: NavGroup; onSelect?: () => void; asMenuItems?: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.title}</div>
      {group.links.map((link) => {
        const body = (
          <Link to={link.href} onClick={onSelect} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted focus:bg-muted">
            <link.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">{link.title}</span>
              {!compact && <span className="text-xs leading-snug text-muted-foreground">{link.description}</span>}
            </span>
          </Link>
        )
        return asMenuItems ? <DropdownMenuItem key={link.id} asChild className="p-0">{body}</DropdownMenuItem> : <div key={link.id}>{body}</div>
      })}
    </div>
  )
}

/** Every feature, grouped. Used as the desktop mega menu and the mobile menu. */
function FeatureDirectory({ onSelect, asMenuItems, mobile }: { onSelect?: () => void; asMenuItems?: boolean; mobile?: boolean }) {
  const groups = navGroups()
  return (
    <div className={cn("grid gap-4", mobile ? "grid-cols-1" : "grid-cols-3")}>
      <GroupColumn group={groups[0]} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
      <GroupColumn group={groups[1]} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
      <GroupColumn group={groups[2]} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
    </div>
  )
}

function MobileMenuSheet({ state }: { state: NavState }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /><span className="sr-only">Open menu</span></Button>
      </SheetTrigger>
      <SheetContent side="left" className="styled-scrollbar w-80 overflow-y-auto p-4">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        {state.searchEnabled ? <SearchTrigger onOpen={() => { close(); state.openSearch() }} className="mt-8 w-full" /> : <div className="mt-6" />}
        <MobileFavoritesSection state={state} close={close} />
        <FeatureDirectory mobile onSelect={close} />
        <div className="border-t pt-3"><MobileAccountSection state={state} close={close} /></div>
        {!!state.siteConfig?.tenant && (
          <div className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
            <span>Powered by</span>
            <img src="/c/chronicle/ChronicleIcon.webp" alt="Chronicle" className="h-4 w-4" />
            <span className="font-medium">Chronicle</span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function navTextLink(active: boolean) {
  return cn("flex items-center gap-1.5 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")
}

/** Left column: the Chronicle icon on branded tenants. Search never takes this slot. */
function LeftGroup({ state }: { state: NavState }) {
  return (
    <div className="hidden items-center lg:flex">
      {state.hasBranding && <img src="/c/chronicle/ChronicleIcon.webp" alt="Chronicle" className="h-10 w-10 shrink-0" />}
    </div>
  )
}

/** Search hugs the logo from the right: a field that shrinks to fit, or an icon where the links leave no room. */
function LogoSearch({ state }: { state: NavState }) {
  if (!state.searchEnabled) return null
  return (
    <>
      <SearchTrigger onOpen={state.openSearch} className="ml-6 mr-auto hidden min-w-36 max-w-64 flex-1 xl:flex" />
      <SearchTrigger compact onOpen={state.openSearch} className="ml-4 mr-auto xl:hidden" />
    </>
  )
}

/** Recent, one descriptive "Explore" menu, then the signed-in menus. */
function DesktopNav({ state }: { state: NavState }) {
  const recent = allNavLinks().find((link) => link.id === "recent")!
  return (
    // Equal outer columns keep the logo centred; search hugs it from the right.
    <nav className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b px-4">
      <div className="lg:hidden"><MobileMenuSheet state={state} /></div>
      <LeftGroup state={state} />
      <Brand state={state} />
      <div className="hidden min-w-0 items-center justify-end gap-5 lg:flex">
        <LogoSearch state={state} />
        <RootCommunityNavButton />
        <Link to={recent.href} className={navTextLink(isActiveLink(recent, state.location.pathname))}><recent.icon className="h-4 w-4" />Recent</Link>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground">
              <Compass className="h-4 w-4" />Explore<ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[720px] p-4">
            <FeatureDirectory asMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          <FavoritesNavMenu state={state} />
          <AdminNavMenu state={state} />
          <AccountMenu state={state} />
        </div>
      </div>
      <div className="flex items-center justify-end lg:hidden">
        <RootCommunityNavButton mobile />
        {state.searchEnabled && <SearchTrigger compact onOpen={state.openSearch} />}
      </div>
    </nav>
  )
}

/** `search` shows the global search; it stays off until the backend search endpoint ships. */
export function NavBar({ search = false }: { search?: boolean }) {
  const state = useNavBarState(search)
  return (
    <>
      <DesktopNav state={state} />
      {search && <SearchPalette open={state.searchOpen} onOpenChange={state.setSearchOpen} />}
      <WhatsNewDialog open={state.whatsNewOpen} onOpenChange={state.setWhatsNewOpen} />
    </>
  )
}
