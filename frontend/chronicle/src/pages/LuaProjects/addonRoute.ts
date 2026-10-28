import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getProjectPage, getProjectPageByPath } from "./api"

/** Loads the addon named by the route: /addons/<id>[/edit] or /addons/<author>/<slug>[/edit]. */
export function useAddonPage() {
  const { projectId, author, slug } = useParams<{ projectId?: string; author?: string; slug?: string }>()
  return useQuery({
    queryKey: projectId ? ["addon-page", "id", projectId] : ["addon-page", "path", author, slug],
    enabled: !!projectId || (!!author && !!slug),
    retry: false,
    queryFn: ({ signal }) => projectId ? getProjectPage(projectId, signal) : getProjectPageByPath(author!, slug!, signal),
  })
}
