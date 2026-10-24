import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSpellIconUrl } from "@/api/wowdb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iconListUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { DEFAULT_LAYOUT_ICON, LAYOUT_TITLE_ERROR, isValidLayoutTitle } from "./layoutMetadata";

const LAYOUT_DESCRIPTION_MAX = 500;
const ICON_PAGE_SIZE = 24;

function parseIconList(data: unknown): string[] {
  const names = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "names" in data
      ? (data as { names?: unknown }).names
      : null;
  return Array.isArray(names) ? names.filter((value): value is string => typeof value === "string") : [];
}

function useLayoutIconOptions(iconBaseUrl: string | undefined): string[] {
  const { data } = useQuery({
    queryKey: ["layout-icon-list", iconBaseUrl ?? ""],
    queryFn: async () => {
      const response = await fetch(iconListUrl(iconBaseUrl));
      if (!response.ok) throw new Error("Failed to load icons");
      return parseIconList(await response.json());
    },
    staleTime: Infinity,
    retry: false,
  });
  return data ?? [];
}

interface LayoutMetadataFieldsProps {
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  icon: string;
  onIconChange: (icon: string) => void;
  readOnly?: boolean;
  /** "split" puts the description and icon picker side by side on wide screens. */
  layout?: "split" | "stacked";
  /** Rendered under the description (e.g. ownership details). */
  descriptionFooter?: ReactNode;
}

/** Title, description, and icon fields for a Layout Book layout. */
export function LayoutMetadataFields({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  icon,
  onIconChange,
  readOnly = false,
  layout = "split",
  descriptionFooter,
}: LayoutMetadataFieldsProps) {
  const iconBaseUrl = useIconBaseUrl();
  const iconOptions = useLayoutIconOptions(iconBaseUrl);
  const [iconSearch, setIconSearch] = useState("");
  const [iconPage, setIconPage] = useState(0);

  const filteredIcons = useMemo(() => {
    const source = iconOptions.length > 0 ? iconOptions : [icon];
    const query = iconSearch.trim().toLowerCase();
    return query ? source.filter((candidate) => candidate.toLowerCase().includes(query)) : source;
  }, [icon, iconOptions, iconSearch]);
  const iconPageCount = Math.max(1, Math.ceil(filteredIcons.length / ICON_PAGE_SIZE));
  const currentIconPage = Math.min(iconPage, iconPageCount - 1);
  const pagedIcons = filteredIcons.slice(currentIconPage * ICON_PAGE_SIZE, (currentIconPage + 1) * ICON_PAGE_SIZE);
  const iconUrl = (name: string) => getSpellIconUrl({ ID: 1, TextureFilename: name || DEFAULT_LAYOUT_ICON }, iconBaseUrl);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Title</label>
        <div className="flex items-center gap-2">
          <img src={iconUrl(icon)} alt="" className="h-8 w-8 rounded border border-border" />
          <Input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Layout title"
            aria-label="Layout title"
            disabled={readOnly}
          />
        </div>
        {!isValidLayoutTitle(title) ? <p className="text-xs text-destructive">{LAYOUT_TITLE_ERROR}</p> : null}
      </div>

      <div className={cn("grid items-start gap-3", layout === "split" && "lg:grid-cols-2")}>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              layout === "split" ? "min-h-[223px]" : "min-h-20",
            )}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Describe what this layout is for"
            aria-label="Layout description"
            disabled={readOnly}
            maxLength={LAYOUT_DESCRIPTION_MAX}
          />
          {!readOnly ? <div className="text-right text-xs text-muted-foreground">{description.length}/{LAYOUT_DESCRIPTION_MAX}</div> : null}
          {descriptionFooter}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Icon</label>
          <div className="space-y-2 rounded-md border border-border/70 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={iconSearch}
                onChange={(event) => {
                  setIconSearch(event.target.value);
                  setIconPage(0);
                }}
                placeholder="Search icons (e.g. INV_Misc_Book_09)"
                aria-label="Search icons"
                className="min-w-0 flex-1"
                disabled={readOnly}
              />
              <div className="text-xs text-muted-foreground">
                {filteredIcons.length} icons • Page {currentIconPage + 1}/{iconPageCount}
              </div>
            </div>

            <div className={cn("grid gap-1.5", layout === "split" ? "grid-cols-6 sm:grid-cols-8 md:grid-cols-10" : "grid-cols-8")}>
              {pagedIcons.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  title={candidate}
                  onClick={() => onIconChange(candidate)}
                  disabled={readOnly}
                  className={cn(
                    "aspect-square rounded border p-0.5",
                    layout === "split" && "h-9 w-9",
                    icon === candidate ? "border-primary bg-primary/10" : "border-border hover:border-primary/60",
                  )}
                >
                  <img src={iconUrl(candidate)} alt="" className="h-full w-full rounded object-cover" />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
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
              <span className="min-w-0 truncate text-xs text-muted-foreground">Selected: {icon}</span>
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
  );
}
