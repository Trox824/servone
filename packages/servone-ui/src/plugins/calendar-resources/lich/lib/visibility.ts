import type { Visibility } from './types'

export type VisibilityChoice = 'default' | Visibility

export const VISIBILITY_CHOICES: readonly VisibilityChoice[] = ['default', 'public', 'freeBusy', 'private']

export function isVisibilityChoice (picked: string): picked is VisibilityChoice {
  return VISIBILITY_CHOICES.some((c) => c === picked)
}

export function choiceOf (visibility: Visibility | undefined): VisibilityChoice {
  return visibility ?? 'default'
}

export function visibilityOf (choice: VisibilityChoice): Visibility | undefined {
  return choice === 'default' ? undefined : choice
}
