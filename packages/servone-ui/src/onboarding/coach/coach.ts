import { type IntlString } from '@hcengineering/platform'
import { mount, unmount } from 'svelte'
import CoachMark from './CoachMark.svelte'

const FIND_TIMEOUT_MS = 8000

export interface CoachStep {
  selector: string
  message: IntlString
  side: 'top' | 'right' | 'bottom' | 'left'
  align: 'start' | 'center' | 'end'
}

let shown: ReturnType<typeof mount> | undefined
let stopFinding: (() => void) | undefined

export function dismissCoach (): void {
  stopFinding?.()
  stopFinding = undefined
  if (shown === undefined) return
  void unmount(shown)
  shown = undefined
}

function show (anchor: HTMLElement, step: CoachStep): void {
  shown = mount(CoachMark, {
    target: document.body,
    props: { anchor, message: step.message, side: step.side, align: step.align, onDismiss: dismissCoach }
  })
}

export function coach (step: CoachStep): void {
  dismissCoach()
  const present = document.querySelector<HTMLElement>(step.selector)
  if (present !== null) {
    show(present, step)
    return
  }
  const observer = new MutationObserver(() => {
    const found = document.querySelector<HTMLElement>(step.selector)
    if (found === null) return
    stopFinding?.()
    stopFinding = undefined
    show(found, step)
  })
  const timer = setTimeout(() => { stopFinding?.() }, FIND_TIMEOUT_MS)
  stopFinding = () => {
    observer.disconnect()
    clearTimeout(timer)
  }
  observer.observe(document.body, { childList: true, subtree: true })
}
