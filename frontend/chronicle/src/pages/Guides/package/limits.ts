const MEBIBYTE = 1024 * 1024

export const GUIDE_PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 8 * MEBIBYTE,
  expandedBytes: 16 * MEBIBYTE,
  fileBytes: 2 * MEBIBYTE,
  files: 512,
  luaBytes: MEBIBYTE,
})
