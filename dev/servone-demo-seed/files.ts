//
// Bytes for the demo drive files, generated in code: no assets in the repo and nothing copyrighted.
//
import { deflateSync } from 'node:zlib'
import type { DriveFileSpec } from './content'

const BRAND_COLORS = [
  [94, 106, 210],
  [31, 41, 55],
  [16, 185, 129],
  [245, 158, 11],
  [239, 68, 68]
]
const PNG_WIDTH = 300
const PNG_HEIGHT = 100
const PDF_LINE_HEIGHT = 18

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32 (bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk (type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const checked = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(checked))
  return Buffer.concat([length, checked, crc])
}

/** Five brand color swatches side by side. */
export function swatchPng (): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(PNG_WIDTH, 0)
  header.writeUInt32BE(PNG_HEIGHT, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  const row = Buffer.alloc(1 + PNG_WIDTH * 3) // leading filter byte 0
  for (let x = 0; x < PNG_WIDTH; x++) {
    const [red, green, blue] = BRAND_COLORS[Math.floor((x * BRAND_COLORS.length) / PNG_WIDTH)]
    row.set([red, green, blue], 1 + x * 3)
  }
  const pixels = Buffer.concat(Array.from({ length: PNG_HEIGHT }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pdfText (text: string): string {
  return text.replace(/[\\()]/g, (char) => `\\${char}`)
}

/** One A4 page, Helvetica, ASCII text only. */
export function textPdf (title: string, lines: string[]): Buffer {
  const content = [
    'BT /F1 20 Tf 56 780 Td',
    `(${pdfText(title)}) Tj`,
    `0 -${PDF_LINE_HEIGHT * 2} Td /F1 12 Tf`,
    ...lines.map((line) => `(${pdfText(line)}) Tj 0 -${PDF_LINE_HEIGHT} Td`),
    'ET'
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = Buffer.byteLength(body)
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xrefAt = Buffer.byteLength(body)
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

export function markdownBytes (title: string, lines: string[]): Buffer {
  return Buffer.from(`# ${title}\n\n${lines.join('\n')}\n`, 'utf8')
}

export const FILE_TYPES = { markdown: 'text/markdown', pdf: 'application/pdf', png: 'image/png' } as const

export function fileBytes (file: DriveFileSpec): Buffer {
  if (file.kind === 'png') return swatchPng()
  if (file.kind === 'pdf') return textPdf(file.title, file.lines)
  return markdownBytes(file.title, file.lines)
}
