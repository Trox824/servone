import type { IntlString, Plugin } from '@hcengineering/platform'

export const approvalId = 'servone-approval' as Plugin

export const en = {
  Waiting: 'Waiting for approval',
  WaitingFor: 'Waiting for approval from {name}',
  ApprovalTo: 'Approval to move to {status}',
  ApprovalRequest: 'Approval request',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Canceled: 'Canceled',
  Withdrawn: 'Withdrawn',
  ActivityRequested: 'Approval requested from',
  RequestedBy: 'Requested by {name}',
  Approver: 'Approver',
  Reason: 'Reason',
  Approve: 'Approve',
  Reject: 'Reject',
  Withdraw: 'Withdraw',
  RejectTitle: 'Reject request',
  ReasonHint: 'The requester will see this reason.',
  ReasonCount: '{count}/{min} characters',
  ErrorDecided: 'This request has already been decided.',
  ErrorNotConfigured: 'The approvals service is not set up on this server.',
  ErrorUnknown: 'Could not save the decision. Try again.',
  PickNext: 'Who approves next?',
  BookingRoom: 'Room booking',
  BookingCar: 'Car booking',
  BookingEquipment: 'Equipment booking',
  BookingOther: 'Resource booking',
  Resource: 'Resource',
  Time: 'Time',
  Purpose: 'Purpose',
  BookingExpiryHint: 'If it is not approved by the start time, the booking expires and frees the slot.'
}

export type StringKey = keyof typeof en

export const vi: Record<StringKey, string> = {
  Waiting: 'Chờ duyệt',
  WaitingFor: 'Chờ {name} duyệt',
  ApprovalTo: 'Duyệt chuyển sang {status}',
  ApprovalRequest: 'Yêu cầu duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Đã từ chối',
  Canceled: 'Đã hủy',
  Withdrawn: 'Đã rút lại',
  ActivityRequested: 'Đã gửi duyệt cho',
  RequestedBy: 'Đề xuất bởi {name}',
  Approver: 'Người duyệt',
  Reason: 'Lý do',
  Approve: 'Duyệt',
  Reject: 'Từ chối',
  Withdraw: 'Rút lại',
  RejectTitle: 'Từ chối đề xuất',
  ReasonHint: 'Người đề xuất sẽ thấy lý do này.',
  ReasonCount: '{count}/{min} ký tự',
  ErrorDecided: 'Đề xuất này đã được xử lý.',
  ErrorNotConfigured: 'Máy chủ này chưa cài đặt dịch vụ duyệt.',
  ErrorUnknown: 'Không lưu được quyết định. Thử lại.',
  PickNext: 'Ai duyệt bước tiếp theo?',
  BookingRoom: 'Đặt phòng',
  BookingCar: 'Đặt xe',
  BookingEquipment: 'Đặt thiết bị',
  BookingOther: 'Đặt tài nguyên',
  Resource: 'Tài nguyên',
  Time: 'Thời gian',
  Purpose: 'Mục đích',
  BookingExpiryHint: 'Nếu chưa duyệt trước giờ bắt đầu, lượt đặt hết hạn và tự giải phóng để người khác dùng.'
}

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${approvalId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>

export const waitingApprovalMessage = {
  en: 'Waiting for approval — the approver must decide first',
  vi: 'Đang chờ duyệt — cần người duyệt quyết định trước'
}
