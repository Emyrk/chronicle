import type { InferenceClientPageContext, InferenceClientSkillResponse, InferenceClientSkillsResponse } from "@/api/typesGenerated"
import type { InferenceCapabilityDescriptor, InferenceCapabilityRegistration, InferenceRuntimeClient } from "../runtime"
import type { BrowserPage } from "./browserTools"

/** Select the same specialized assistant as the page UI, otherwise site help. */
export function guidanceCapability(capabilities: readonly InferenceCapabilityDescriptor[]): string | undefined {
  return ["lua-editor", "instance-page", "search-page"].find(id => capabilities.some(capability => capability.id === id))
}

/** Content and schemas are Chronicle-owned; this adapter only supplies live page context. */
export function pageGuidanceRegistration(
  page: BrowserPage,
  getRuntime: () => InferenceRuntimeClient,
): InferenceCapabilityRegistration {
  const available = () => (getRuntime().getAvailableTools?.() ?? []).filter(item => item.capability.id !== "page-guidance")
  const fetchGuidance = async <T>(resource: string, signal: AbortSignal, tools = available()): Promise<T> => {
    const capability = guidanceCapability(tools.map(item => item.capability))
    const query = capability ? `?capability_id=${encodeURIComponent(capability)}` : ""
    const response = await fetch(`/api/v1/inference/client-tools/${resource}${query}`, {
      credentials: "same-origin", cache: "no-store", signal,
    })
    if (!response.ok) throw new Error(`Chronicle page guidance unavailable (${response.status})`)
    return response.json()
  }
  return {
    id: "page-guidance", version: 1,
    scope: { type: "page", id: page.generation },
    tools: {
      gen_page_context: async (_args, { signal }) => {
        const tools = available()
        const content = await fetchGuidance<InferenceClientPageContext>("context", signal, tools)
        return { ...content, page, capabilities: tools.map(item => item.capability), available_tools: tools.flatMap(item => item.names) }
      },
      list_skill: (_args, { signal }) => fetchGuidance<InferenceClientSkillsResponse>("skills", signal),
      read_skill: (args, { signal }) => {
        const id = (args as { skill_id?: unknown } | null)?.skill_id
        if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100) throw new Error("Invalid skill ID")
        return fetchGuidance<InferenceClientSkillResponse>(`skills/${encodeURIComponent(id)}`, signal)
      },
    },
  }
}
