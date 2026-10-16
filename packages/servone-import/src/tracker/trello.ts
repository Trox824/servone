import type { CommentImport, ExportFile, ImportBundle } from '../types'
import { decodeText } from '../zip'
import { TrackerBundle, checklistMarkdown, fileTitle, joinBlocks, person } from './bundle'
import { statusCategory } from './status'

const OBJECT_ID_TIME_HEX_LEN = 8
const MS_PER_SECOND = 1000

interface TrelloCard {
  id: string
  name: string
  desc: string
  idList: string
  closed: boolean
  due?: string | null
  dueComplete: boolean
  idMembers: string[]
  labels: Array<{ name: string, color?: string | null }>
}

interface TrelloAction {
  type: string
  date: string
  data: { card?: { id: string } | null, text?: string | null }
  memberCreator?: { fullName: string } | null
}

export interface TrelloBoard {
  name: string
  lists: Array<{ id: string, name: string }>
  cards: TrelloCard[]
  members?: Array<{ id: string, fullName: string }>
  checklists?: Array<{ idCard: string, name: string, checkItems: Array<{ name: string, state: string }> }>
  actions?: TrelloAction[]
}

function readBoard (file: ExportFile): TrelloBoard {
  const parsed = JSON.parse(decodeText(file.bytes))
  if (!Array.isArray(parsed?.cards) || !Array.isArray(parsed?.lists)) {
    throw new Error('This file is not a Trello board JSON export.')
  }
  return parsed
}

export function parseTrello (file: ExportFile): ImportBundle {
  const board = readBoard(file)
  const bundle = new TrackerBundle()
  addTrelloBoard(bundle, board.name.trim() !== '' ? board.name.trim() : fileTitle(file), board)
  return bundle.build()
}

export function addTrelloBoard (bundle: TrackerBundle, project: string, board: TrelloBoard): void {
  const listNames = new Map(board.lists.map((list) => [list.id, list.name]))
  const memberNames = new Map((board.members ?? []).map((member) => [member.id, member.fullName]))
  const comments = new Map<string, CommentImport[]>()
  const creators = new Map<string, string>()
  for (const action of [...(board.actions ?? [])].reverse()) {
    const cardId = action.data.card?.id
    const author = action.memberCreator?.fullName ?? ''
    if (cardId === undefined) continue
    if (action.type === 'createCard') creators.set(cardId, author)
    if (action.type !== 'commentCard' || (action.data.text ?? '').trim() === '') continue
    const comment = { author: person(author), date: bundle.date(action.date), text: action.data.text ?? '' }
    comments.set(cardId, [...(comments.get(cardId) ?? []), comment])
  }
  const checklists = new Map<string, string[]>()
  for (const checklist of board.checklists ?? []) {
    const checks = checklist.checkItems.map((check) => ({ text: check.name, isDone: check.state === 'complete' }))
    checklists.set(checklist.idCard, [...(checklists.get(checklist.idCard) ?? []), checklistMarkdown(checklist.name, checks)])
  }
  for (const card of board.cards) {
    const status = listNames.get(card.idList) ?? ''
    bundle.add(project, {
      key: card.id,
      title: card.name.trim(),
      description: joinBlocks([card.desc, ...(checklists.get(card.id) ?? [])]),
      status: statusCategory(status, card.closed || card.dueComplete ? 'done' : undefined),
      sourceStatus: status,
      priority: 'none',
      assignee: person(memberNames.get(card.idMembers[0]) ?? ''),
      creator: person(creators.get(card.id) ?? ''),
      labels: card.labels.map((label) => label.name !== '' ? label.name : label.color ?? '').filter((label) => label !== ''),
      dueDate: bundle.date(card.due ?? ''),
      createdOn: parseInt(card.id.slice(0, OBJECT_ID_TIME_HEX_LEN), 16) * MS_PER_SECOND,
      comments: comments.get(card.id) ?? []
    })
  }
}
