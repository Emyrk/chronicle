import { describe, expect, it } from "vitest"
import { buildRequestURL, endpointGroupsFromDocument, endpointsFromDocument, type OpenAPIDocument } from "./apiExplorerLogic"

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

  it("groups endpoints by documented tag order", () => {
    const document: OpenAPIDocument = {
      openapi: "3.1.0",
      info: { title: "API", description: "", version: "1" },
      servers: [{ url: "/api/external/v1" }],
      tags: [
        { name: "Explore", description: "Discovery endpoints" },
        { name: "Raid Instance" },
      ],
      paths: {
        "/raidlogs/instances/{instance_id}": {
          get: { tags: ["Raid Instance"], summary: "Instance", responses: {} },
        },
        "/raidlogs/recent": {
          get: { tags: ["Explore"], summary: "Recent raids", responses: {} },
        },
        "/leaderboards/speedruns": {
          get: { tags: ["Explore"], summary: "Speedruns", responses: {} },
        },
      },
    }

    expect(endpointGroupsFromDocument(document)).toEqual([
      {
        name: "Explore",
        description: "Discovery endpoints",
        endpoints: [
          expect.objectContaining({ path: "/raidlogs/recent" }),
          expect.objectContaining({ path: "/leaderboards/speedruns" }),
        ],
      },
      {
        name: "Raid Instance",
        endpoints: [expect.objectContaining({ path: "/raidlogs/instances/{instance_id}" })],
      },
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
