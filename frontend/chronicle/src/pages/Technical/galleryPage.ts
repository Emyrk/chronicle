export const TECHNICAL_GALLERY_PAGE_SIZE = 25;

export interface GalleryPage<T> {
  items: T[];
  page: number;
  totalPages: number;
  start: number;
  end: number;
}

export function galleryPage<T>(items: T[], requestedPage: number, pageSize = TECHNICAL_GALLERY_PAGE_SIZE): GalleryPage<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, items.length);
  return {
    items: items.slice(start === 0 ? 0 : start - 1, end),
    page,
    totalPages,
    start,
    end,
  };
}
