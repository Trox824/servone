import type { IntlString, Plugin } from '@hcengineering/platform'

export const helpdeskId = 'servone-helpdesk' as Plugin

export const en = {
  SlaAutomation: 'SLA & automation',
  SlaHint: 'Targets count calendar hours from when an item is created. Changing them applies to new items only.',
  ReadOnly: 'Only approval owners and workspace maintainers can change these settings.',
  Priority: 'Priority',
  FirstResponse: 'First response',
  Resolution: 'Resolution',
  Urgent: 'Urgent',
  High: 'High',
  Medium: 'Medium',
  Low: 'Low',
  NoTarget: 'No target',
  Hours: 'h',
  Days: 'days',
  AutoClose: 'Close resolved items',
  AutoCloseHint: 'After this many days with no reply. Empty turns it off.',
  AutoArchive: 'Archive finished items',
  AutoArchiveHint: 'Finished and canceled items leave the board and list. Search and links still find them.',
  Off: 'Off',
  Months: '{months, plural, one {After # month} other {After # months}}',
  InvalidCount: 'Enter a whole number above zero, or leave it empty.',
  Handoff: 'Start another approval',
  HandoffHint: 'When an item moves into this stage, a linked item starts in the chosen approval. Once per item.',
  HandoffStage: 'When an item reaches',
  HandoffTarget: 'Start an item in',
  HandoffAssignee: 'Assign it to',
  AssignNone: 'No one',
  AssignSame: 'Same assignee',
  AssignPerson: 'A specific person',
  ChoosePerson: 'Choose person',
  HandoffIncomplete: 'Pick both a stage and an approval, and the person to assign.',
  Save: 'Save',
  Saved: 'Saved'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  SlaAutomation: 'SLA & tự động',
  SlaHint: 'Thời hạn tính theo giờ lịch từ lúc tạo công việc. Thay đổi chỉ áp dụng cho công việc mới.',
  ReadOnly: 'Chỉ người phụ trách và quản trị viên workspace được đổi các cài đặt này.',
  Priority: 'Độ ưu tiên',
  FirstResponse: 'Phản hồi đầu',
  Resolution: 'Xử lý xong',
  Urgent: 'Khẩn cấp',
  High: 'Cao',
  Medium: 'Trung bình',
  Low: 'Thấp',
  NoTarget: 'Không',
  Hours: 'giờ',
  Days: 'ngày',
  AutoClose: 'Đóng công việc đã giải quyết',
  AutoCloseHint: 'Sau số ngày này không có phản hồi. Để trống là tắt.',
  AutoArchive: 'Lưu trữ công việc đã xong',
  AutoArchiveHint: 'Công việc ở nhóm Hoàn thành và Đã hủy rời bảng và danh sách. Tìm kiếm và đường dẫn vẫn mở được.',
  Off: 'Tắt',
  Months: 'Sau {months} tháng',
  InvalidCount: 'Nhập số nguyên lớn hơn 0, hoặc để trống.',
  Handoff: 'Bắt đầu phê duyệt khác',
  HandoffHint: 'Khi công việc chuyển sang giai đoạn này, một công việc liên kết được tạo trong phê duyệt đã chọn. Mỗi công việc một lần.',
  HandoffStage: 'Khi công việc đến',
  HandoffTarget: 'Tạo công việc trong',
  HandoffAssignee: 'Giao cho',
  AssignNone: 'Không ai',
  AssignSame: 'Cùng người được giao',
  AssignPerson: 'Một người cụ thể',
  ChoosePerson: 'Chọn người',
  HandoffIncomplete: 'Chọn cả giai đoạn và phê duyệt, và người được giao.',
  Save: 'Lưu',
  Saved: 'Đã lưu'
}

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${helpdeskId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>
