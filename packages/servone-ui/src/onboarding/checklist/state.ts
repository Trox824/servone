import { writable } from 'svelte/store'

const HIDDEN_KEY_PREFIX = 'servone:setup-hidden:'
const OPENED_KEY_PREFIX = 'servone:setup-opened-assigned:'

export const isSetupHidden = writable(false)

let hiddenKey = ''

function readFlag (key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag (key: string, isOn: boolean): void {
  try {
    if (isOn) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    return
  }
}

export function loadSetupHidden (account: string): void {
  hiddenKey = HIDDEN_KEY_PREFIX + account
  isSetupHidden.set(readFlag(hiddenKey))
}

export function setSetupHidden (isHidden: boolean): void {
  writeFlag(hiddenKey, isHidden)
  isSetupHidden.set(isHidden)
}

export const readOpenedAssigned = (account: string): boolean => readFlag(OPENED_KEY_PREFIX + account)

export const markOpenedAssigned = (account: string): void => {
  writeFlag(OPENED_KEY_PREFIX + account, true)
}
