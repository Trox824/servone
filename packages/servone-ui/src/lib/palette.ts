const HIDDEN_ACTIONS: ReadonlySet<string> = new Set([
  'workbench:action:CloseCurrentTab',
  'notification:action:ArchiveAll',
  'notification:action:ReadAll',
  'notification:action:UnreadAll',
  'love:action:ToggleMic',
  'love:action:ToggleVideo',
  'time:action:CreateToDo',
  'time:action:CreateToDoGlobal',
  'contact:action:OpenChannel'
])

const HIDDEN_POPUPS: ReadonlySet<string> = new Set(['workbench:component:ServerManager'])

const NAVIGATION_CATEGORY = 'view:category:Navigation'

export function isPaletteAction (action: { _id: string, category: string, actionProps?: { component?: string } }): boolean {
  return (
    action.category !== NAVIGATION_CATEGORY &&
    !HIDDEN_ACTIONS.has(action._id) &&
    !HIDDEN_POPUPS.has(action.actionProps?.component ?? '')
  )
}

export function foldForSearch (text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

export function matchesQuery (query: string, texts: string[]): boolean {
  const haystack = foldForSearch(texts.join(' '))
  return foldForSearch(query).split(/\s+/).every((word) => haystack.includes(word))
}
