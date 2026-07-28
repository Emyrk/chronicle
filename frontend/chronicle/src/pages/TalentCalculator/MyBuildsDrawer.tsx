import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookMarked, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  toastError,
  useCreateTalentBuild,
  useDeleteTalentBuild,
  useMyTalentBuilds,
  useSession,
  useUpdateTalentBuild,
} from "@/api/queries";
import type { UserTalentBuild } from "@/api/typesGenerated";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TALENT_BUILD_PARAM,
  buildPointsSummary,
  isTalentBuildLocked,
  searchParamsWithTalentLock,
} from "@/components/ui/TalentTreeViewer/talentLogic";

export interface TalentClassInfo {
  id: number;
  name: string;
  slug: string;
}

/** Keep in sync with maxUserTalentBuilds in api/talentbuilds.go. */
const MAX_SAVED_BUILDS = 25;

function userInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export function MyBuildsDrawer({
  classes,
  selectedClassId,
  floating = false,
}: {
  classes: TalentClassInfo[];
  selectedClassId?: number;
  /** Render the trigger as a floating action button (mobile). */
  floating?: boolean;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const currentBuild = searchParams.get(TALENT_BUILD_PARAM) ?? "";
  const currentLocked = isTalentBuildLocked(searchParams);

  const buildsQuery = useMyTalentBuilds(isAuthenticated && open);
  const createBuild = useCreateTalentBuild();
  const updateBuild = useUpdateTalentBuild();
  const deleteBuild = useDeleteTalentBuild();

  const classByID = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const atBuildLimit = (buildsQuery.data?.length ?? 0) >= MAX_SAVED_BUILDS;

  // Current class first, then the rest (greyed out), newest first within each group.
  const sortedBuilds = useMemo(() => {
    const builds = buildsQuery.data ?? [];
    return [...builds].sort((a, b) => {
      const aCurrent = a.class_id === selectedClassId ? 0 : 1;
      const bCurrent = b.class_id === selectedClassId ? 0 : 1;
      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [buildsQuery.data, selectedClassId]);

  function saveCurrent() {
    if (!name.trim() || !selectedClassId) return;
    if (atBuildLimit) {
      toast.error(`You can save at most ${MAX_SAVED_BUILDS} builds. Delete one to save another.`);
      return;
    }
    createBuild.mutate(
      {
        name: name.trim(),
        class_id: selectedClassId,
        build: currentBuild,
        locked: currentLocked,
      },
      {
        onSuccess: (created) => {
          setName("");
          toast.success(`Saved "${created.name}"`);
        },
        onError: (err) => toast.error(toastError(err)),
      },
    );
  }

  function loadBuild(build: UserTalentBuild) {
    const cls = classByID.get(build.class_id);
    if (build.class_id === selectedClassId) {
      const next = searchParamsWithTalentLock(searchParams, build.locked);
      if (build.build) next.set(TALENT_BUILD_PARAM, build.build);
      else next.delete(TALENT_BUILD_PARAM);
      setSearchParams(next, { replace: true });
    } else if (cls) {
      // Different class: navigate to its calculator with the build applied.
      const params = new URLSearchParams();
      if (build.build) params.set(TALENT_BUILD_PARAM, build.build);
      const lockParams = searchParamsWithTalentLock(params, build.locked);
      navigate(`/talents/${cls.slug}?${lockParams.toString()}`);
    }
    setOpen(false);
    toast.success(`Loaded "${build.name}"`);
  }

  function overwriteBuild(build: UserTalentBuild) {
    updateBuild.mutate(
      { buildID: build.id, request: { build: currentBuild, locked: currentLocked } },
      {
        onSuccess: () => toast.success(`Overwrote "${build.name}" with the current build`),
        onError: (err) => toast.error(toastError(err)),
      },
    );
  }

  function removeBuild(build: UserTalentBuild) {
    if (!window.confirm(`Delete build "${build.name}"? This cannot be undone.`)) return;
    deleteBuild.mutate(build.id, {
      onSuccess: () => toast.success(`Deleted "${build.name}"`),
      onError: (err) => toast.error(toastError(err)),
    });
  }

  // When logged out the trigger stays tappable (a `disabled` button would
  // swallow the click) but looks disabled and only shows a toast.
  const loggedOut = !isLoading && !isAuthenticated;
  const notifyLoginRequired = () => {
    toast.error("You must be logged in", {
      id: "talent-builds-login-required",
      description: "Log in to save and load talent builds.",
    });
  };

  const trigger = floating ? (
    <button
      type="button"
      disabled={isLoading}
      aria-disabled={loggedOut}
      aria-label="My Builds"
      title={loggedOut ? "Log in to save talent builds" : "My Builds"}
      onClick={loggedOut ? notifyLoginRequired : undefined}
      className={cn(
        "fixed bottom-8 left-8 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/90 text-black shadow-lg transition hover:bg-amber-300 disabled:opacity-45",
        loggedOut && "cursor-not-allowed opacity-45 hover:bg-amber-400/90",
      )}
    >
      <BookMarked className="h-5 w-5" />
    </button>
  ) : (
    <button
      type="button"
      disabled={isLoading}
      aria-disabled={loggedOut}
      title={loggedOut ? "Log in to save talent builds" : undefined}
      onClick={loggedOut ? notifyLoginRequired : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-400/20 disabled:opacity-45",
        loggedOut && "cursor-not-allowed opacity-45 hover:border-amber-300/40 hover:bg-amber-400/10",
      )}
    >
      <BookMarked className="h-3.5 w-3.5" />
      My Builds
    </button>
  );

  // Only wire the trigger to the sheet when authenticated; logged out it
  // just shows the toast and must not open the drawer.
  const wiredTrigger = isAuthenticated ? <SheetTrigger asChild>{trigger}</SheetTrigger> : trigger;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Floating trigger is portaled to body to avoid fixed-positioning issues
          inside transformed/overflow ancestors (same as the instance page FABs). */}
      {floating && typeof document !== "undefined"
        ? createPortal(wiredTrigger, document.body)
        : wiredTrigger}
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-sm font-bold text-black">
              {session ? userInitials(session.email) : "?"}
            </span>
            <div className="min-w-0">
              <SheetTitle>My builds</SheetTitle>
              <SheetDescription>Synced to your Chronicle account</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Save current build */}
        <div className="border-b border-white/10 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Save current build
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveCurrent();
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={64}
              placeholder="Build name"
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-300/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!name.trim() || createBuild.isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300/60 bg-amber-300 px-3 py-2 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          </form>
          {atBuildLimit ? (
            <p className="mt-2 text-xs text-red-400">
              Build limit reached ({MAX_SAVED_BUILDS}). Delete a build to save another.
            </p>
          ) : !currentBuild ? (
            <p className="mt-2 text-xs text-zinc-500">No points spent yet</p>
          ) : null}
        </div>

        {/* Build list */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {buildsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading builds…</p>
          ) : buildsQuery.isError ? (
            <p className="text-sm text-zinc-500">Unable to load your builds.</p>
          ) : sortedBuilds.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No saved builds yet. Spend some points and save your first build above.
            </p>
          ) : (
            sortedBuilds.map((build) => {
              const isCurrentClass = build.class_id === selectedClassId;
              const cls = classByID.get(build.class_id);
              return (
                <div
                  key={build.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3",
                    !isCurrentClass && "opacity-50",
                  )}
                >
                  <img
                    src={`/c/icons/class_${cls?.slug ?? "unknown"}.png`}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/c/icons/class_unknown.png"; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{build.name}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {cls?.name ?? `Class ${build.class_id}`} · {buildPointsSummary(build.build)} ·{" "}
                      {new Date(build.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isCurrentClass && (
                      <button
                        type="button"
                        disabled={updateBuild.isPending}
                        title="Overwrite this build with the current talents"
                        className="rounded-md border border-zinc-600 bg-zinc-900/60 px-2 py-1 text-xs font-bold text-zinc-300 transition hover:border-zinc-400 hover:text-white disabled:opacity-45"
                        onClick={() => overwriteBuild(build)}
                      >
                        Overwrite
                      </button>
                    )}
                    <button
                      type="button"
                      title={isCurrentClass ? "Load this build" : `Open in the ${cls?.name ?? ""} calculator`}
                      className="rounded-md border border-amber-300/60 bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-100 transition hover:bg-amber-400/25"
                      onClick={() => loadBuild(build)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${build.name}`}
                      disabled={deleteBuild.isPending}
                      className="rounded-md border border-zinc-700 p-1 text-zinc-400 transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-45"
                      onClick={() => removeBuild(build)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
