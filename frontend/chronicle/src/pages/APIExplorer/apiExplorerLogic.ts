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
  paths: Record<string, Partial<Record<HTTPMethod, OpenAPIOperation>>>
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
