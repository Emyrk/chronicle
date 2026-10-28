import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getProjectPage, getProjectPageByPath } from "./api"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Old addon links were /addons/<id>[/edit]; author names never look like IDs, so these can be told apart. */
export function isAddonId(value: string | undefined): value is string {
  return !!value && uuid.test(value)
}

/** Loads the addon named by the route: /addons/id/<id>[/edit] or /addons/<author>/<slug>[/edit]. */
export function useAddonPage() {
  const { projectId, author, slug } = useParams<{ projectId?: string; author?: string; slug?: string }>()
  return useQuery({
    queryKey: projectId ? ["addon-page", "id", projectId] : ["addon-page", "path", author, slug],
    enabled: !!projectId || (!!author && !!slug),
    retry: false,
    queryFn: ({ signal }) => projectId ? getProjectPage(projectId, signal) : getProjectPageByPath(author!, slug!, signal),
  })
}
