import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, LoaderCircle, LockKeyhole, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import {
  useCreatePanelLayout,
  useSession,
  useUpdateActionBarSlots,
  useUpdatePanelLayout,
  useUserPanelLayouts,
  type UserPanelLayout,
} from "@/api/queries";
import { getSpellIconUrl } from "@/api/wowdb";
import { InstanceActionBar } from "@/components/InstanceActionBar/InstanceActionBar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { showRequestErrorToast } from "@/lib/requestErrorToast";
import { cn } from "@/lib/utils";
import type { LayoutLabExportV1 } from "./parseLayout";
import { fromActionBarResponse, toActionBarResponse } from "./actionBarSlots";
import { LAYOUT_ACTION_BAR_KEYS, type LayoutActionBarKey, type LayoutActionBarSlots } from "./layoutBookStore";
import { LayoutMetadataFields } from "./LayoutMetadataFields";
import { DEFAULT_LAYOUT_ICON, LAYOUT_TITLE_ERROR, isValidLayoutTitle } from "./layoutMetadata";

const NEW_LAYOUT = "new";

interface LayoutMetadata {
  title: string;
  description: string;
  icon: string;
}

interface SaveLayoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The layout to save, read when a save is confirmed. */
  getLayout: () => LayoutLabExportV1;
  /** The Layout Book layout the page currently shows, if any. */
  activeLayoutId: string | null;
  /** Called after a layout is created or overwritten. */
  onSaved?: (layout: UserPanelLayout) => void;
}

/**
 * A right-hand drawer for saving the current layout to the Layout Book:
 * overwrite one of your layouts or save a new one, edit its metadata, and
 * assign it to the action bar.
 */
export function SaveLayoutSheet(props: SaveLayoutSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Save layout</SheetTitle>
          <SheetDescription>Save this layout to your Layout Book and put it on your action bar.</SheetDescription>
        </SheetHeader>
        {/* Mounted per open so the form starts from the current selection. */}
        {props.open && <SaveLayoutSheetBody {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function metadataFor(layout: UserPanelLayout): LayoutMetadata {
  return { title: layout.title, description: layout.description ?? "", icon: layout.icon || DEFAULT_LAYOUT_ICON };
}

function SaveLayoutSheetBody({ getLayout, activeLayoutId, onSaved }: SaveLayoutSheetProps) {
  const { data: session, isLoading: sessionLoading } = useSession();
  const userId = session?.user_id ?? "";
  const layoutsQuery = useUserPanelLayouts(userId);
  const createLayout = useCreatePanelLayout();
  const updateLayout = useUpdatePanelLayout();
  const updateActionBar = useUpdateActionBarSlots();
  const iconBaseUrl = useIconBaseUrl();

  const layouts = layoutsQuery.data?.layouts ?? [];
  const isOwned = (layout: UserPanelLayout) => layout.owner_id === userId;
  const activeLayout = layouts.find((layout) => layout.id === activeLayoutId) ?? null;

  // Until the user picks, target the layout on screen when they own it.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = pickedId ?? (activeLayout && isOwned(activeLayout) ? activeLayout.id : NEW_LAYOUT);
  const selected = layouts.find((layout) => layout.id === selectedId) ?? null;
  const canOverwrite = selected !== null && isOwned(selected);

  const [metadataOverride, setMetadata] = useState<LayoutMetadata | null>(null);
  const metadata = metadataOverride
    ?? (selected
      ? metadataFor(selected)
      : activeLayout
        ? { ...metadataFor(activeLayout), title: isOwned(activeLayout) ? activeLayout.title : `Copy of ${activeLayout.title}`.slice(0, 64) }
        : { title: "My layout", description: "", icon: DEFAULT_LAYOUT_ICON });
  const updateMetadata = (patch: Partial<LayoutMetadata>) => setMetadata({ ...metadata, ...patch });

  // Optimistic copy of the action bar so assignments feel immediate.
  const [slotsOverride, setSlotsOverride] = useState<LayoutActionBarSlots | null>(null);
  const slots = slotsOverride ?? fromActionBarResponse(layoutsQuery.data?.action_bar_slots);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const pick = (id: string) => {
    setPickedId(id);
    const layout = layouts.find((candidate) => candidate.id === id);
    // Picking "New" keeps the form so it can seed the new layout.
    if (layout) setMetadata(metadataFor(layout));
    setJustSavedId(null);
  };

  const assignSlot = (key: LayoutActionBarKey, layoutId: string | null) => {
    const previous = slots;
    const next = { ...slots, [key]: layoutId };
    setSlotsOverride(next);
    updateActionBar.mutateAsync(toActionBarResponse(next)).catch((error) => {
      setSlotsOverride(previous);
      showRequestErrorToast("Failed to update action bar slot", error);
    });
  };

  const saving = createLayout.isPending || updateLayout.isPending;
  const titleValid = isValidLayoutTitle(metadata.title) && metadata.title.trim().length > 0;

  const save = async (mode: "overwrite" | "new") => {
    if (!titleValid) {
      toast.error(LAYOUT_TITLE_ERROR);
      return;
    }
    const request = {
      title: metadata.title.trim(),
      description: metadata.description,
      icon: metadata.icon,
      // The API types payload loosely; it stores the layout export JSON.
      payload: getLayout() as unknown as Record<string, string>,
    };
    try {
      let saved: UserPanelLayout;
      if (mode === "overwrite" && selected && canOverwrite) {
        if (!window.confirm(`Overwrite “${selected.title}”? Its panels and settings will be replaced.`)) return;
        saved = await updateLayout.mutateAsync({ layoutID: selected.id, ...request });
        toast.success("Layout updated", { description: saved.title });
      } else {
        saved = await createLayout.mutateAsync(request);
        toast.success("Layout saved", { description: saved.title });
      }
      setPickedId(saved.id);
      setMetadata(metadataFor(saved));
      setJustSavedId(saved.id);
      onSaved?.(saved);
    } catch (error) {
      showRequestErrorToast(mode === "overwrite" ? "Failed to update layout" : "Failed to save layout", error);
    }
  };

  if (sessionLoading) {
    return <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm"><LoaderCircle className="size-4 animate-spin" /> Loading…</div>;
  }
  if (!userId) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted-foreground">Sign in to save layouts to your Layout Book and action bar.</p>
        <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
      </div>
    );
  }

  const selectedSlot = selected ? LAYOUT_ACTION_BAR_KEYS.find((key) => slots[key] === selected.id) : undefined;
  const freeSlot = LAYOUT_ACTION_BAR_KEYS.find((key) => !slots[key]);

  return (
    <>
      <div className="styled-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Save to</h3>
          <div className="divide-y overflow-hidden rounded-md border" role="radiogroup" aria-label="Save to">
            <LayoutOption
              selected={selectedId === NEW_LAYOUT}
              onSelect={() => pick(NEW_LAYOUT)}
              icon={<span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded border"><Plus className="size-4" /></span>}
              title="New layout"
              subtitle="Add a new layout to your Layout Book"
            />
            {layoutsQuery.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs"><LoaderCircle className="size-3.5 animate-spin" /> Loading your layouts…</div>
            ) : layouts.map((layout) => {
              const owned = isOwned(layout);
              return (
                <LayoutOption
                  key={layout.id}
                  selected={selectedId === layout.id}
                  onSelect={() => pick(layout.id)}
                  icon={<img src={getSpellIconUrl({ ID: 1, TextureFilename: layout.icon || DEFAULT_LAYOUT_ICON }, iconBaseUrl)} alt="" className="size-8 rounded border" />}
                  title={layout.title}
                  subtitle={owned ? "Your layout" : `Tracked · by ${layout.owner_username ?? "another user"}`}
                  badges={(
                    <>
                      {layout.id === activeLayoutId && <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">On screen</span>}
                      {!owned && <LockKeyhole className="text-muted-foreground size-3.5" aria-label="Not yours" />}
                    </>
                  )}
                />
              );
            })}
          </div>
        </section>

        {selected && !canOverwrite ? (
          <Alert>
            <LockKeyhole />
            <AlertTitle>You do not own this layout and cannot change it</AlertTitle>
            <AlertDescription>
              <p>“{selected.title}” was created by {selected.owner_username ?? "another user"}. Save your changes as a new layout instead.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setPickedId(NEW_LAYOUT);
                  setMetadata({ ...metadataFor(selected), title: `Copy of ${selected.title}`.slice(0, 64) });
                }}
              >
                <Copy /> Save as my own copy
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{selected ? "Details" : "New layout details"}</h3>
            <LayoutMetadataFields
              layout="stacked"
              title={metadata.title}
              onTitleChange={(title) => updateMetadata({ title })}
              description={metadata.description}
              onDescriptionChange={(description) => updateMetadata({ description })}
              icon={metadata.icon}
              onIconChange={(icon) => updateMetadata({ icon })}
            />
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Action bar</h3>
            {selected && !selectedSlot && freeSlot && (
              <Button size="sm" variant="outline" onClick={() => assignSlot(freeSlot, selected.id)}>
                <Plus /> Add “{selected.title}” to slot {freeSlot}
              </Button>
            )}
            {selected && selectedSlot && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs"><Check className="size-3.5" /> On slot {selectedSlot}</span>
            )}
          </div>
          {justSavedId && !selectedSlot && (
            <p className="text-muted-foreground text-xs">Saved. Put it on your action bar to cast it with a number key.</p>
          )}
          <div className="overflow-x-auto rounded-md border bg-black/20 p-2 styled-scrollbar">
            <InstanceActionBar slots={slots} layouts={layouts} onAssign={assignSlot} />
          </div>
          <p className="text-muted-foreground text-xs">Click a slot to assign a layout. Middle-click a slot to clear it.</p>
        </section>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
        {canOverwrite ? (
          <>
            <Button variant="outline" onClick={() => void save("new")} disabled={saving || !titleValid}>
              <Plus /> Save as new
            </Button>
            <Button onClick={() => void save("overwrite")} disabled={saving || !titleValid}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />} Overwrite “{selected.title}”
            </Button>
          </>
        ) : selected ? null : (
          <Button onClick={() => void save("new")} disabled={saving || !titleValid}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />} Save as new layout
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function LayoutOption({ selected, onSelect, icon, title, subtitle, badges }: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badges?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
        selected ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/50",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{badges}</span>
    </button>
  );
}
