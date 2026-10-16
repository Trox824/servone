import { addStringsLoader, type IntlString, type Plugin } from '@hcengineering/platform'

const servoneChatCallsId = 'servone-chat-calls' as Plugin

export const en = {
  Call: 'Call',
  InCall: 'In call',
  Join: 'Join',
  StartedCall: 'Started a call',
  CallLive: 'In a call · {count, plural, =1 {1 person} other {# people}} · {duration}',
  CallLiveStarting: 'In a call · {count, plural, =1 {1 person} other {# people}}'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  Call: 'Gọi',
  InCall: 'Đang gọi',
  Join: 'Tham gia',
  StartedCall: 'Đã bắt đầu cuộc gọi',
  CallLive: 'Đang gọi · {count} người · {duration}',
  CallLiveStarting: 'Đang gọi · {count} người'
}

export const callStr = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${servoneChatCallsId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>

addStringsLoader(servoneChatCallsId, async (lang: string) => ({ string: lang === 'vi' ? vi : en }))
