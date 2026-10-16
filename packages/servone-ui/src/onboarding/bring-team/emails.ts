const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SEPARATORS = /[\s,;]+/

export interface ParsedEmails {
  valid: string[]
  invalid: string[]
}

export function parseEmails (text: string): ParsedEmails {
  const entries = [...new Set(text.split(SEPARATORS).map((entry) => entry.trim().toLowerCase()))].filter(
    (entry) => entry !== ''
  )
  return {
    valid: entries.filter((entry) => EMAIL_PATTERN.test(entry)),
    invalid: entries.filter((entry) => !EMAIL_PATTERN.test(entry))
  }
}
