import type { ChangeId, ConfigSession, Operation } from '@servone/config'
import type { StudioRoute } from './routes'
import type { SaveOptions, SaveResult } from './save'

export interface StudioContext {
  session: ConfigSession
  save: (ops: Operation[], options?: SaveOptions) => Promise<SaveResult>
  applyDraft: (id: ChangeId) => Promise<SaveResult>
  undo: (id: ChangeId) => Promise<SaveResult>
  approve: (id: ChangeId) => Promise<SaveResult>
  reject: (id: ChangeId) => Promise<void>
  reload: () => Promise<void>
  open: (route: StudioRoute) => void
}

export const TAB_ID = {
  fields: 'truong',
  links: 'lien-ket',
  view: 'hien-thi',
  automation: 'tu-dong',
  access: 'quyen',
  history: 'lich-su'
} as const

export const SECTION_ID = { packs: 'goi-mau', history: 'lich-su' } as const
