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
import { Copy, ExternalLink, History, Shield, Timer, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupporterTier } from "@/hooks/useSupporterTier";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { CompareTray } from "./CompareTray";
import { compareAction, kindColor, STATS_TIER, useComparePins } from "./entityCompare";

import {
  EntityMenuContext,
  type EntityActionProvider,
  type EntityMenuContextValue,
  type EntityRaidContext,
} from "./entityMenuContext";
import {
  armoryUrl,
  closestEntity,
  guildHistoryUrl,
  guildPageUrl,
  performanceHistoryUrl,
  type EntityKind,
  type EntityRef,
} from "./entity";

const ComparePanel = lazy(() => import("./ComparePanel"));

export type { EntityActionProvider } from "./entityMenuContext";

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
}


const SCOPE_ATTRIBUTE = "data-entity-scope";
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
 * Alt+click (Option+click on Mac) any element marked with `entityAttributes` to open its menu.
 * Holding Alt outlines everything that can be clicked this way.
 */
export function EntityMenuProvider({ children }: { children: ReactNode }) {
  const providers = useRef(new Map<string, EntityActionProvider>());
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
  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    const doc = (event.target as Node).ownerDocument;
    if (!doc) return;
    if (event.altKey !== doc.documentElement.hasAttribute(REVEAL_ATTRIBUTE)) setReveal(doc, event.altKey);
  }, [setReveal]);

  const handleClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!event.altKey || event.button !== 0) return;
    const hit = closestEntity(event.target);
    if (!hit) return;
    // Alt+click on a link downloads it in Chrome and Safari; keep the row's own click from running too.
    event.preventDefault();
    event.stopPropagation();
    altAlone.current = false;
    const scoped: EntityAction[] = [];
    // Innermost scope first.
    for (let scope = hit.element.closest(`[${SCOPE_ATTRIBUTE}]`); scope; scope = scope.parentElement?.closest(`[${SCOPE_ATTRIBUTE}]`) ?? null) {
      const provider = providers.current.get(scope.getAttribute(SCOPE_ATTRIBUTE) ?? "");
      if (provider) scoped.push(...provider(hit.entity));
    }
    const doc = hit.element.ownerDocument;
    setMenu({ entity: hit.entity, x: event.clientX, y: event.clientY, container: doc.body, scoped });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const value = useMemo<EntityMenuContextValue>(() => ({
    register: (id, provider) => {
      providers.current.set(id, provider);
      return () => {
        providers.current.delete(id);
      };
    },
    setRaid,
  }), []);

  return (
    <EntityMenuContext.Provider value={value}>
      <div style={{ display: "contents" }} onClickCapture={handleClickCapture} onPointerMoveCapture={handlePointerMove}>
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
              compareAction(menu.entity, compare.pins, compare.toggle),
              ...globalActions(menu.entity),
            ]}
            onClose={closeMenu}
          />,
          menu.container,
        )}
    </EntityMenuContext.Provider>
  );
}

/** Adds `actions` to the entity menu for anything Alt+clicked inside `children`. */
export function EntityActionScope({ actions, children }: { actions: EntityActionProvider; children: ReactNode }) {
  const context = useContext(EntityMenuContext);
  const id = useId();
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  useEffect(() => context?.register(id, (entity) => latest.current(entity)), [context, id]);
  return (
    <div style={{ display: "contents" }} {...{ [SCOPE_ATTRIBUTE]: id }}>
      {children}
    </div>
  );
}

const MENU_WIDTH = 220;

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
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${entity.name} actions`}
      className="fixed z-[100] rounded-md border bg-popover p-1 text-popover-foreground shadow-xl"
      style={{ ...position, width: MENU_WIDTH }}
    >
      <div className="flex items-baseline gap-2 px-2 pt-1 pb-1.5">
        <span
          className="truncate text-sm font-semibold"
          style={entity.kind === "character" && entity.className ? { color: getClassColorVar(entity.className) } : undefined}
        >
          {entity.name}
        </span>
        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wider" style={{ color: kindColor(entity.kind) }}>
          {entity.kind === "character" ? "Player" : "Guild"}
        </span>
      </div>
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
