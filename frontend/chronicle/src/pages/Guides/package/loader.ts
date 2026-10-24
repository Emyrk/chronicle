import { unzip, unzipSync, type Unzipped } from "fflate"
import { inspectArchive, normalizeExtractedFiles, type ArchiveIndex } from "./archive"
import { GuidePackageError, packageError } from "./errors"
import { validateGuideManifest, type GuideManifestV1 } from "./manifest"
import { normalizePackagePath } from "./paths"

export type GuidePackageBytes = Uint8Array | ArrayBuffer

export type GuidePackageFiles = Readonly<{
  paths: readonly string[]
  has(path: string): boolean
  read(path: string): Uint8Array
  readText(path: string): string
}>

export type ValidatedGuidePackage = Readonly<{
  manifest: GuideManifestV1
  files: GuidePackageFiles
  paths: readonly string[]
  has(path: string): boolean
  read(path: string): Uint8Array
  readText(path: string): string
}>

function copyBytes(bytes: GuidePackageBytes): Uint8Array {
  return bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0))
}

function extractAsync(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    try {
      unzip(bytes, (error, files) => {
        if (error) {
          reject(packageError("ZIP_INVALID", `Could not expand guide ZIP: ${error.message}`, { cause: error }))
          return
        }
        resolve(files)
      })
    } catch (error) {
      reject(packageError("ZIP_INVALID", "Could not expand guide ZIP.", { cause: error }))
    }
  })
}

function extractSync(bytes: Uint8Array): Unzipped {
  try {
    return unzipSync(bytes)
  } catch (error) {
    throw packageError(
      "ZIP_INVALID",
      `Could not expand guide ZIP${error instanceof Error ? `: ${error.message}` : "."}`,
      { cause: error },
    )
  }
}

function decodeText(data: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch (error) {
    throw packageError("FILE_TEXT_INVALID", `Package file ${JSON.stringify(path)} is not valid UTF-8 text.`, {
      cause: error,
      path,
    })
  }
}

function createFileApi(storage: ReadonlyMap<string, Uint8Array>): GuidePackageFiles {
  const paths = Object.freeze([...storage.keys()].sort())

  const has = (requestedPath: string): boolean => storage.has(normalizePackagePath(requestedPath))
  const read = (requestedPath: string): Uint8Array => {
    const path = normalizePackagePath(requestedPath)
    const data = storage.get(path)
    if (!data) {
      throw packageError("FILE_MISSING", `Package file does not exist: ${JSON.stringify(path)}.`, { path })
    }
    return data.slice()
  }
  const readText = (requestedPath: string): string => {
    const path = normalizePackagePath(requestedPath)
    const data = storage.get(path)
    if (!data) {
      throw packageError("FILE_MISSING", `Package file does not exist: ${JSON.stringify(path)}.`, { path })
    }
    return decodeText(data, path)
  }

  return Object.freeze({ paths, has, read, readText })
}

function parseManifest(files: ReadonlyMap<string, Uint8Array>): GuideManifestV1 {
  const manifestBytes = files.get("guide.json")
  if (!manifestBytes) {
    throw packageError("MANIFEST_MISSING", "Guide ZIP must contain guide.json at the archive root.")
  }

  let value: unknown
  try {
    value = JSON.parse(decodeText(manifestBytes, "guide.json"))
  } catch (error) {
    if (error instanceof GuidePackageError) {
      throw packageError("MANIFEST_JSON_INVALID", `guide.json could not be decoded: ${error.message}`, { cause: error })
    }
    throw packageError(
      "MANIFEST_JSON_INVALID",
      `guide.json is not valid JSON${error instanceof Error ? `: ${error.message}` : "."}`,
      { cause: error },
    )
  }
  return validateGuideManifest(value)
}

function validateManifestFiles(manifest: GuideManifestV1, files: ReadonlyMap<string, Uint8Array>): void {
  if (!files.has(manifest.entrypoint)) {
    throw packageError(
      "ENTRYPOINT_MISSING",
      `Guide entrypoint does not exist in the ZIP: ${JSON.stringify(manifest.entrypoint)}.`,
      { path: manifest.entrypoint },
    )
  }

  const assets = new Set(manifest.assets)
  const eventStreams = new Set((manifest.event_streams ?? []).map((stream) => stream.path))
  for (const asset of assets) {
    if (!files.has(asset)) {
      throw packageError("ASSET_MISSING", `Declared guide asset does not exist in the ZIP: ${JSON.stringify(asset)}.`, {
        path: asset,
      })
    }
  }

  for (const stream of eventStreams) {
    if (!files.has(stream)) {
      throw packageError("ASSET_MISSING", `Declared guide event stream does not exist in the ZIP: ${JSON.stringify(stream)}.`, { path: stream })
    }
  }

  for (const path of files.keys()) {
    if (path !== "guide.json" && !path.toLowerCase().endsWith(".lua") && !assets.has(path) && !eventStreams.has(path)) {
      throw packageError(
        "ASSET_UNDECLARED",
        `Package file ${JSON.stringify(path)} is not Lua source and is not declared in guide.json assets or event_streams.`,
        { path },
      )
    }
  }
}

function buildPackage(index: ArchiveIndex, unzipped: Unzipped): ValidatedGuidePackage {
  const storage = normalizeExtractedFiles(index, unzipped)
  const manifest = parseManifest(storage)
  validateManifestFiles(manifest, storage)
  const files = createFileApi(storage)

  return Object.freeze({
    manifest,
    files,
    paths: files.paths,
    has: files.has,
    read: files.read,
    readText: files.readText,
  })
}

export async function loadGuidePackage(bytes: GuidePackageBytes): Promise<ValidatedGuidePackage> {
  const archiveBytes = copyBytes(bytes)
  const index = inspectArchive(archiveBytes)
  return buildPackage(index, await extractAsync(archiveBytes))
}

export function loadGuidePackageSync(bytes: GuidePackageBytes): ValidatedGuidePackage {
  const archiveBytes = copyBytes(bytes)
  const index = inspectArchive(archiveBytes)
  return buildPackage(index, extractSync(archiveBytes))
}
