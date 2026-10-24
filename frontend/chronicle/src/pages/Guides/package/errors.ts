export type GuidePackageErrorCode =
  | "API_VERSION"
  | "ARCHIVE_TOO_LARGE"
  | "ASSET_INVALID"
  | "ASSET_MISSING"
  | "ASSET_UNDECLARED"
  | "CAPABILITY_UNSUPPORTED"
  | "ENTRY_DIRECTORY"
  | "ENTRY_DUPLICATE"
  | "ENTRY_ENCRYPTED"
  | "ENTRY_SYMLINK"
  | "ENTRYPOINT_INVALID"
  | "ENTRYPOINT_MISSING"
  | "EXPANDED_TOO_LARGE"
  | "FILE_MISSING"
  | "FILE_TEXT_INVALID"
  | "FILE_TOO_LARGE"
  | "LUA_TOO_LARGE"
  | "MANIFEST_INVALID"
  | "MANIFEST_JSON_INVALID"
  | "MANIFEST_MISSING"
  | "MANIFEST_VERSION"
  | "PATH_ABSOLUTE"
  | "PATH_BACKSLASH"
  | "PATH_DOT_SEGMENT"
  | "PATH_EMPTY_SEGMENT"
  | "PATH_NUL"
  | "TOO_MANY_FILES"
  | "UNSUPPORTED_COMPRESSION"
  | "ZIP_INVALID"
  | "ZIP_UNSUPPORTED"

export class GuidePackageError extends Error {
  readonly code: GuidePackageErrorCode
  readonly path?: string

  constructor(code: GuidePackageErrorCode, message: string, options?: { cause?: unknown; path?: string }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = "GuidePackageError"
    this.code = code
    this.path = options?.path
  }
}

export function packageError(
  code: GuidePackageErrorCode,
  message: string,
  options?: { cause?: unknown; path?: string },
): GuidePackageError {
  return new GuidePackageError(code, message, options)
}
