export type Lang = 'vi' | 'en'

export const en = {
  Related: 'Related',
  NothingOpen: 'Open a task, email or meeting to see what is linked to it.',
  NothingLinked: 'Nothing is linked to this page yet.',
  KindMeeting: 'Meeting',
  KindMail: 'Email',
  KindTask: 'Tasks',
  KindChat: 'Chat',
  KindFile: 'Files',
  KindMention: 'Mentioned in',
  KindOther: 'Other',
  Untitled: 'Untitled',
  StartsIn: 'Starts in {minutes} min',
  EndsIn: 'Ends in {minutes} min',
  Join: 'Join',
  Agenda: 'Agenda',
  NoAgenda: 'No agenda yet.',
  MoreAgenda: 'Full agenda',
  Declined: 'Declined',
  OpenItems: 'Still open from earlier meetings',
  InACall: 'In a call',
  NobodyInACall: 'Nobody is in a call.',
  Call: 'Call'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  Related: 'Liên quan',
  NothingOpen: 'Mở một việc, email hoặc cuộc họp để xem những gì liên kết với nó.',
  NothingLinked: 'Chưa có gì liên kết với trang này.',
  KindMeeting: 'Cuộc họp',
  KindMail: 'Email',
  KindTask: 'Việc',
  KindChat: 'Chat',
  KindFile: 'Tệp',
  KindMention: 'Được nhắc đến trong',
  KindOther: 'Khác',
  Untitled: 'Không có tiêu đề',
  StartsIn: 'Bắt đầu sau {minutes} phút',
  EndsIn: 'Kết thúc sau {minutes} phút',
  Join: 'Tham gia',
  Agenda: 'Nội dung',
  NoAgenda: 'Chưa có nội dung.',
  MoreAgenda: 'Xem đầy đủ',
  Declined: 'Từ chối',
  OpenItems: 'Việc còn mở từ các buổi trước',
  InACall: 'Đang họp',
  NobodyInACall: 'Không ai đang họp.',
  Call: 'Cuộc gọi'
}

export function textOf (lang: Lang): (key: StringKey, params?: Record<string, string | number>) => string {
  return (key, params = {}) => {
    const template = lang === 'vi' ? vi[key] : en[key]
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
  }
}
