import { describe, expect, it } from "vitest"
import { buildRequestURL, endpointsFromDocument, type OpenAPIDocument } from "./apiExplorer"

describe("API explorer helpers", () => {
  it("extracts documented operations", () => {
    const document: OpenAPIDocument = {
      openapi: "3.1.0",
      info: { title: "API", description: "", version: "1" },
      servers: [{ url: "/api/external/v1" }],
      paths: {
        "/health": {
          get: { summary: "Health", responses: { "200": { description: "OK" } } },
        },
      },
    }

    expect(endpointsFromDocument(document)).toEqual([
      expect.objectContaining({ method: "get", path: "/health" }),
    ])
  })

  it("builds path and query parameters", () => {
    const url = buildRequestURL(
      "/api/external/v1",
      "/characters/{id}",
      [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      { "path:id": "A B", "query:limit": "25" },
    )

    expect(url).toBe("/api/external/v1/characters/A%20B?limit=25")
  })
})
