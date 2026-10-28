import { strFromU8, type Unzipped } from "fflate"
import { GuidePackageError, packageError } from "./errors"
import { GUIDE_PACKAGE_LIMITS } from "./limits"
import { normalizePackagePath } from "./paths"

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const MAX_END_RECORD_SEARCH = 65_557

type ArchiveEntry = Readonly<{
  archivePath: string
  path: string
  uncompressedSize: number
}>

export type ArchiveIndex = Readonly<{
  entries: readonly ArchiveEntry[]
}>

function requireRange(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw packageError("ZIP_INVALID", "ZIP archive contains a truncated or out-of-range record.")
  }
}

function uint16(view: DataView, offset: number): number {
  requireRange(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset, 2)
  return view.getUint16(offset, true)
}

function uint32(view: DataView, offset: number): number {
  requireRange(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset, 4)
  return view.getUint32(offset, true)
}

function findEndRecord(bytes: Uint8Array, view: DataView): number {
  const firstPossibleOffset = Math.max(0, bytes.length - MAX_END_RECORD_SEARCH)
  for (let offset = bytes.length - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (
      uint32(view, offset) === END_OF_CENTRAL_DIRECTORY
      && offset + 22 + uint16(view, offset + 20) === bytes.length
    ) {
      return offset
    }
  }
  throw packageError("ZIP_INVALID", "Input is not a valid ZIP archive: end-of-central-directory record was not found.")
}

function decodeEntryName(bytes: Uint8Array, utf8: boolean): string {
  try {
    return strFromU8(bytes, !utf8)
  } catch (error) {
    throw packageError("ZIP_INVALID", "ZIP entry name is not valid text.", { cause: error })
  }
}

export function inspectArchive(bytes: Uint8Array): ArchiveIndex {
  if (bytes.length > GUIDE_PACKAGE_LIMITS.archiveBytes) {
    throw packageError(
      "ARCHIVE_TOO_LARGE",
      `Guide ZIP is ${bytes.length} bytes; the archive limit is ${GUIDE_PACKAGE_LIMITS.archiveBytes} bytes.`,
    )
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let endOffset: number
  try {
    endOffset = findEndRecord(bytes, view)
  } catch (error) {
    if (error instanceof GuidePackageError) {
      throw error
    }
    throw packageError("ZIP_INVALID", "Input is not a valid ZIP archive.", { cause: error })
  }

  const diskNumber = uint16(view, endOffset + 4)
  const centralDirectoryDisk = uint16(view, endOffset + 6)
  const entriesOnDisk = uint16(view, endOffset + 8)
  const entryCount = uint16(view, endOffset + 10)
  const centralDirectorySize = uint32(view, endOffset + 12)
  const centralDirectoryOffset = uint32(view, endOffset + 16)
  const commentLength = uint16(view, endOffset + 20)
  requireRange(bytes, endOffset, 22 + commentLength)
  if (endOffset + 22 + commentLength !== bytes.length) {
    throw packageError("ZIP_INVALID", "ZIP archive contains unexpected trailing bytes.")
  }

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw packageError("ZIP_UNSUPPORTED", "Multi-disk ZIP archives are not supported for guide packages.")
  }
  if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw packageError("ZIP_UNSUPPORTED", "ZIP64 archives are not supported for guide packages.")
  }
  if (entryCount > GUIDE_PACKAGE_LIMITS.files) {
    throw packageError(
      "TOO_MANY_FILES",
      `Guide ZIP contains ${entryCount} entries; the limit is ${GUIDE_PACKAGE_LIMITS.files}.`,
    )
  }
  requireRange(bytes, centralDirectoryOffset, centralDirectorySize)
  if (centralDirectoryOffset + centralDirectorySize > endOffset) {
    throw packageError("ZIP_INVALID", "ZIP central directory overlaps the archive end record.")
  }

  const entries: ArchiveEntry[] = []
  const seenPaths = new Set<string>()
  let totalExpandedBytes = 0
  let totalLuaBytes = 0
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    requireRange(bytes, offset, 46)
    if (uint32(view, offset) !== CENTRAL_DIRECTORY_ENTRY) {
      throw packageError("ZIP_INVALID", `ZIP central directory entry ${index + 1} has an invalid signature.`)
    }

    const creatorSystem = bytes[offset + 5]
    const flags = uint16(view, offset + 8)
    const compression = uint16(view, offset + 10)
    const uncompressedSize = uint32(view, offset + 24)
    const nameLength = uint16(view, offset + 28)
    const extraLength = uint16(view, offset + 30)
    const entryCommentLength = uint16(view, offset + 32)
    const diskStart = uint16(view, offset + 34)
    const externalAttributes = uint32(view, offset + 38)
    const recordLength = 46 + nameLength + extraLength + entryCommentLength
    requireRange(bytes, offset, recordLength)

    if (diskStart !== 0) {
      throw packageError("ZIP_UNSUPPORTED", "Multi-disk ZIP entries are not supported for guide packages.")
    }

    const archivePath = decodeEntryName(bytes.subarray(offset + 46, offset + 46 + nameLength), (flags & 0x0800) !== 0)
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw packageError("ENTRY_ENCRYPTED", `Encrypted ZIP entry is not allowed: ${JSON.stringify(archivePath)}.`, {
        path: archivePath,
      })
    }
    if (compression !== 0 && compression !== 8) {
      throw packageError(
        "UNSUPPORTED_COMPRESSION",
        `ZIP entry ${JSON.stringify(archivePath)} uses unsupported compression method ${compression}; only stored and deflate entries are allowed.`,
        { path: archivePath },
      )
    }

    const unixFileType = (externalAttributes >>> 16) & 0xf000
    if ((creatorSystem === 3 || creatorSystem === 19) && unixFileType === 0xa000) {
      throw packageError("ENTRY_SYMLINK", `Symbolic link ZIP entry is not allowed: ${JSON.stringify(archivePath)}.`, {
        path: archivePath,
      })
    }
    if (archivePath.endsWith("/") || (externalAttributes & 0x10) !== 0 || unixFileType === 0x4000) {
      throw packageError("ENTRY_DIRECTORY", `Directory ZIP entry is not allowed: ${JSON.stringify(archivePath)}.`, {
        path: archivePath,
      })
    }

    const path = normalizePackagePath(archivePath)
    if (seenPaths.has(path)) {
      throw packageError("ENTRY_DUPLICATE", `ZIP contains duplicate normalized path ${JSON.stringify(path)}.`, { path })
    }
    seenPaths.add(path)

    if (uncompressedSize > GUIDE_PACKAGE_LIMITS.fileBytes) {
      throw packageError(
        "FILE_TOO_LARGE",
        `ZIP entry ${JSON.stringify(path)} expands to ${uncompressedSize} bytes; the per-file limit is ${GUIDE_PACKAGE_LIMITS.fileBytes} bytes.`,
        { path },
      )
    }
    totalExpandedBytes += uncompressedSize
    if (totalExpandedBytes > GUIDE_PACKAGE_LIMITS.expandedBytes) {
      throw packageError(
        "EXPANDED_TOO_LARGE",
        `Guide ZIP expands beyond the ${GUIDE_PACKAGE_LIMITS.expandedBytes}-byte total limit.`,
      )
    }
    if (path.toLowerCase().endsWith(".lua")) {
      totalLuaBytes += uncompressedSize
      if (totalLuaBytes > GUIDE_PACKAGE_LIMITS.luaBytes) {
        throw packageError(
          "LUA_TOO_LARGE",
          `Guide Lua sources exceed the ${GUIDE_PACKAGE_LIMITS.luaBytes}-byte total limit.`,
        )
      }
    }

    entries.push(Object.freeze({ archivePath, path, uncompressedSize }))
    offset += recordLength
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw packageError("ZIP_INVALID", "ZIP central directory size does not match its entries.")
  }

  return Object.freeze({ entries: Object.freeze(entries) })
}

export function normalizeExtractedFiles(index: ArchiveIndex, unzipped: Unzipped): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const entry of index.entries) {
    const data = unzipped[entry.archivePath]
    if (!data) {
      throw packageError("ZIP_INVALID", `ZIP extractor did not return entry ${JSON.stringify(entry.archivePath)}.`, {
        path: entry.path,
      })
    }
    if (data.length !== entry.uncompressedSize) {
      throw packageError(
        "ZIP_INVALID",
        `ZIP entry ${JSON.stringify(entry.path)} expanded to an unexpected size.`,
        { path: entry.path },
      )
    }
    files.set(entry.path, data.slice())
  }
  return files
}
