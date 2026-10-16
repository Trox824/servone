export const STARTER_ID_PREFIX = 'servone:starter:'
const STARTER_KEYS = ['invite', 'project', 'sprint', 'managers', 'leave', 'meeting']

export interface StarterIssue {
  id: string
  title: string
  isDone: boolean
}

export interface ChecklistItem {
  key: string
  title: string
  isDone: boolean
}

export interface PersonalState {
  hasPhoto: boolean
  hasPosted: boolean
  hasAssigned: boolean
  hasOpenedAssigned: boolean
}

export function creatorItems (starters: StarterIssue[]): ChecklistItem[] {
  const rank = (key: string): number => {
    const index = STARTER_KEYS.indexOf(key)
    return index === -1 ? STARTER_KEYS.length : index
  }
  return starters
    .filter((starter) => starter.id.startsWith(STARTER_ID_PREFIX))
    .map((starter) => ({ key: starter.id.slice(STARTER_ID_PREFIX.length), title: starter.title, isDone: starter.isDone }))
    .sort((first, second) => rank(first.key) - rank(second.key))
}

export function personalItems (state: PersonalState): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { key: 'photo', title: '', isDone: state.hasPhoto },
    { key: 'hello', title: '', isDone: state.hasPosted }
  ]
  if (state.hasAssigned) items.push({ key: 'assigned', title: '', isDone: state.hasOpenedAssigned })
  return items
}

export function countDone (items: ChecklistItem[]): number {
  return items.filter((item) => item.isDone).length
}
