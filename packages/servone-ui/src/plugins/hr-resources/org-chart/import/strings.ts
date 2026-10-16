import platform, { PlatformError } from '@hcengineering/platform'
import type { PlanProblem } from './plan'

export const en = {
  ImportCsv: 'Import from CSV',
  Title: 'Import staff from CSV',
  Intro: 'One row per person. Columns: name, email, job title, department, manager email. Only email is required.',
  ChooseFile: 'Choose a CSV file',
  DropHint: 'or drop it here',
  DownloadSample: 'Download sample file',
  Reading: 'Reading {file}…',
  ChooseAnother: 'Choose another file',
  FileEmpty: 'This file has no rows.',
  FileNoEmail: 'No email column found. The first row must be the column names, one of them "email".',
  FileUnreadable: 'Could not read this file: {reason}',
  FileNotUtf8: 'This file is not UTF-8. In Excel use Save As, then "CSV UTF-8 (Comma delimited)".',
  ImportAborted: 'Import stopped: {reason}. Rows already added stay; importing the same file again finishes the rest.',
  New: 'New',
  Update: 'Update',
  Unchanged: 'No change',
  Skipped: 'Skipped',
  SummaryCreate: '{count} new',
  SummaryUpdate: '{count} updated',
  SummaryUnchanged: '{count} unchanged',
  SummarySkip: '{count} skipped',
  NewDepartments: 'New departments: {names}',
  HeadChanges: 'Department heads: {pairs}',
  HeadSet: '{department}: {name}',
  HeadReplaces: '{department}: {name} (replacing {previous})',
  Line: 'Line',
  Name: 'Name',
  Email: 'Email',
  JobTitle: 'Job title',
  Department: 'Department',
  Manager: 'Manager',
  ManagerEmail: 'Manager email',
  Reason: 'Reason',
  Status: 'Status',
  ChangeTitle: 'title',
  ChangeDepartment: 'department',
  ChangeManager: 'manager',
  Cancel: 'Cancel',
  Import: 'Import {count}',
  ImportAndInvite: 'Import and invite {count}',
  ImportAndInviteNew: 'Import {count}, invite {invited} new',
  SendInvites: 'Send invites now',
  SendInvitesHint: 'New people get an email to join. Turn off to add them to the directory and org chart without emailing them.',
  UnchangedRows: '{count} unchanged rows',
  DownloadSkipped: 'Download skipped rows',
  NothingToImport: 'Nothing to import',
  Importing: 'Importing {done} of {total}…',
  ImportProgress: 'Import progress',
  Stop: 'Stop import',
  Stopping: 'Stopping after the current row…',
  Done: 'Import finished',
  Stopped: 'Import stopped',
  StoppedSummary: '{created} added, {updated} updated. {remaining} rows were not imported and department heads were not changed. Import the same file again to finish.',
  InviteLater: 'No invites were sent. To invite these people later, open your account menu, choose "Invite to workspace" and share the link with them. Servone cannot yet email an invite to someone already added.',
  DoneSummary: '{created} added, {updated} updated.',
  Failed: '{count} rows failed:',
  FailNoPermission: 'You do not have permission to add people',
  FailSessionExpired: 'Your session expired. Sign in again and import the same file',
  FailConnection: 'Lost connection to the server. Import the same file again to retry',
  FailUnknown: 'Could not save this row. Import the same file again to retry',
  Close: 'Close',
  ProblemMissingEmail: 'Email is empty',
  ProblemBadEmail: 'Email is not valid',
  ProblemBadManagerEmail: 'Manager email is not valid',
  ProblemDuplicateEmail: 'Same email as an earlier row',
  ProblemNotStaff: 'This email belongs to a guest, a deactivated account or an outside contact',
  ProblemMissingName: 'Name is empty for a new person',
  ProblemSelfManager: 'Manager is the person themselves',
  ProblemUnknownManager: 'Manager is not in the file or in the workspace',
  ProblemManagerSkipped: "Manager's own row is skipped",
  ProblemHeadConflict: 'Another row already names a different head for this department',
  ProblemParentConflict: 'Another row already puts this department under a different manager',
  ProblemReportingLoop: 'Would create a reporting loop',
  ProblemTopHasManager: 'People without a department are at the top and cannot have a manager'
}

export type StringKey = keyof typeof en

export const vi: Partial<Record<StringKey, string>> = {
  ImportCsv: 'Nhập từ CSV',
  Title: 'Nhập nhân viên từ CSV',
  Intro: 'Mỗi dòng một người. Các cột: họ tên, email, chức danh, phòng ban, email quản lý. Chỉ email là bắt buộc.',
  ChooseFile: 'Chọn tệp CSV',
  DropHint: 'hoặc kéo thả vào đây',
  DownloadSample: 'Tải tệp mẫu',
  Reading: 'Đang đọc {file}…',
  ChooseAnother: 'Chọn tệp khác',
  FileEmpty: 'Tệp này không có dòng nào.',
  FileNoEmail: 'Không thấy cột email. Dòng đầu tiên phải là tên cột, trong đó có "email".',
  FileUnreadable: 'Không đọc được tệp: {reason}',
  FileNotUtf8: 'Tệp không ở dạng UTF-8. Trong Excel, chọn Lưu như (Save As) rồi chọn định dạng "CSV UTF-8 (Comma delimited)".',
  ImportAborted: 'Đã dừng nhập: {reason}. Những người đã thêm vẫn được giữ; nhập lại tệp này để hoàn tất phần còn lại.',
  New: 'Mới',
  Update: 'Cập nhật',
  Unchanged: 'Không đổi',
  Skipped: 'Bỏ qua',
  SummaryCreate: '{count} mới',
  SummaryUpdate: '{count} cập nhật',
  SummaryUnchanged: '{count} không đổi',
  SummarySkip: '{count} bỏ qua',
  NewDepartments: 'Phòng ban mới: {names}',
  HeadChanges: 'Trưởng phòng: {pairs}',
  HeadSet: '{department}: {name}',
  HeadReplaces: '{department}: {name} (thay cho {previous})',
  Line: 'Dòng',
  Name: 'Họ tên',
  Email: 'Email',
  JobTitle: 'Chức danh',
  Department: 'Phòng ban',
  Manager: 'Quản lý',
  ManagerEmail: 'Email quản lý',
  Reason: 'Lý do',
  Status: 'Trạng thái',
  ChangeTitle: 'chức danh',
  ChangeDepartment: 'phòng ban',
  ChangeManager: 'quản lý',
  Cancel: 'Hủy',
  Import: 'Nhập {count} người',
  ImportAndInvite: 'Nhập và mời {count} người',
  ImportAndInviteNew: 'Nhập {count} người, mời {invited} người mới',
  SendInvites: 'Gửi lời mời ngay',
  SendInvitesHint: 'Người mới sẽ nhận email mời tham gia. Tắt đi để thêm họ vào danh sách nhân viên và sơ đồ tổ chức mà chưa gửi email.',
  UnchangedRows: '{count} dòng không đổi',
  DownloadSkipped: 'Tải các dòng bị bỏ qua',
  NothingToImport: 'Không có gì để nhập',
  Importing: 'Đang nhập {done}/{total}…',
  ImportProgress: 'Tiến độ nhập',
  Stop: 'Dừng nhập',
  Stopping: 'Đang dừng sau dòng hiện tại…',
  Done: 'Đã nhập xong',
  DoneSummary: 'Đã thêm {created} người, cập nhật {updated} người.',
  Stopped: 'Đã dừng nhập',
  StoppedSummary: 'Đã thêm {created} người, cập nhật {updated} người. Còn {remaining} dòng chưa nhập và trưởng phòng chưa được thay đổi. Nhập lại tệp này để hoàn tất.',
  InviteLater: 'Chưa gửi lời mời nào. Để mời những người này sau, mở menu tài khoản, chọn "Mời vào không gian làm việc" rồi gửi đường dẫn cho họ. Hiện Servone chưa gửi được email mời cho người đã có trong danh sách.',
  Failed: '{count} dòng không nhập được:',
  FailNoPermission: 'Bạn không có quyền thêm nhân viên',
  FailSessionExpired: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi nhập lại tệp này',
  FailConnection: 'Mất kết nối tới máy chủ. Nhập lại tệp này để thử lại',
  FailUnknown: 'Không lưu được dòng này. Nhập lại tệp này để thử lại',
  Close: 'Đóng',
  ProblemMissingEmail: 'Thiếu email',
  ProblemBadEmail: 'Email không hợp lệ',
  ProblemBadManagerEmail: 'Email quản lý không hợp lệ',
  ProblemDuplicateEmail: 'Trùng email với một dòng phía trên',
  ProblemNotStaff: 'Email này là của khách, tài khoản đã khóa hoặc liên hệ bên ngoài',
  ProblemMissingName: 'Thiếu họ tên cho người mới',
  ProblemSelfManager: 'Email quản lý trùng với email của chính người này',
  ProblemUnknownManager: 'Không tìm thấy người quản lý trong tệp hay trong workspace',
  ProblemManagerSkipped: 'Dòng của người quản lý bị bỏ qua',
  ProblemHeadConflict: 'Một dòng khác đã chọn trưởng phòng khác cho phòng ban này',
  ProblemParentConflict: 'Một dòng khác đã xếp phòng ban này dưới một người quản lý khác',
  ProblemReportingLoop: 'Quan hệ quản lý bị vòng lặp: cấp dưới lại thành quản lý của cấp trên',
  ProblemTopHasManager: 'Người không có phòng ban được xếp ở cấp cao nhất nên không thể có quản lý'
}

export type Translate = (key: StringKey, params?: Record<string, string | number>) => string

export function textOf (lang: string): Translate {
  return (key, params = {}) => {
    const template = lang === 'vi' ? vi[key] ?? en[key] : en[key]
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
  }
}

export const problemKey = (problem: PlanProblem): StringKey => `Problem${problem}`

export function failureKey (error: Error): StringKey {
  if (error instanceof TypeError) return 'FailConnection'
  if (!(error instanceof PlatformError)) return 'FailUnknown'
  switch (error.status.code) {
    case platform.status.Forbidden:
    case platform.status.Unauthorized:
      return 'FailNoPermission'
    case platform.status.TokenExpired:
      return 'FailSessionExpired'
    case platform.status.ConnectionClosed:
      return 'FailConnection'
    default:
      return 'FailUnknown'
  }
}
