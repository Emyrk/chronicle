import type { GuildPageTab } from "@/api/typesGenerated";

export type TabMoveDirection = "up" | "down";

export function orderGuildPageTabs(tabs: readonly GuildPageTab[]): GuildPageTab[] {
  return [...tabs].sort((a, b) => {
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
