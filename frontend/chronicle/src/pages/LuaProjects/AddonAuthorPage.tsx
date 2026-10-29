import { Link, Navigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Plus } from "lucide-react"
import { useSession } from "@/api/queries"
import { getAuthorPage, getMyAuthor, listProjects } from "./api"
import { AddonList } from "./AddonCard"
import { isAddonId } from "./addonRoute"
import { card, errorMessage, primaryButton } from "./addonUi"

/** /addons/<author>: that author's addons. On your own page, also the addons shared with you and a button to create one. */
export function AddonAuthorPage() {
  const { author = "" } = useParams<{ author: string }>()
  const { data: session } = useSession()
  const page = useQuery({ queryKey: ["addon-author-page", author], enabled: !isAddonId(author), retry: false, queryFn: ({ signal }) => getAuthorPage(author, signal) })
  const myAuthor = useQuery({ queryKey: ["addon-author", session?.user_id], enabled: !!session, queryFn: getMyAuthor })
  const mine = !!session && myAuthor.data === author
  const shared = useQuery({ queryKey: ["my-addons", session?.user_id], enabled: mine, queryFn: listProjects,
    select: projects => projects.filter(project => project.owner_id !== session?.user_id) })

  // Old addon links were /addons/<id>.
  if (isAddonId(author)) return <Navigate to={`/addons/id/${author}`} replace />

  const projects = page.data?.projects ?? []
  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/addons"><ArrowLeft className="size-4" /> All addons</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-7">
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Addon author</p>
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{author}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{mine ? "Your addons. Open one to edit it in the Addon Workshop or tag a release." : `Addons by ${author}.`}</p>
      </div>
      {mine && <Link to="/addons/new" className={primaryButton}><Plus className="size-4" /> New addon</Link>}
    </header>
    {page.isError ? <p role="alert" className="text-sm text-destructive">{errorMessage(page.error)}</p> :
      <div className="space-y-8">
        <section aria-label={mine ? "Your addons" : "Addons"} className="space-y-3">
          {mine && <h2 className="text-lg font-semibold">Your addons</h2>}
          {page.isPending ? <p className="text-sm text-muted-foreground">Loading addons…</p> :
            projects.length === 0 ? <p className={`${card} text-sm text-muted-foreground`}>{mine ? "No addons yet. Create one to begin." : "No addons yet."}</p> :
              <AddonList projects={projects} />}
        </section>
        {mine && !!shared.data?.length && <section aria-label="Shared with you" className="space-y-3">
          <h2 className="text-lg font-semibold">Shared with you</h2>
          <AddonList projects={shared.data} shared />
        </section>}
      </div>}
  </main>
}
