import { unzipSync } from 'fflate'

export function readZip (bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = unzipSync(bytes, { filter: (entry) => !entry.name.endsWith('/') && !entry.name.startsWith('__MACOSX/') })
  return new Map(Object.entries(entries))
}

export function decodeText (bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
}
