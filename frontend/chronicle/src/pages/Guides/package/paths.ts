import { packageError } from "./errors"

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//

export function normalizePackagePath(path: string): string {
  if (path.includes("\0")) {
    throw packageError("PATH_NUL", `Package path contains a NUL byte: ${JSON.stringify(path)}.`, { path })
  }
  if (path.includes("\\")) {
    throw packageError("PATH_BACKSLASH", `Package path must use forward slashes: ${JSON.stringify(path)}.`, { path })
  }
  if (path.startsWith("/") || WINDOWS_DRIVE_PATH.test(path)) {
    throw packageError("PATH_ABSOLUTE", `Package path must be relative: ${JSON.stringify(path)}.`, { path })
  }

  const segments = path.split("/")
  if (segments.some((segment) => segment.length === 0)) {
    throw packageError("PATH_EMPTY_SEGMENT", `Package path contains an empty segment: ${JSON.stringify(path)}.`, { path })
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw packageError("PATH_DOT_SEGMENT", `Package path contains a dot segment: ${JSON.stringify(path)}.`, { path })
  }

  return path.normalize("NFC")
}
