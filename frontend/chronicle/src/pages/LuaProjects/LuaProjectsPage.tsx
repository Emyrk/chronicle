import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { FolderOpen, Search } from "lucide-react"
import { useSession } from "@/api/queries"
import { authorPath, getMyAuthor, latestRelease, listProjects, listPublicProjects, type LuaProject } from "./api"
import { AdRailStack } from "@/components/Ads/AdRailStack"
import { AddonTable } from "./AddonCard"
import { AddonWelcome, ClaimAuthorForm, SignInPrompt } from "./AddonWelcome"
import { NewAddonForm } from "./NewAddonForm"
import { button, card, errorMessage } from "./addonUi"

type GallerySort = "popular" | "newest"
const sorts: { id: GallerySort; label: string }[] = [{ id: "popular", label: "Popular" }, { id: "newest", label: "Newest" }]

/** The server lists the most tracked first; "newest" re-sorts by latest release. */
function galleryOrder(projects: LuaProject[], sort: GallerySort, query: string): LuaProject[] {
  const needle = query.trim().toLowerCase()
  const matches = needle ? projects.filter(project => `${project.name} ${project.author ?? ""} ${project.description}`.toLowerCase().includes(needle)) : projects
  if (sort === "popular") return matches
  const released = (project: LuaProject) => latestRelease(project)?.published_at ?? ""
  return [...matches].sort((a, b) => released(b).localeCompare(released(a)))
}

/** /addons: a gallery of released addons, a way to your own at /addons/<author>, and the welcome for newcomers. */
export function LuaProjectsPage() {
  const { data: session, isLoading: sessionLoading } = useSession()
  const authorQuery = useQuery({ queryKey: ["addon-author", session?.user_id], enabled: !!session, queryFn: getMyAuthor })
  const author = authorQuery.data
  const mineQuery = useQuery({ queryKey: ["my-addons", session?.user_id], enabled: !!session, queryFn: listProjects })
  const publicQuery = useQuery({ queryKey: ["public-addons"], queryFn: ({ signal }) => listPublicProjects(signal) })
  const [sort, setSort] = useState<GallerySort>("popular")
  const [query, setQuery] = useState("")
  const shown = useMemo(() => galleryOrder(publicQuery.data ?? [], sort, query), [publicQuery.data, sort, query])
  // Newcomers get the welcome until their first addon exists: sign in, claim a name, then create.
  const welcome = !sessionLoading && (!session || (authorQuery.isSuccess && (author === null || (mineQuery.isSuccess && mineQuery.data.length === 0))))

  return <div className="mx-auto flex w-full max-w-[2080px] items-start justify-center gap-6 px-4 py-10">
    <div className="hidden self-stretch 2xl:block">
      <AdRailStack primaryPlacement="addons-left-rail" secondaryPlacement="addons-left-rail-lower" railLayout="paired-wide" />
    </div>
    <main className="w-full min-w-0 max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-7">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Addons</p>
          <h1 className="text-3xl font-semibold tracking-tight">Addons</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Raid panels for Chronicle, written in Lua by the community. Track an addon to add it to your raid panels, or build your own in the Addon Workshop.</p>
        </div>
        {author && <Link to={authorPath(author)} className={button}><FolderOpen className="size-4" /> My addons</Link>}
      </header>
      {welcome && <AddonWelcome step={!session || !author ? 0 : 1} author={author ?? undefined}>
        {!session ? <SignInPrompt /> : !author ? <ClaimAuthorForm onClaimed={() => void authorQuery.refetch()} /> : <NewAddonForm author={author} first />}
      </AddonWelcome>}
      <section aria-label="Browse addons" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Browse addons</h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm sm:w-64 sm:flex-none">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" type="search" placeholder="Search"
                aria-label="Search addons" value={query} onChange={event => setQuery(event.target.value)} />
            </label>
            <div role="radiogroup" aria-label="Sort addons" className="inline-flex rounded-md border p-0.5 text-sm">
              {sorts.map(option => <button key={option.id} type="button" role="radio" aria-checked={sort === option.id} onClick={() => setSort(option.id)}
                className={`rounded px-3 py-1 ${sort === option.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{option.label}</button>)}
            </div>
          </div>
        </div>
        {publicQuery.isPending ? <div className="space-y-px overflow-hidden rounded-xl border border-border/60" aria-label="Loading addons">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-14 animate-pulse bg-muted/30" />)}</div> :
          publicQuery.isError ? <p role="alert" className="text-sm text-destructive">{errorMessage(publicQuery.error)}</p> :
            publicQuery.data.length === 0 ? <p className={`${card} text-sm text-muted-foreground`}>No addons have been released yet.</p> :
              shown.length === 0 ? <p className={`${card} text-sm text-muted-foreground`}>No addons match “{query.trim()}”.</p> :
                <AddonTable projects={shown} ranked={sort === "popular" && !query.trim()} />}
      </section>
    </main>
    <AdRailStack primaryPlacement="addons-right-rail" secondaryPlacement="addons-right-rail-lower" railLayout="paired-wide" />
  </div>
}
