import type { IntlString, Plugin } from '@hcengineering/platform'
import type { RouteKind } from '@servone/notify-rules'

export const routeStringsId = 'servone-approval-route' as Plugin

export const en = {
  RouteStandInLeave: 'standing in for {name}, who is on leave',
  RouteStandIn: 'standing in for {name}',
  RouteHeadOnLeave: '{name} is on leave',
  RouteNoHead: '{team} has no head',
  RouteAdmin: 'No approver found, so you approve',
  StandInTitle: 'Stand-in for approvals',
  StandInWhenOnLeave: 'while you are on leave',
  StandInRange: '{from} – {to}, and while you are on leave',
  StandInActive: 'Standing in now',
  StandInChoose: 'Choose stand-in',
  StandInChange: 'Change stand-in',
  StandInPerson: 'Stand-in',
  StandInPick: 'Pick a colleague',
  StandInNoMatch: 'No colleague matches',
  StandInDates: 'Also on set dates',
  StandInDatesHint: 'For a trip or a busy week when you are not on leave.',
  StandInFrom: 'From',
  StandInTo: 'To',
  StandInSave: 'Save',
  StandInRemove: 'Remove stand-in',
  StandInCancel: 'Cancel',
  StandInSaveFailed: 'Could not save the stand-in. Try again.'
}

export type RouteStringKey = keyof typeof en

export const vi: Record<RouteStringKey, string> = {
  RouteStandInLeave: 'thay {name} đang nghỉ',
  RouteStandIn: 'thay {name}',
  RouteHeadOnLeave: '{name} đang nghỉ',
  RouteNoHead: '{team} chưa có trưởng phòng',
  RouteAdmin: 'không tìm thấy người duyệt',
  StandInTitle: 'Người duyệt thay',
  StandInWhenOnLeave: 'khi bạn nghỉ',
  StandInRange: '{from} – {to}, và khi bạn nghỉ',
  StandInActive: 'Đang duyệt thay',
  StandInChoose: 'Chọn người duyệt thay',
  StandInChange: 'Đổi người duyệt thay',
  StandInPerson: 'Người duyệt thay',
  StandInPick: 'Chọn đồng nghiệp',
  StandInNoMatch: 'Không có đồng nghiệp phù hợp',
  StandInDates: 'Cả trong những ngày cụ thể',
  StandInDatesHint: 'Khi đi công tác hoặc bận mà không nghỉ phép.',
  StandInFrom: 'Từ',
  StandInTo: 'Đến',
  StandInSave: 'Lưu',
  StandInRemove: 'Bỏ người duyệt thay',
  StandInCancel: 'Hủy',
  StandInSaveFailed: 'Không lưu được người duyệt thay. Thử lại.'
}

export const routeStr = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${routeStringsId}:string:${key}` as IntlString])
) as Record<RouteStringKey, IntlString>

export const ROUTE_REASON: Record<RouteKind, RouteStringKey> = {
  stand_in_leave: 'RouteStandInLeave',
  stand_in: 'RouteStandIn',
  head_on_leave: 'RouteHeadOnLeave',
  no_head: 'RouteNoHead',
  admin: 'RouteAdmin'
}

export function routeTextOf (lang: 'vi' | 'en'): (key: RouteStringKey, params?: Record<string, string>) => string {
  return (key, params = {}) =>
    (lang === 'vi' ? vi[key] : en[key]).replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder)
}
