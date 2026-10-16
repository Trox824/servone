import { writable } from 'svelte/store'

const CONSENT_KEY = 'servone:terms-accepted'

export const termsAccepted = writable(false)

export function hasStoredConsent (): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberConsent (): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1')
  } catch {}
}
