import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate"

export type TestZipEntry = {
  name: string
  data?: Uint8Array | string
  compress?: boolean
  os?: number
  attrs?: number
}

export function buildTestZip(entries: readonly TestZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  let failure: Error | undefined
  const archive = new Zip((error, chunk) => {
    if (error) {
      failure = error
      return
    }
    chunks.push(chunk)
  })

  for (const entry of entries) {
    const file = entry.compress ? new ZipDeflate(entry.name, { level: 9 }) : new ZipPassThrough(entry.name)
    file.os = entry.os
    file.attrs = entry.attrs
    archive.add(file)
    file.push(typeof entry.data === "string" ? strToU8(entry.data) : (entry.data ?? new Uint8Array()), true)
  }
  archive.end()

  if (failure) {
    throw failure
  }

  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export function jsonEntry(value: unknown): string {
  return JSON.stringify(value)
}
