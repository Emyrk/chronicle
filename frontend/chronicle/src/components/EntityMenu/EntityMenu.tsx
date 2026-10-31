import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Copy, ExternalLink, History, Shield, Timer, Trophy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupporterTier } from "@/hooks/useSupporterTier";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { CompareTray } from "./CompareTray";
import { compareAction, kindColor, STATS_TIER, useComparePins } from "./entityCompare";

import {
  EntityMenuContext,
  type EntityMenuContextValue,
  type EntityScopeProviders,
  type EntityRaidContext,
} from "./entityMenuContext";
import {
  armoryUrl,
  closestEntity,
  guildHistoryUrl,
  guildPageUrl,
  isComparable,
  killTimeLeaderboardUrl,
  performanceHistoryUrl,
  type EntityKind,
  type EntityRef,
} from "./entity";

const ComparePanel = lazy(() => import("./ComparePanel"));

export type { EntityActionProvider, EntityDetailsProvider } from "./entityMenuContext";

export interface EntityAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Opens in a new tab so inspecting never loses your place. */
  href?: string;
  onSelect?: () => void;
  /** Why the action can't be used right now; shown instead of running it. */
  disabled?: string;
  /** A small tag at the end of the row, e.g. the supporter tier that unlocks it. */
  badge?: { label: string; color: string };
}

interface OpenMenu {
  entity: EntityRef;
  x: number;
  y: number;
  container: HTMLElement;
  scoped: EntityAction[];
  /** The innermost scope's card for this entity, shown above the actions. */
  details: ReactNode;
}


const SCOPE_ATTRIBUTE = "data-entity-scope";
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;
const REVEAL_ATTRIBUTE = "data-entity-reveal";

/** Actions every entity of a kind gets, wherever it appears. */
function globalActions(entity: EntityRef): EntityAction[] {
  const copy: EntityAction = {
    id: "copy-name",
    label: "Copy name",
    icon: Copy,
    onSelect: () => {
      void navigator.clipboard?.writeText(entity.name).then(
        () => toast.success(`Copied ${entity.name}`),
        () => toast.error("Couldn't copy to the clipboard"),
      );
    },
  };
  if (entity.kind === "character") {
    return [
      { id: "armory", label: "View armory", icon: ExternalLink, href: armoryUrl(entity) },
      { id: "performance", label: "Performance history", icon: History, href: performanceHistoryUrl(entity) },
      copy,
    ];
  }
  if (entity.kind === "encounter") {
    return [
      { id: "kill-time-leaderboard", label: "Kill time leaderboard", icon: Trophy, href: killTimeLeaderboardUrl(entity) },
      copy,
    ];
  }
  return [
    { id: "guild-page", label: "Guild page", icon: Shield, href: guildPageUrl(entity) },
    { id: "guild-history", label: "Clear-time history", icon: Timer, href: guildHistoryUrl(entity) },
    copy,
  ];
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Alt+click (Option+click on Mac) any element marked with `entityAttributes` to open its menu,
 * or press and hold it on a touch screen. Holding Alt outlines everything that can be clicked.
 */
export function EntityMenuProvider({ children }: { children: ReactNode }) {
  const providers = useRef(new Map<string, EntityScopeProviders>());
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const compare = useComparePins();
  const supporter = useSupporterTier();
  // Assume access while the session loads rather than flashing a lock.
  const canShowStats = supporter.isLoading || supporter.atLeast(STATS_TIER);
  // The compare tray expanded into the full stats panel, opened on this kind.
  const [expanded, setExpanded] = useState<EntityKind | null>(null);
  const closeExpanded = useCallback(() => setExpanded(null), []);
  const [raid, setRaid] = useState<EntityRaidContext | null>(null);
  const revealedDocs = useRef(new Set<Document>());
  // An Alt press with nothing else in between toggles Firefox's menu bar on release.
  const altAlone = useRef(false);

  const setReveal = useCallback((doc: Document, on: boolean) => {
    if (on) {
      doc.documentElement.setAttribute(REVEAL_ATTRIBUTE, "");
      revealedDocs.current.add(doc);
    } else {
      for (const revealed of revealedDocs.current) revealed.documentElement.removeAttribute(REVEAL_ATTRIBUTE);
      revealedDocs.current.clear();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        if (!event.repeat) altAlone.current = true;
        if (!isEditable(event.target)) setReveal(document, true);
      } else {
        altAlone.current = false;
        if (!event.altKey) setReveal(document, false);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;
      if (altAlone.current) event.preventDefault();
      altAlone.current = false;
      setReveal(document, false);
    };
    const clear = () => setReveal(document, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [setReveal]);

  // Pointer events reach us from popped-out panel windows too, where key events don't.
  const openMenuFor = useCallback((hit: NonNullable<ReturnType<typeof closestEntity>>, x: number, y: number) => {
    const scoped: EntityAction[] = [];
    let details: ReactNode = null;
    // Innermost scope first.
    for (let scope = hit.element.closest(`[${SCOPE_ATTRIBUTE}]`); scope; scope = scope.parentElement?.closest(`[${SCOPE_ATTRIBUTE}]`) ?? null) {
      const provider = providers.current.get(scope.getAttribute(SCOPE_ATTRIBUTE) ?? "");
      if (provider?.actions) scoped.push(...provider.actions(hit.entity));
      details ??= provider?.details?.(hit.entity) ?? null;
    }
    const doc = hit.element.ownerDocument;
    setMenu({ entity: hit.entity, x, y, container: doc.body, scoped, details });
  }, []);

  // Touch has no Alt key: press and hold a name instead. Moving the finger (scrolling) cancels it.
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  // The tap that ends a long press must not also click the row underneath.
  const swallowClick = useRef(false);
  const cancelLongPress = useCallback(() => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent) => {
    cancelLongPress();
    swallowClick.current = false;
    if (event.pointerType !== "touch") return;
    const hit = closestEntity(event.target);
    if (!hit) return;
    const { clientX: x, clientY: y } = event;
    const timer = window.setTimeout(() => {
      longPress.current = null;
      swallowClick.current = true;
      navigator.vibrate?.(10);
      openMenuFor(hit, x, y);
    }, LONG_PRESS_MS);
    longPress.current = { timer, x, y };
  }, [cancelLongPress, openMenuFor]);

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    const pending = longPress.current;
    if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > LONG_PRESS_SLOP_PX) cancelLongPress();
    const doc = (event.target as Node).ownerDocument;
    if (!doc) return;
    if (event.altKey !== doc.documentElement.hasAttribute(REVEAL_ATTRIBUTE)) setReveal(doc, event.altKey);
  }, [cancelLongPress, setReveal]);

  const handleClickCapture = useCallback((event: ReactMouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event.altKey || event.button !== 0) return;
    const hit = closestEntity(event.target);
    if (!hit) return;
    // Alt+click on a link downloads it in Chrome and Safari; keep the row's own click from running too.
    event.preventDefault();
    event.stopPropagation();
    altAlone.current = false;
    openMenuFor(hit, event.clientX, event.clientY);
  }, [openMenuFor]);

  // Android opens the browser's own menu on a long press; ours replaces it on names.
  const handleContextMenuCapture = useCallback((event: ReactMouseEvent) => {
    if ((longPress.current || swallowClick.current) && closestEntity(event.target)) event.preventDefault();
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const value = useMemo<EntityMenuContextValue>(() => ({
    register: (id, scopeProviders) => {
      providers.current.set(id, scopeProviders);
      return () => {
        providers.current.delete(id);
      };
    },
    setRaid,
  }), []);

  return (
    <EntityMenuContext.Provider value={value}>
      <div
        style={{ display: "contents" }}
        onClickCapture={handleClickCapture}
        onPointerDownCapture={handlePointerDown}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={cancelLongPress}
        onPointerCancelCapture={cancelLongPress}
        onContextMenuCapture={handleContextMenuCapture}
      >
        {children}
        {/* Inside the listener so names in the tray and the full stats can be Alt+clicked too. */}
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6 [&>*]:pointer-events-auto">
          <CompareTray
            pins={compare.pins}
            hidden={compare.hidden}
            raid={raid}
            canShowStats={canShowStats}
            onRemove={compare.toggle}
            onToggleHidden={compare.toggleHidden}
            onClear={compare.clear}
            onExpand={setExpanded}
          />
        </div>
        {expanded && (
          <Suspense fallback={null}>
            <ComparePanel entities={compare.pins} hidden={compare.hidden} initialKind={expanded} onClose={closeExpanded} />
          </Suspense>
        )}
      </div>
      {menu &&
        createPortal(
          <EntityMenuPopover
            menu={menu}
            actions={[
              ...menu.scoped,
              ...(isComparable(menu.entity) ? [compareAction(menu.entity, compare.pins, compare.toggle)] : []),
              ...globalActions(menu.entity),
            ]}
            onClose={closeMenu}
          />,
          menu.container,
        )}
    </EntityMenuContext.Provider>
  );
}

/**
 * Adds `actions`, and optionally a `details` card, to the entity menu for anything Alt+clicked
 * inside `children`.
 */
export function EntityActionScope({
  actions,
  details,
  children,
}: EntityScopeProviders & { children: ReactNode }) {
  const context = useContext(EntityMenuContext);
  const id = useId();
  const latest = useRef<EntityScopeProviders>({ actions, details });
  useLayoutEffect(() => {
    latest.current = { actions, details };
  });
  useEffect(
    () =>
      context?.register(id, {
        actions: (entity) => latest.current.actions?.(entity) ?? [],
        details: (entity) => latest.current.details?.(entity),
      }),
    [context, id],
  );
  return (
    <div style={{ display: "contents" }} {...{ [SCOPE_ATTRIBUTE]: id }}>
      {children}
    </div>
  );
}

const MENU_WIDTH = 220;
/** Wider when a scope adds a details card. */
const MENU_WIDTH_WITH_DETAILS = 264;
const KIND_TITLE = { character: "Player", guild: "Guild", encounter: "Encounter" } as const;

function EntityMenuPopover({ menu, actions, onClose }: { menu: OpenMenu; actions: EntityAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const { entity } = menu;

  useLayoutEffect(() => {
    const element = ref.current;
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(menu.x, view.innerWidth - rect.width - 8)),
      top: menu.y + rect.height + 8 > view.innerHeight ? Math.max(8, menu.y - rect.height) : menu.y,
    });
    element.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const doc = menu.container.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const index = items.indexOf(doc.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items[(next + items.length) % items.length]?.focus();
      }
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("keydown", onKeyDown, true);
    doc.defaultView?.addEventListener("blur", onClose);
    doc.addEventListener("scroll", onClose, true);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.defaultView?.removeEventListener("blur", onClose);
      doc.removeEventListener("scroll", onClose, true);
    };
  }, [menu.container, onClose]);

  const itemClass =
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs pointer-coarse:py-2.5 pointer-coarse:text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${entity.name} actions`}
      className="fixed z-[100] rounded-md border bg-popover p-1 text-popover-foreground shadow-xl"
      style={{ ...position, width: menu.details ? MENU_WIDTH_WITH_DETAILS : MENU_WIDTH }}
    >
      <div className="flex items-baseline gap-2 px-2 pt-1 pb-1.5">
        <span
          className="truncate text-sm font-semibold"
          style={entity.kind === "character" && entity.className ? { color: getClassColorVar(entity.className) } : undefined}
        >
          {entity.name}
        </span>
        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wider" style={{ color: kindColor(entity.kind) }}>
          {KIND_TITLE[entity.kind]}
        </span>
      </div>
      {menu.details && <div className="mb-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">{menu.details}</div>}
      {actions.map((action, index) => {
        const Icon = action.icon;
        const divider = index === menu.scoped.length && index > 0;
        const content = (
          <>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{action.label}</span>
            {action.badge && (
              <span
                className="ml-auto shrink-0 rounded px-1.5 text-[10px] font-semibold"
                style={{ color: action.badge.color, backgroundColor: `color-mix(in oklab, ${action.badge.color} 15%, transparent)` }}
              >
                {action.badge.label}
              </span>
            )}
          </>
        );
        return (
          <div key={action.id} className={divider ? "mt-1 border-t border-border/60 pt-1" : undefined}>
            {action.href ? (
              <Link role="menuitem" to={action.href} target="_blank" className={itemClass} onClick={onClose}>
                {content}
              </Link>
            ) : (
              <button
                type="button"
                role="menuitem"
                aria-disabled={action.disabled ? true : undefined}
                title={action.disabled}
                className={cn(itemClass, action.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent")}
                onClick={() => {
                  if (action.disabled) return;
                  action.onSelect?.();
                  onClose();
                }}
              >
                {content}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
