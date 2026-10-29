import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getProjectPage, getProjectPageByPath } from "./api"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Legacy ID links may arrive as /modules/<id>[/edit] after redirects; author names never look like IDs, so these can be told apart. */
export function isModuleId(value: string | undefined): value is string {
  return !!value && uuid.test(value)
}

/** Loads the module named by the route: /modules/id/<id>[/edit] or /modules/<author>/<slug>[/edit]. */
export function useModulePage() {
  const { projectId, author, slug } = useParams<{ projectId?: string; author?: string; slug?: string }>()
  return useQuery({
    queryKey: projectId ? ["module-page", "id", projectId] : ["module-page", "path", author, slug],
    enabled: !!projectId || (!!author && !!slug),
    retry: false,
    queryFn: ({ signal }) => projectId ? getProjectPage(projectId, signal) : getProjectPageByPath(author!, slug!, signal),
  })
}
