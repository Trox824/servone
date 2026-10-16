export interface MailAddress {
  name: string
  email: string
}

const NEEDS_QUOTES = /[",;<>@()]/
const WITH_NAME = /^\s*"?(.*?)"?\s*<([^>]+)>\s*$/

export function formatAddress (address: MailAddress): string {
  if (address.name === '') return address.email
  const name = NEEDS_QUOTES.test(address.name) ? `"${address.name.replace(/"/g, '')}"` : address.name
  return `${name} <${address.email}>`
}

export function parseAddress (text: string): MailAddress {
  const match = WITH_NAME.exec(text)
  if (match === null) return { name: '', email: text.trim().toLowerCase() }
  return { name: match[1].trim(), email: match[2].trim().toLowerCase() }
}

export function emailsOf (texts: string[]): string[] {
  return [...new Set(texts.map((text) => parseAddress(text).email).filter((email) => email !== ''))]
}
