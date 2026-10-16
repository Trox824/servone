import { addStringsLoader, type IntlString, type Plugin } from '@hcengineering/platform'
import type { ChatEventName, HookState } from './api'

const servoneChatHooksId = 'servone-chat-hooks' as Plugin

export const en = {
  OutgoingWebhooks: 'Outgoing webhooks',
  OutgoingWebhooksHint: 'Send what happens in this channel to another app over HTTPS, signed with a secret.',
  AddOutgoingWebhook: 'Add outgoing webhook',
  EditOutgoingWebhook: 'Edit outgoing webhook',
  NoOutgoingWebhooks: 'No outgoing webhooks yet. Send new messages to n8n, Zapier, Make or your own server.',
  ReceiverUrl: 'Receiver URL',
  Events: 'Events',
  EventPosted: 'Message posted',
  EventUpdated: 'Message edited',
  EventDeleted: 'Message deleted',
  EventThreadReply: 'Thread reply',
  EventReaction: 'Reaction added',
  Filters: 'Filters',
  MentionsOnly: 'Mentions only',
  MentionsOnlyHint: 'Only messages that mention a person, a team, @here or @channel.',
  PeopleOnly: 'People only',
  PeopleOnlyHint: 'Skip messages from bots and integrations.',
  IncludeIntegrations: 'Include integration messages',
  IncludeIntegrationsHint: 'Also send messages posted by incoming webhooks. Leave off so a receiver never answers itself.',
  DataNote: "Events include message text, attachment names, and people's names and emails.",
  Active: 'Active',
  OffAfterFailures: 'Turned off after 20 failures',
  Off: 'Turned off',
  NoAttempts: 'No deliveries yet',
  SendTestEvent: 'Send test event',
  TestEventAnswered: 'Test event: {status} in {duration} ms',
  TestEventFailed: 'Test event failed: {error}',
  TestEventRateLimited: 'Wait a few seconds before sending another test event.',
  Log: 'Delivery log',
  LogHint: 'Last 50 attempts, newest first.',
  Refresh: 'Refresh',
  NoLogEntries: 'No attempts yet.',
  LogTime: 'Time',
  LogEvent: 'Event',
  LogStatus: 'Status',
  LogDuration: 'Duration',
  LogResponse: 'Response',
  DroppedEvents: '{count} events dropped: 1,000 deliveries were already waiting',
  Edit: 'Edit',
  TurnOff: 'Turn off',
  TurnOn: 'Turn on',
  Delete: 'Delete webhook',
  DeleteConfirm: 'Deliveries to {url} stop and its log is deleted. This cannot be undone.',
  Actions: 'Webhook actions',
  Unavailable: 'Outgoing webhooks need the Servone service, which this server does not run.',
  Failed: 'The Servone service did not answer. Try again in a minute.',
  SaveFailed: 'The webhook was not saved ({code}). Try again in a minute.',
  RefusedAddress: 'This address is private or internal. Use a public URL.',
  UnresolvableHost: "This host can't be found.",
  NotHttps: 'Use an https:// URL.',
  HasCredentials: 'Take the user name and password out of the URL.',
  UrlTooLong: 'This URL is too long.',
  InvalidUrl: 'Enter a full URL, like https://hooks.example.com/servone.',
  NoEvents: 'Choose at least one event.',
  TooMany: 'This channel already has 10 outgoing webhooks. Delete one to add another.',
  ChannelClosed: 'This channel is archived.',
  Cancel: 'Cancel',
  Save: 'Save'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  OutgoingWebhooks: 'Webhook đi',
  OutgoingWebhooksHint: 'Gửi những gì diễn ra trong kênh này sang ứng dụng khác qua HTTPS, có ký bằng khóa bí mật.',
  AddOutgoingWebhook: 'Thêm webhook đi',
  EditOutgoingWebhook: 'Sửa webhook đi',
  NoOutgoingWebhooks: 'Chưa có webhook đi. Gửi tin nhắn mới sang n8n, Zapier, Make hoặc máy chủ của bạn.',
  ReceiverUrl: 'URL nhận',
  Events: 'Sự kiện',
  EventPosted: 'Tin nhắn mới',
  EventUpdated: 'Tin nhắn được sửa',
  EventDeleted: 'Tin nhắn bị xóa',
  EventThreadReply: 'Trả lời trong luồng',
  EventReaction: 'Có người thả cảm xúc',
  Filters: 'Bộ lọc',
  MentionsOnly: 'Chỉ khi có nhắc tên',
  MentionsOnlyHint: 'Chỉ tin nhắn nhắc tới một người, một nhóm, @here hoặc @channel.',
  PeopleOnly: 'Chỉ người thật',
  PeopleOnlyHint: 'Bỏ qua tin nhắn từ bot và tích hợp.',
  IncludeIntegrations: 'Gồm tin nhắn từ tích hợp',
  IncludeIntegrationsHint: 'Gửi cả tin nhắn do webhook đến đăng. Để tắt để máy nhận không tự trả lời chính nó.',
  DataNote: 'Sự kiện gồm nội dung tin nhắn, tên tệp đính kèm, tên và email của mọi người.',
  Active: 'Đang bật',
  OffAfterFailures: 'Đã tắt sau 20 lần lỗi',
  Off: 'Đã tắt',
  NoAttempts: 'Chưa gửi lần nào',
  SendTestEvent: 'Gửi sự kiện thử',
  TestEventAnswered: 'Sự kiện thử: {status} trong {duration} ms',
  TestEventFailed: 'Gửi sự kiện thử lỗi: {error}',
  TestEventRateLimited: 'Đợi vài giây rồi gửi sự kiện thử tiếp.',
  Log: 'Nhật ký gửi',
  LogHint: '50 lần gửi gần nhất, mới nhất ở trên.',
  Refresh: 'Tải lại',
  NoLogEntries: 'Chưa có lần gửi nào.',
  LogTime: 'Thời gian',
  LogEvent: 'Sự kiện',
  LogStatus: 'Trạng thái',
  LogDuration: 'Thời lượng',
  LogResponse: 'Phản hồi',
  DroppedEvents: 'Đã bỏ {count} sự kiện: đang có 1.000 lượt gửi chờ',
  Edit: 'Sửa',
  TurnOff: 'Tắt',
  TurnOn: 'Bật',
  Delete: 'Xóa webhook',
  DeleteConfirm: 'Ngừng gửi tới {url} và xóa nhật ký của nó. Không thể hoàn tác.',
  Actions: 'Thao tác webhook',
  Unavailable: 'Webhook đi cần dịch vụ Servone, nhưng máy chủ này không chạy dịch vụ đó.',
  Failed: 'Dịch vụ Servone không phản hồi. Hãy thử lại sau một phút.',
  SaveFailed: 'Chưa lưu được webhook ({code}). Hãy thử lại sau một phút.',
  RefusedAddress: 'Địa chỉ này là nội bộ. Hãy dùng URL công khai.',
  UnresolvableHost: 'Không tìm thấy máy chủ này.',
  NotHttps: 'Hãy dùng URL https://.',
  HasCredentials: 'Bỏ tên đăng nhập và mật khẩu khỏi URL.',
  UrlTooLong: 'URL này quá dài.',
  InvalidUrl: 'Nhập URL đầy đủ, ví dụ https://hooks.example.com/servone.',
  NoEvents: 'Chọn ít nhất một sự kiện.',
  TooMany: 'Kênh này đã có 10 webhook đi. Xóa bớt một cái để thêm mới.',
  ChannelClosed: 'Kênh này đã lưu trữ.',
  Cancel: 'Hủy',
  Save: 'Lưu'
}

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${servoneChatHooksId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>

export const EVENT_LABELS: Record<ChatEventName, IntlString> = {
  'message.posted': str.EventPosted,
  'message.updated': str.EventUpdated,
  'message.deleted': str.EventDeleted,
  'thread.reply': str.EventThreadReply,
  'reaction.added': str.EventReaction
}

export const STATE_LABELS: Record<HookState, IntlString> = {
  active: str.Active,
  offAfterFailures: str.OffAfterFailures,
  off: str.Off
}

export const PROBLEMS: Record<string, IntlString> = {
  refused_address: str.RefusedAddress,
  unresolvable_host: str.UnresolvableHost,
  not_https: str.NotHttps,
  has_credentials: str.HasCredentials,
  too_long: str.UrlTooLong,
  invalid_url: str.InvalidUrl,
  empty: str.NoEvents,
  too_many_hooks: str.TooMany,
  channel_closed: str.ChannelClosed
}

addStringsLoader(servoneChatHooksId, async (lang: string) => ({ string: lang === 'vi' ? vi : en }))
