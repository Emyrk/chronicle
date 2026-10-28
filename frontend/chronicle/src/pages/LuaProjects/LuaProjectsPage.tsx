import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { FolderOpen } from "lucide-react"
import { useSession } from "@/api/queries"
import { authorPath, getMyAuthor, listProjects, listPublicProjects } from "./api"
import { AddonCard } from "./AddonCard"
import { AddonWelcome, ClaimAuthorForm, SignInPrompt } from "./AddonWelcome"
import { NewAddonForm } from "./NewAddonForm"
import { button, card, errorMessage } from "./addonUi"

/** /addons: released addons for everyone, a way to your own at /addons/<author>, and the welcome for newcomers. */
export function LuaProjectsPage() {
  const { data: session, isLoading: sessionLoading } = useSession()
  const authorQuery = useQuery({ queryKey: ["addon-author", session?.user_id], enabled: !!session, queryFn: getMyAuthor })
  const author = authorQuery.data
  const mineQuery = useQuery({ queryKey: ["my-addons", session?.user_id], enabled: !!session, queryFn: listProjects })
  const publicQuery = useQuery({ queryKey: ["public-addons"], queryFn: ({ signal }) => listPublicProjects(signal) })
  // Newcomers get the welcome until their first addon exists: sign in, claim a name, then create.
  const welcome = !sessionLoading && (!session || (authorQuery.isSuccess && (author === null || (mineQuery.isSuccess && mineQuery.data.length === 0))))

  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-7">
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Addons</p>
        <h1 className="text-3xl font-semibold tracking-tight">Addons</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Raid panels for Chronicle, written in Lua by the community. Add a released addon to your raid panels, or build your own in the Addon Workshop.</p>
      </div>
      {author && <Link to={authorPath(author)} className={button}><FolderOpen className="size-4" /> My addons</Link>}
    </header>
    {welcome && <AddonWelcome step={!session || !author ? 0 : 1} author={author ?? undefined}>
      {!session ? <SignInPrompt /> : !author ? <ClaimAuthorForm onClaimed={() => void authorQuery.refetch()} /> : <NewAddonForm author={author} first />}
    </AddonWelcome>}
    <section aria-label="Browse addons" className="space-y-3">
      <h2 className="text-lg font-semibold">Browse addons</h2>
      {publicQuery.isPending ? <p className="text-sm text-muted-foreground">Loading addons…</p> :
        publicQuery.isError ? <p role="alert" className="text-sm text-destructive">{errorMessage(publicQuery.error)}</p> :
          publicQuery.data.length === 0 ? <p className={`${card} text-sm text-muted-foreground`}>No addons have been released yet.</p> :
            <div className="grid gap-3 md:grid-cols-2">{publicQuery.data.map(project => <AddonCard key={project.id} project={project} showAuthor />)}</div>}
    </section>
  </main>
}
