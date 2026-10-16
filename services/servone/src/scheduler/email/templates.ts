import type { DigestLocale } from '@servone/notify-rules'

function plural (count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export interface SummaryStrings {
  body: (mentions: number, directs: number) => string
}

export const summaryStrings: Record<DigestLocale, SummaryStrings> = {
  en: {
    body: (mentions, directs) =>
      `While you were away: ${plural(mentions, 'mention', 'mentions')}, ${plural(directs, 'direct message', 'direct messages')}`
  },
  vi: {
    body: (mentions, directs) => `Trong lúc bạn vắng mặt: ${mentions} lượt nhắc, ${directs} tin nhắn riêng`
  }
}

export interface DigestStrings {
  subject: (count: number, workspace: string) => string
  open: string
  more: (count: number) => string
  thread: (title: string) => string
  conversation: string
  footer: string
  turnOff: string
}

export const digestStrings: Record<DigestLocale, DigestStrings> = {
  en: {
    subject: (count, workspace) => `${count} unread in ${workspace}`,
    open: 'Open inbox',
    more: (count) => `and ${plural(count, 'more message', 'more messages')}`,
    thread: (title) => `Thread in ${title}`,
    conversation: 'Conversation',
    footer: 'You get this because email digest is on.',
    turnOff: 'Turn it off'
  },
  vi: {
    subject: (count, workspace) => `${count} tin chưa đọc trong ${workspace}`,
    open: 'Mở hộp thư',
    more: (count) => `và ${count} tin khác`,
    thread: (title) => `Luồng trong ${title}`,
    conversation: 'Cuộc trò chuyện',
    footer: 'Bạn nhận email này vì đã bật email tóm tắt.',
    turnOff: 'Tắt email tóm tắt'
  }
}

// The unsubscribe page does not know the reader's language, so it shows both.
export const PAGE_LOCALES: DigestLocale[] = ['vi', 'en']

export interface PageStrings {
  title: string
  confirm: (workspace: string) => string
  button: string
  done: (workspace: string) => string
  invalid: string
  failed: string
}

export const pageStrings: Record<DigestLocale, PageStrings> = {
  en: {
    title: 'Email digest',
    confirm: (workspace) => `Turn off the email digest for ${workspace}?`,
    button: 'Turn off email digest',
    done: (workspace) => `Email digest is off for ${workspace}.`,
    invalid: 'This link is not valid.',
    failed: 'Could not turn off the email digest. Try again in a few minutes.'
  },
  vi: {
    title: 'Email tóm tắt',
    confirm: (workspace) => `Tắt email tóm tắt cho ${workspace}?`,
    button: 'Tắt email tóm tắt',
    done: (workspace) => `Đã tắt email tóm tắt cho ${workspace}.`,
    invalid: 'Liên kết này không hợp lệ.',
    failed: 'Chưa tắt được email tóm tắt. Thử lại sau vài phút.'
  }
}
