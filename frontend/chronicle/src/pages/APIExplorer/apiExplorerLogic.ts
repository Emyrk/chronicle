export type HTTPMethod = "get" | "post" | "put" | "patch" | "delete"

export type OpenAPIParameter = {
  name: string
  in: "path" | "query"
  description?: string
  required?: boolean
  schema: {
    type: string
    format?: string
  }
  example?: unknown
}

export type OpenAPIOperation = {
  tags?: string[]
  summary: string
  description?: string
  parameters?: OpenAPIParameter[]
  responses: Record<string, {
    description: string
    content?: Record<string, { example?: unknown }>
  }>
}

export type OpenAPIDocument = {
  openapi: string
  info: {
    title: string
    description: string
    version: string
  }
  servers: Array<{ url: string }>
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, Partial<Record<HTTPMethod, OpenAPIOperation>>>
}

export type RateLimitStatus = {
  limit: number
  remaining: number
}

export function rateLimitStatusFromHeaders(headers: Headers): RateLimitStatus {
  const limit = Number(headers.get("RateLimit-Limit"))
  const remaining = Number(headers.get("RateLimit-Remaining"))

  if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(remaining) || remaining < 0) {
    throw new Error("Health response did not include valid rate-limit headers")
  }

  return { limit, remaining }
}

export type APIEndpoint = {
  method: HTTPMethod
  path: string
  operation: OpenAPIOperation
}

const METHODS: HTTPMethod[] = ["get", "post", "put", "patch", "delete"]

export function endpointsFromDocument(document: OpenAPIDocument): APIEndpoint[] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    METHODS.flatMap((method) => {
      const operation = pathItem[method]
      return operation ? [{ method, path, operation }] : []
    }),
  )
}

export type APIEndpointGroup = {
  name: string
  description?: string
  endpoints: APIEndpoint[]
}

export function endpointGroupsFromDocument(document: OpenAPIDocument): APIEndpointGroup[] {
  const endpoints = endpointsFromDocument(document)
  const tagDetails = new Map((document.tags ?? []).map((tag) => [tag.name, tag]))
  const grouped = new Map<string, APIEndpoint[]>()

  for (const endpoint of endpoints) {
    const tag = endpoint.operation.tags?.[0] ?? "Other"
    grouped.set(tag, [...(grouped.get(tag) ?? []), endpoint])
  }

  const orderedTags = [
    ...(document.tags ?? []).map((tag) => tag.name),
    ...Array.from(grouped.keys()).filter((tag) => !tagDetails.has(tag)),
  ]

  return orderedTags.flatMap((name) => {
    const groupEndpoints = grouped.get(name)
    if (!groupEndpoints?.length) return []
    return [{ name, description: tagDetails.get(name)?.description, endpoints: groupEndpoints }]
  })
}

export function parameterKey(parameter: OpenAPIParameter): string {
  return `${parameter.in}:${parameter.name}`
}

export function buildRequestURL(
  server: string,
  path: string,
  parameters: OpenAPIParameter[],
  values: Record<string, string>,
): string {
  let resolvedPath = path
  const query = new URLSearchParams()

  for (const parameter of parameters) {
    const value = values[parameterKey(parameter)] ?? ""
    if (!value) continue

    if (parameter.in === "path") {
      resolvedPath = resolvedPath.replace(`{${parameter.name}}`, encodeURIComponent(value))
    } else {
      query.set(parameter.name, value)
    }
  }

  const base = server.endsWith("/") ? server.slice(0, -1) : server
  const queryString = query.toString()
  return `${base}${resolvedPath}${queryString ? `?${queryString}` : ""}`
}
