import { addStringsLoader, type IntlString, type Plugin } from '@hcengineering/platform'

const servonePaletteId = 'servone-palette' as Plugin

export const en = {
  GoTo: 'Go to',
  Create: 'Create',
  Inbox: 'Notifications',
  Settings: 'Settings',
  Channel: 'Channel',
  Project: 'Project',
  Workflow: 'Approval',
  Drive: 'Drive',
  NewChannel: 'New channel',
  NewDirectMessage: 'New direct message',
  NewEmail: 'New email',
  NewEvent: 'New event',
  NewMeeting: 'Schedule a meeting',
  MeetNow: 'Start a meeting now',
  NewDocument: 'New document',
  NewWorkflow: 'New approval',
  NewToDo: 'New to-do',
  InviteTeammate: 'Invite teammate',
  MarkAllRead: 'Mark all notifications as read',
  ClearInbox: 'Clear all notifications',
  Searching: 'Searching...',
  NoResults: 'No results for "{query}"'
}

const vi: Record<keyof typeof en, string> = {
  GoTo: 'Đi tới',
  Create: 'Tạo mới',
  Inbox: 'Thông báo',
  Settings: 'Cài đặt',
  Channel: 'Kênh',
  Project: 'Dự án',
  Workflow: 'Phê duyệt',
  Drive: 'Drive',
  NewChannel: 'Kênh mới',
  NewDirectMessage: 'Tin nhắn riêng mới',
  NewEmail: 'Thư mới',
  NewEvent: 'Sự kiện mới',
  NewMeeting: 'Lên lịch cuộc họp',
  MeetNow: 'Họp ngay',
  NewDocument: 'Tài liệu mới',
  NewWorkflow: 'Tạo phê duyệt',
  NewToDo: 'Việc cần làm mới',
  InviteTeammate: 'Mời đồng nghiệp',
  MarkAllRead: 'Đánh dấu tất cả thông báo là đã đọc',
  ClearInbox: 'Xóa tất cả thông báo',
  Searching: 'Đang tìm...',
  NoResults: 'Không có kết quả cho "{query}"'
}

export const paletteStr = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${servonePaletteId}:string:${key}` as IntlString])
) as Record<keyof typeof en, IntlString>

addStringsLoader(servonePaletteId, async (lang) => ({ string: lang === 'vi' ? vi : en }))
