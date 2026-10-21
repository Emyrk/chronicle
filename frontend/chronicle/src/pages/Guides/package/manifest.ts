import { packageError } from "./errors"
import { normalizePackagePath } from "./paths"

export const GUIDE_CAPABILITIES = ["ui", "map", "input", "timers"] as const
export type GuideCapability = (typeof GUIDE_CAPABILITIES)[number]

export type GuideManifestV1 = Readonly<{
  manifest_version: 1
  id: string
  name: string
  version: string
  author: string
  api_version: 1
  entrypoint: string
  map_id: number
  game: string
  game_version?: string
  capabilities: readonly GuideCapability[]
  assets: readonly string[]
  description?: string
  encounters?: readonly string[]
}>

const capabilitySet: ReadonlySet<string> = new Set(GUIDE_CAPABILITIES)
const PACKAGE_ID = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/
const PACKAGE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw packageError("MANIFEST_INVALID", "guide.json must contain a JSON object.")
  }
  return value as Record<string, unknown>
}

function requireNonEmptyString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw packageError("MANIFEST_INVALID", `guide.json field ${JSON.stringify(field)} must be a non-empty string.`)
  }
  return value
}

function optionalNonEmptyString(record: Record<string, unknown>, field: string): string | undefined {
  if (record[field] === undefined) {
    return undefined
  }
  return requireNonEmptyString(record, field)
}

function requireStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw packageError("MANIFEST_INVALID", `guide.json field ${JSON.stringify(field)} must be an array of strings.`)
  }
  return value
}

function uniqueNonEmptyStrings(values: readonly string[], field: string): readonly string[] {
  const seen = new Set<string>()
  for (const value of values) {
    if (value.trim().length === 0 || seen.has(value)) {
      throw packageError("MANIFEST_INVALID", `guide.json field ${JSON.stringify(field)} must contain unique non-empty strings.`)
    }
    seen.add(value)
  }
  return Object.freeze([...values])
}

export function validateGuideManifest(value: unknown): GuideManifestV1 {
  const record = requireRecord(value)
  if (record.manifest_version !== 1) {
    throw packageError(
      "MANIFEST_VERSION",
      `Unsupported guide manifest version ${JSON.stringify(record.manifest_version)}; expected manifest_version 1.`,
    )
  }
  if (record.api_version !== 1) {
    throw packageError("API_VERSION", `Unsupported guide API version ${JSON.stringify(record.api_version)}; expected api_version 1.`)
  }

  const id = requireNonEmptyString(record, "id")
  if (!PACKAGE_ID.test(id)) {
    throw packageError("MANIFEST_INVALID", "guide.json id must be a lowercase dot-separated package identifier.")
  }
  const name = requireNonEmptyString(record, "name")
  const version = requireNonEmptyString(record, "version")
  if (!PACKAGE_VERSION.test(version)) {
    throw packageError("MANIFEST_INVALID", "guide.json version must use semantic version form, such as 1.0.0.")
  }
  const author = requireNonEmptyString(record, "author")
  const entrypoint = normalizePackagePath(requireNonEmptyString(record, "entrypoint"))
  if (!entrypoint.toLowerCase().endsWith(".lua")) {
    throw packageError("ENTRYPOINT_INVALID", `Guide entrypoint must be a .lua file, received ${JSON.stringify(entrypoint)}.`, {
      path: entrypoint,
    })
  }
  if (!Number.isInteger(record.map_id) || (record.map_id as number) < 0) {
    throw packageError("MANIFEST_INVALID", "guide.json map_id must be a non-negative integer.")
  }
  const mapId = record.map_id as number
  const game = requireNonEmptyString(record, "game")
  if (!GAME_ID.test(game)) {
    throw packageError("MANIFEST_INVALID", "guide.json game must be a lowercase hyphen-separated identifier.")
  }
  const gameVersion = optionalNonEmptyString(record, "game_version")
  const description = optionalNonEmptyString(record, "description")
  const encounters = record.encounters === undefined
    ? undefined
    : uniqueNonEmptyStrings(requireStringArray(record, "encounters"), "encounters")

  const capabilityValues = requireStringArray(record, "capabilities")
  const capabilities: GuideCapability[] = []
  const seenCapabilities = new Set<string>()
  for (const capability of capabilityValues) {
    if (!capabilitySet.has(capability)) {
      throw packageError(
        "CAPABILITY_UNSUPPORTED",
        `Guide requires unsupported capability ${JSON.stringify(capability)}; supported capabilities are ${GUIDE_CAPABILITIES.join(", ")}.`,
      )
    }
    if (seenCapabilities.has(capability)) {
      throw packageError("MANIFEST_INVALID", `Guide capability ${JSON.stringify(capability)} is declared more than once.`)
    }
    seenCapabilities.add(capability)
    capabilities.push(capability as GuideCapability)
  }

  const assets: string[] = []
  const seenAssets = new Set<string>()
  for (const assetValue of requireStringArray(record, "assets")) {
    const asset = normalizePackagePath(assetValue)
    if (asset.toLowerCase().endsWith(".lua") || asset === "guide.json") {
      throw packageError("ASSET_INVALID", `Declared asset must be a non-Lua package file, received ${JSON.stringify(asset)}.`, {
        path: asset,
      })
    }
    if (seenAssets.has(asset)) {
      throw packageError("MANIFEST_INVALID", `Guide asset ${JSON.stringify(asset)} is declared more than once.`, { path: asset })
    }
    seenAssets.add(asset)
    assets.push(asset)
  }

  return Object.freeze({
    manifest_version: 1,
    id,
    name,
    version,
    author,
    api_version: 1,
    entrypoint,
    map_id: mapId,
    game,
    ...(gameVersion === undefined ? {} : { game_version: gameVersion }),
    capabilities: Object.freeze(capabilities),
    assets: Object.freeze(assets),
    ...(description === undefined ? {} : { description }),
    ...(encounters === undefined ? {} : { encounters }),
  })
}
