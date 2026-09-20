import type { GuildPageTab } from "@/api/typesGenerated";

export type TabMoveDirection = "up" | "down";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const CALENDAR_SLUG = "calendar";

export function isRequiredGuildPageTab(tab: GuildPageTab): boolean {
  return tab.slug === CALENDAR_SLUG || (
    tab.slug === "overview" &&
    tab.panels.length === 1 &&
    tab.panels[0].panel_type === "calendar"
  );
}

const REQUIRED_RAIDS_TAB: GuildPageTab = {
  id: "required-raids-tab",
  label: "Raids",
  slug: CALENDAR_SLUG,
  sort_order: Number.MAX_SAFE_INTEGER,
  visibility: "all",
  panels: [
    {
      id: "required-raids-panel",
      panel_type: "calendar",
      config: {
        displayStyle: "cards",
        category: "raid",
        hasVideo: "all",
        _style: {
          background: "transparent",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          panelName: "",
          showHeader: false,
        },
      },
      position: { x: 0, y: 0, w: 12, h: 6 },
      visibility: "all",
    },
  ],
};

export function ensureRequiredRaidsTab(
  tabs: readonly GuildPageTab[],
  pageId: string | undefined,
): GuildPageTab[] {
  const existingRaidsIndex = tabs.findIndex(isRequiredGuildPageTab);
  if (existingRaidsIndex !== -1) {
    return tabs.map((tab, index) => index === existingRaidsIndex
      ? { ...tab, label: "Raids" }
      : tab);
  }

  if (!pageId || pageId === NIL_UUID) {
    return [...tabs];
  }

  return [...tabs, REQUIRED_RAIDS_TAB];
}

export function orderGuildPageTabs(tabs: readonly GuildPageTab[]): GuildPageTab[] {
  return [...tabs].sort((a, b) => {
    if (isRequiredGuildPageTab(a) && !isRequiredGuildPageTab(b)) return 1;
    if (!isRequiredGuildPageTab(a) && isRequiredGuildPageTab(b)) return -1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;

    const slugComparison = a.slug.localeCompare(b.slug);
    if (slugComparison !== 0) return slugComparison;

    return a.id.localeCompare(b.id);
  });
}

export function moveGuildPageTab(
  tabs: readonly GuildPageTab[],
  tabId: string,
  direction: TabMoveDirection,
): GuildPageTab[] {
  const orderedTabs = orderGuildPageTabs(tabs);
  const currentIndex = orderedTabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex === -1) return orderedTabs;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= orderedTabs.length) return orderedTabs;

  const [movedTab] = orderedTabs.splice(currentIndex, 1);
  orderedTabs.splice(nextIndex, 0, movedTab);

  return orderedTabs.map((tab, index) => ({
    ...tab,
    sort_order: index,
  }));
}
