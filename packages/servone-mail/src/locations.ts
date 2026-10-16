import type { Ref } from '@hcengineering/core'
import type { MailFolderCard } from './fields'

export interface MailLocation {
  uid: number
  folder: Ref<MailFolderCard>
}

const LOCATION = /^(\d+)@(.+)$/

export function encodeLocation (location: MailLocation): string {
  return `${location.uid}@${location.folder}`
}

// mailLocations is writable by workspace clients, so callers handling a card they did not write use this instead of parseLocation.
export function readLocation (text: string): MailLocation | undefined {
  const match = LOCATION.exec(text)
  if (match === null) return undefined
  return { uid: Number(match[1]), folder: match[2] as Ref<MailFolderCard> }
}

export function parseLocation (text: string): MailLocation {
  const location = readLocation(text)
  if (location === undefined) throw new Error(`Bad mail location: ${text}`)
  return location
}

export function foldersOf (locations: string[]): Array<Ref<MailFolderCard>> {
  return [...new Set(locations.map((text) => parseLocation(text).folder))]
}
