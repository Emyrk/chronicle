export const CONSUMABLES_PAGE_SIZE = 100;

export interface ConsumablesPage<T> {
  items: T[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

export function paginateConsumables<T>(items: T[], requestedPage: number): ConsumablesPage<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / CONSUMABLES_PAGE_SIZE));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const start = page * CONSUMABLES_PAGE_SIZE;
  const end = Math.min(start + CONSUMABLES_PAGE_SIZE, items.length);

  return {
    items: items.slice(start, end),
    page,
    pageCount,
    start,
    end,
  };
}
