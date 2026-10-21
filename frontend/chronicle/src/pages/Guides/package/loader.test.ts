import { describe, expect, it } from "vitest"
import {
  GUIDE_PACKAGE_LIMITS,
  GuidePackageError,
  loadGuidePackage,
  loadGuidePackageSync,
  validateGuideManifest,
} from "./index"
import { buildTestZip, jsonEntry, type TestZipEntry } from "./testZip"

const validManifest = {
  manifest_version: 1,
  id: "chronicle.onyxia",
  name: "Onyxia's Lair",
  version: "1.0.0",
  author: "Chronicle",
  api_version: 1,
  entrypoint: "src/main.lua",
  map_id: 249,
  game: "turtle-wow",
  game_version: "1.18.1",
  capabilities: ["ui", "map", "input", "timers"],
  assets: ["assets/map.webp"],
  description: "An interactive strategy guide.",
  encounters: ["Onyxia"],
}

function validEntries(overrides: Partial<typeof validManifest> = {}): TestZipEntry[] {
  return [
    { name: "guide.json", data: jsonEntry({ ...validManifest, ...overrides }) },
    { name: "src/main.lua", data: "return require('src.helper')" },
    { name: "src/helper.lua", data: "return {}" },
    { name: "assets/map.webp", data: new Uint8Array([1, 2, 3]) },
  ]
}

function expectPackageError(action: () => unknown, code: string): void {
  try {
    action()
    throw new Error("expected package validation to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(GuidePackageError)
    expect((error as GuidePackageError).code).toBe(code)
    expect((error as Error).message.length).toBeGreaterThan(10)
  }
}

describe("guide manifest", () => {
  it("validates and freezes the version 1 contract", () => {
    const manifest = validateGuideManifest(validManifest)

    expect(manifest).toEqual(validManifest)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.capabilities)).toBe(true)
    expect(Object.isFrozen(manifest.assets)).toBe(true)
  })

  it.each([
    [{ ...validManifest, manifest_version: 2 }, "MANIFEST_VERSION"],
    [{ ...validManifest, api_version: 2 }, "API_VERSION"],
    [{ ...validManifest, id: "Onyxia" }, "MANIFEST_INVALID"],
    [{ ...validManifest, version: "latest" }, "MANIFEST_INVALID"],
    [{ ...validManifest, author: "" }, "MANIFEST_INVALID"],
    [{ ...validManifest, name: 42 }, "MANIFEST_INVALID"],
    [{ ...validManifest, map_id: 249.5 }, "MANIFEST_INVALID"],
    [{ ...validManifest, game: "Turtle WoW" }, "MANIFEST_INVALID"],
    [{ ...validManifest, entrypoint: "src/main.txt" }, "ENTRYPOINT_INVALID"],
    [{ ...validManifest, capabilities: ["network"] }, "CAPABILITY_UNSUPPORTED"],
    [{ ...validManifest, capabilities: ["ui", "ui"] }, "MANIFEST_INVALID"],
    [{ ...validManifest, assets: ["code.lua"] }, "ASSET_INVALID"],
    [{ ...validManifest, encounters: [""] }, "MANIFEST_INVALID"],
  ])("rejects an invalid manifest", (manifest, code) => {
    expectPackageError(() => validateGuideManifest(manifest), code)
  })
})

describe("guide ZIP loading", () => {
  it("loads the same validated package asynchronously and synchronously", async () => {
    const bytes = buildTestZip(validEntries())
    const [asyncPackage, syncPackage] = await Promise.all([
      loadGuidePackage(bytes),
      Promise.resolve(loadGuidePackageSync(bytes)),
    ])

    for (const guidePackage of [asyncPackage, syncPackage]) {
      expect(guidePackage.manifest).toEqual(validManifest)
      expect(guidePackage.paths).toEqual([
        "assets/map.webp",
        "guide.json",
        "src/helper.lua",
        "src/main.lua",
      ])
      expect(guidePackage.has("src/main.lua")).toBe(true)
      expect(new TextDecoder().decode(guidePackage.read("src/main.lua"))).toContain("require")
      expect(guidePackage.readText("src/helper.lua")).toBe("return {}")
    }
  })

  it("does not expose mutable archive storage", () => {
    const guidePackage = loadGuidePackageSync(buildTestZip(validEntries()))
    const firstRead = guidePackage.read("assets/map.webp")
    firstRead[0] = 99

    expect(guidePackage.read("assets/map.webp")).toEqual(new Uint8Array([1, 2, 3]))
    expect(Object.isFrozen(guidePackage)).toBe(true)
    expect(Object.isFrozen(guidePackage.paths)).toBe(true)
  })

  it("requires a root guide.json and an existing Lua entrypoint", () => {
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([{ name: "nested/guide.json", data: jsonEntry(validManifest) }])),
      "MANIFEST_MISSING",
    )
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip(validEntries({ entrypoint: "missing.lua" }))),
      "ENTRYPOINT_MISSING",
    )
  })

  it("requires declared assets and rejects undeclared non-Lua files", () => {
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip(validEntries({ assets: ["missing.png"] }))),
      "ASSET_MISSING",
    )
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([...validEntries(), { name: "notes.txt", data: "nope" }])),
      "ASSET_UNDECLARED",
    )
  })

  it.each([
    ["/absolute.lua", "PATH_ABSOLUTE"],
    ["C:/drive.lua", "PATH_ABSOLUTE"],
    ["src\\main.lua", "PATH_BACKSLASH"],
    ["src\0main.lua", "PATH_NUL"],
    ["src/./main.lua", "PATH_DOT_SEGMENT"],
    ["src/../main.lua", "PATH_DOT_SEGMENT"],
    ["src//main.lua", "PATH_EMPTY_SEGMENT"],
    ["assets/", "ENTRY_DIRECTORY"],
  ])("rejects unsafe ZIP path %s", (name, code) => {
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([...validEntries(), { name, data: "x" }])),
      code,
    )
  })

  it("rejects symbolic link entries from Unix ZIP archives", () => {
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([
        ...validEntries(),
        { name: "assets/link", data: "assets/map.webp", os: 3, attrs: 0o120777 << 16 },
      ])),
      "ENTRY_SYMLINK",
    )
  })

  it("detects duplicate raw and Unicode-normalized ZIP paths", () => {
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([...validEntries(), { name: "src/main.lua", data: "second" }])),
      "ENTRY_DUPLICATE",
    )
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([
        ...validEntries(),
        { name: "assets/caf\u00e9.png", data: "one" },
        { name: "assets/cafe\u0301.png", data: "two" },
      ])),
      "ENTRY_DUPLICATE",
    )
  })

  it("enforces archive, per-file, expanded, file-count, and Lua limits", () => {
    expectPackageError(
      () => loadGuidePackageSync(new Uint8Array(GUIDE_PACKAGE_LIMITS.archiveBytes + 1)),
      "ARCHIVE_TOO_LARGE",
    )
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([
        ...validEntries(),
        { name: "assets/large.bin", data: new Uint8Array(GUIDE_PACKAGE_LIMITS.fileBytes + 1), compress: true },
      ])),
      "FILE_TOO_LARGE",
    )
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([
        { name: "guide.json", data: jsonEntry({ ...validManifest, assets: [] }) },
        { name: "src/main.lua", data: new Uint8Array(GUIDE_PACKAGE_LIMITS.luaBytes + 1), compress: true },
      ])),
      "LUA_TOO_LARGE",
    )

    const manyFiles: TestZipEntry[] = [
      { name: "guide.json", data: jsonEntry({ ...validManifest, assets: [] }) },
      { name: "src/main.lua", data: "return {}" },
    ]
    for (let index = manyFiles.length; index <= GUIDE_PACKAGE_LIMITS.files; index += 1) {
      manyFiles.push({ name: `src/module-${index}.lua`, data: "" })
    }
    expectPackageError(() => loadGuidePackageSync(buildTestZip(manyFiles)), "TOO_MANY_FILES")

    const expandedAssets = Array.from({ length: 9 }, (_, index) => `assets/padding-${index}.bin`)
    const expandedEntries: TestZipEntry[] = [
      { name: "guide.json", data: jsonEntry({ ...validManifest, assets: expandedAssets }) },
      { name: "src/main.lua", data: "return {}" },
    ]
    for (const asset of expandedAssets) {
      expandedEntries.push({
        name: asset,
        data: new Uint8Array(2 * 1024 * 1024),
        compress: true,
      })
    }
    expectPackageError(() => loadGuidePackageSync(buildTestZip(expandedEntries)), "EXPANDED_TOO_LARGE")
  })

  it("wraps malformed ZIP and JSON failures in typed actionable errors", () => {
    expectPackageError(() => loadGuidePackageSync(new Uint8Array([1, 2, 3])), "ZIP_INVALID")
    expectPackageError(
      () => loadGuidePackageSync(buildTestZip([{ name: "guide.json", data: "{" }])),
      "MANIFEST_JSON_INVALID",
    )
  })
})
