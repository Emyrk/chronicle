import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Settings, Upload, LogOut, FileText, Shield, Key, Menu, Database, Server, Sparkles, Crown, ChevronDown, Compass, ArrowRight, MoreHorizontal } from "lucide-react"
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "../ui/DropdownMenu/DropdownMenu"
import { SearchPalette, SearchTrigger } from "./GlobalSearch/GlobalSearch"
import { useSearchHotkey } from "./GlobalSearch/useGlobalSearch"
import { allNavLinks, featuredNavLinks, isActiveLink, navGroups, type NavGroup, type NavLink } from "./navItems"

/**
 * Navbar layouts under review:
 * - mega: search field + one "Explore" mega menu that describes every feature.
 * - tabs: a second row of feature tabs, so headline features are always visible.
 * - spotlight: almost empty; search and a full-width menu of feature cards do the work.
 */
export type NavBarLayout = "mega" | "tabs" | "spotlight"

type AccountItem = {
  title: string
  icon: LucideIcon
  indicator?: boolean
  /** Gold supporter styling, so the item reads as an invitation rather than a setting. */
  highlight?: boolean
} & ({ href: string; external?: boolean } | { onClick: () => void })

const HIGHLIGHT_CLASS = "font-medium text-[#f0c060] hover:text-[#ffd580] focus:text-[#ffd580]"

function useNavBarState() {
  const location = useLocation()
  const { session, isAuthenticated, isLoading, logout } = useAuth()
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  useSearchHotkey(openSearch)

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
    whatsNewOpen, setWhatsNewOpen, searchOpen, setSearchOpen, openSearch,
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

function NewBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-[#f0c060]/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#f0c060]">{label}</span>
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

/** Desktop account dropdown; admin tools sit in one submenu. */
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
      <DropdownMenuContent align="end" className={state.hasFavorites ? "w-[300px]" : "w-[200px]"}>
        <FavoritesMenu data={state.favorites} />
        {state.accountItems.map((item) => <AccountMenuItem key={item.title} item={item} />)}
        {state.adminItems.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2"><Shield className="h-4 w-4" />Admin</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {state.adminItems.map((item) => <AccountMenuItem key={item.title} item={item} />)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <AccountMenuItem item={state.signOut} />
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

/** The tall feature card used to spotlight one headline feature (Modules). */
function SpotlightCard({ link, onSelect, className }: { link: NavLink; onSelect?: () => void; className?: string }) {
  return (
    <Link
      to={link.href}
      onClick={onSelect}
      className={cn("group flex flex-col justify-between gap-3 rounded-lg border border-[#f0c060]/30 bg-gradient-to-br from-[#f0c060]/15 via-[#f0c060]/5 to-transparent p-4 transition-colors hover:border-[#f0c060]/60", className)}
    >
      <div>
        <div className="flex items-center gap-2">
          <link.icon className="h-5 w-5 text-[#f0c060]" />
          <span className="font-semibold text-foreground">{link.title}</span>
          {link.badge && <NewBadge label={link.badge} />}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{link.description}</p>
      </div>
      <span className="flex items-center gap-1 text-xs font-medium text-[#f0c060]">Browse modules <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
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
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">{link.title}{link.badge && <NewBadge label={link.badge} />}</span>
              {!compact && <span className="text-xs leading-snug text-muted-foreground">{link.description}</span>}
            </span>
          </Link>
        )
        return asMenuItems ? <DropdownMenuItem key={link.id} asChild className="p-0">{body}</DropdownMenuItem> : <div key={link.id}>{body}</div>
      })}
    </div>
  )
}

/** Every feature, grouped, with Modules spotlighted. Used as the desktop mega menu and the mobile menu. */
function FeatureDirectory({ onSelect, asMenuItems, mobile }: { onSelect?: () => void; asMenuItems?: boolean; mobile?: boolean }) {
  const groups = navGroups()
  const modules = allNavLinks(groups).find((link) => link.id === "modules")
  return (
    <div className={cn("grid gap-4", mobile ? "grid-cols-1" : "grid-cols-[1fr_1fr_220px]")}>
      {mobile && modules && <SpotlightCard link={modules} onSelect={onSelect} />}
      <GroupColumn group={groups[0]} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
      <div className="flex flex-col gap-4">
        <GroupColumn group={groups[1]} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
        <GroupColumn group={{ ...groups[2], links: groups[2].links.filter((link) => link.id !== "modules") }} onSelect={onSelect} asMenuItems={asMenuItems} compact={mobile} />
      </div>
      {!mobile && modules && <SpotlightCard link={modules} onSelect={onSelect} />}
    </div>
  )
}

function MobileMenuSheet({ state, side = "left" }: { state: NavState; side?: "left" | "top" }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /><span className="sr-only">Open menu</span></Button>
      </SheetTrigger>
      <SheetContent side={side} className={cn("styled-scrollbar overflow-y-auto p-4", side === "left" ? "w-80" : "max-h-dvh")}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SearchTrigger onOpen={() => { close(); state.openSearch() }} className="mt-8 w-full" />
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

/** Layout A: search on the left, one descriptive "Explore" mega menu on the right. */
function MegaLayout({ state }: { state: NavState }) {
  const recent = allNavLinks().find((link) => link.id === "recent")!
  return (
    <nav className="relative flex h-16 items-center justify-between border-b px-4">
      <div className="md:hidden"><MobileMenuSheet state={state} /></div>
      <div className="hidden w-72 items-center gap-3 md:flex">
        {state.hasBranding && <img src="/c/chronicle/ChronicleIcon.webp" alt="Chronicle" className="h-9 w-9" />}
        <SearchTrigger onOpen={state.openSearch} className="w-full" />
      </div>
      <Brand state={state} className="absolute left-1/2 -translate-x-1/2" />
      <div className="hidden items-center gap-5 md:flex">
        <RootCommunityNavButton />
        <Link to={recent.href} className={navTextLink(isActiveLink(recent, state.location.pathname))}><recent.icon className="h-4 w-4" />Recent</Link>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground">
              <Compass className="h-4 w-4" />Explore<ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[760px] p-4">
            <FeatureDirectory asMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountMenu state={state} />
      </div>
      <div className="flex items-center md:hidden">
        <RootCommunityNavButton mobile />
        <SearchTrigger compact onOpen={state.openSearch} />
      </div>
    </nav>
  )
}

/** Layout B: a second row of tabs keeps headline features on screen at all times. */
function TabsLayout({ state }: { state: NavState }) {
  const groups = navGroups()
  const tabs = ["recent", "leaderboards", "armory", "ratings", "modules"]
    .map((id) => allNavLinks(groups).find((link) => link.id === id))
    .filter((link): link is NavLink => !!link)
  const rest = allNavLinks(groups).filter((link) => !tabs.includes(link))
  return (
    <nav className="border-b">
      <div className="relative flex h-14 items-center justify-between px-4">
        <div className="md:hidden"><MobileMenuSheet state={state} /></div>
        <div className="hidden w-72 md:block"><SearchTrigger onOpen={state.openSearch} className="w-full" /></div>
        <Brand state={state} className="absolute left-1/2 -translate-x-1/2" />
        <div className="hidden items-center gap-4 md:flex">
          <RootCommunityNavButton />
          <AccountMenu state={state} />
        </div>
        <div className="flex items-center md:hidden">
          <RootCommunityNavButton mobile />
          <SearchTrigger compact onOpen={state.openSearch} />
        </div>
      </div>
      <div className="styled-scrollbar flex items-center gap-1 overflow-x-auto px-2 md:justify-center">
        {tabs.map((link) => {
          const active = isActiveLink(link, state.location.pathname)
          return (
            <Link
              key={link.id}
              to={link.href}
              ref={active ? (node) => node?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <link.icon className={cn("h-4 w-4", link.badge && "text-[#f0c060]")} />
              {link.title === "Recent raids" ? "Recent" : link.title}
              {link.badge && <NewBadge label={link.badge} />}
            </Link>
          )
        })}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[280px] p-2">
            <GroupColumn group={{ id: "discover", title: "More tools", links: rest }} asMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}

/** Layout C: nearly empty bar; search and a full-width feature panel carry navigation. */
function SpotlightLayout({ state }: { state: NavState }) {
  const [open, setOpen] = useState(false)
  const featured = featuredNavLinks()
  return (
    <nav className="relative border-b">
      <div className="relative flex h-16 items-center justify-between px-4">
        <div className="md:hidden"><MobileMenuSheet state={state} side="top" /></div>
        <div className="hidden w-72 md:block"><SearchTrigger onOpen={state.openSearch} className="w-full" /></div>
        <Brand state={state} className="absolute left-1/2 -translate-x-1/2" />
        <div className="hidden items-center gap-3 md:flex">
          <RootCommunityNavButton />
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="gap-1.5">
            <Menu className="h-4 w-4" />Features<ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </Button>
          <AccountMenu state={state} />
        </div>
        <div className="flex items-center md:hidden">
          <RootCommunityNavButton mobile />
          <SearchTrigger compact onOpen={state.openSearch} />
        </div>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 hidden border-b bg-background shadow-xl md:block" onMouseLeave={() => setOpen(false)}>
          <div className="mx-auto grid max-w-6xl grid-cols-4 gap-3 px-6 pt-5">
            {featured.map((link) => (
              <Link key={link.id} to={link.href} onClick={() => setOpen(false)}
                className={cn("group rounded-lg border p-4 transition-colors hover:border-foreground/30",
                  link.badge ? "border-[#f0c060]/30 bg-gradient-to-br from-[#f0c060]/15 to-transparent" : "bg-muted/30")}>
                <div className="flex items-center gap-2">
                  <link.icon className={cn("h-5 w-5", link.badge ? "text-[#f0c060]" : "text-primary")} />
                  <span className="font-semibold">{link.title}</span>
                  {link.badge && <NewBadge label={link.badge} />}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{link.description}</p>
              </Link>
            ))}
          </div>
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-6 py-4 text-sm">
            {allNavLinks().filter((link) => !link.featured).map((link) => (
              <Link key={link.id} to={link.href} onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <link.icon className="h-4 w-4" />{link.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}

export function NavBar({ layout = "mega" }: { layout?: NavBarLayout }) {
  const state = useNavBarState()
  const Layout = layout === "tabs" ? TabsLayout : layout === "spotlight" ? SpotlightLayout : MegaLayout
  return (
    <>
      <Layout state={state} />
      <SearchPalette open={state.searchOpen} onOpenChange={state.setSearchOpen} />
      <WhatsNewDialog open={state.whatsNewOpen} onOpenChange={state.setWhatsNewOpen} />
    </>
  )
}
