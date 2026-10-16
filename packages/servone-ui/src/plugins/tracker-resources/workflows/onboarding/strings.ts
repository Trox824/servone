import type { IntlString, Plugin } from '@hcengineering/platform'

export const onboardingId = 'servone-onboarding' as Plugin

export const en = {
  TemplateOnboarding: 'Onboarding',
  TemplateOffboarding: 'Offboarding',
  TemplateOnboardingHint: 'Get a new hire set up: account, equipment, team intro and a first-week check-in.',
  TemplateOffboardingHint: 'Hand over work, collect equipment and remove access by the last day.',
  StartOnboarding: 'Start onboarding',
  StartOffboarding: 'Start offboarding',
  StartDay: 'Start day',
  LastDay: 'Last day',
  CreateTasks: 'Create {count} tasks in {workflow}',
  Creating: 'Creating…',
  Cancel: 'Cancel',
  StepsHeading: 'Steps',
  StepsHint: 'Each owner sees their task in My work and in Lịch.',
  You: 'You',
  NoManager: 'No manager found, so the manager steps go to you.',
  StartFailed: 'Could not finish: {reason}. Steps already created are in Approval.',
  NotifiedNow: 'Notified now: {names}.',
  YouInList: 'you',
  HeldStep: '{person} is not told yet. "{step}" stays unassigned until you assign it from More on their profile.',
  Held: 'Held, not assigned yet',
  More: 'More',
  OpenOnboarding: 'Open onboarding',
  OpenOffboarding: 'Open offboarding',
  AssignHeld: 'Assign "{step}" to {person}'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  TemplateOnboarding: 'Nhận việc',
  TemplateOffboarding: 'Nghỉ việc',
  TemplateOnboardingHint: 'Chuẩn bị cho người mới: tài khoản, thiết bị, giới thiệu nhóm và trao đổi sau tuần đầu.',
  TemplateOffboardingHint: 'Bàn giao công việc, thu hồi thiết bị và quyền truy cập trước ngày cuối.',
  StartOnboarding: 'Bắt đầu nhận việc',
  StartOffboarding: 'Bắt đầu nghỉ việc',
  StartDay: 'Ngày bắt đầu',
  LastDay: 'Ngày làm việc cuối',
  CreateTasks: 'Tạo {count} việc trong {workflow}',
  Creating: 'Đang tạo…',
  Cancel: 'Hủy',
  StepsHeading: 'Các bước',
  StepsHint: 'Mỗi người phụ trách sẽ thấy việc của mình trong Việc của tôi và Lịch.',
  You: 'Bạn',
  NoManager: 'Chưa có quản lý, nên các bước của quản lý sẽ giao cho bạn.',
  StartFailed: 'Chưa tạo xong: {reason}. Các bước đã tạo nằm trong Phê duyệt.',
  NotifiedNow: 'Báo ngay cho: {names}.',
  YouInList: 'bạn',
  HeldStep: '{person} chưa được báo. Bước "{step}" chưa giao cho ai đến khi bạn giao từ mục Thêm trên hồ sơ của họ.',
  Held: 'Tạm giữ, chưa giao',
  More: 'Thêm',
  OpenOnboarding: 'Mở nhận việc',
  OpenOffboarding: 'Mở nghỉ việc',
  AssignHeld: 'Giao "{step}" cho {person}'
}

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${onboardingId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>
