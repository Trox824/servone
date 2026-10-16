import type { Ref, StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'
import { FORM_VERSION, type FormDefinition, type FormField, PRIORITY_OPTIONS } from '@servone/forms'
import type { Sla } from '@servone/notify-rules'

export type Language = 'vi' | 'en'
// nhan-viec and nghi-viec must match JOB_TEMPLATES in packages/servone-ui/.../workflows/onboarding/onboarding.ts.
export const TEMPLATE_KEYS = ['tuyen-dung', 'mua-hang', 'hop-dong', 'it-helpdesk', 'nhan-viec', 'nghi-viec', 'trong'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

type Text = Record<Language, string>

export interface TemplateStatus {
  name: Text
  category: Ref<StatusCategory>
  needsApproval: boolean
}

interface TemplateField extends Omit<FormField, 'label' | 'options'> {
  label: Text
  options?: Record<Language, string[]>
}

export interface TemplateType {
  name: Text
  statuses: TemplateStatus[]
}

export interface WorkflowTemplate {
  name: Text
  // The first type is the default one, used by the form.
  types: TemplateType[]
  fields: TemplateField[]
  helpdesk?: { sla: Sla['targets'], autoCloseDays: number }
}

const { UnStarted, ToDo, Active, Won, Lost } = task.statusCategory

// Tracker shares status docs by name + category, so keep a name in one category.
// First statuses sit in Backlog (Not started); helpdesk New must, as its SLA response clock runs only there.
const ITEM: Text = { vi: 'Công việc', en: 'Item' }

const status = (vi: string, en: string, category: Ref<StatusCategory>, needsApproval = false): TemplateStatus => ({
  name: { vi, en },
  category,
  needsApproval
})

const HELPDESK_NEW = status('Mới', 'New', UnStarted)
const HELPDESK_AFTER_NEW = [
  status('Đã phân công', 'Assigned', ToDo),
  status('Đang xử lý', 'In Progress', Active),
  status('Chờ người yêu cầu', 'Waiting on requester', Active),
  // Closed stays the last Done status: the helpdesk tick auto-closes into it.
  status('Đã giải quyết', 'Resolved', Won),
  status('Đã đóng', 'Closed', Won),
  status('Đã hủy', 'Canceled', Lost)
]
const HELPDESK_STATUSES = [HELPDESK_NEW, ...HELPDESK_AFTER_NEW]
const BLANK_STATUSES = [
  status('Mới', 'New', UnStarted),
  status('Đang làm', 'In Progress', Active),
  status('Hoàn thành', 'Done', Won),
  status('Đã hủy', 'Canceled', Lost)
]

export const TEMPLATES: Record<TemplateKey, WorkflowTemplate> = {
  'tuyen-dung': {
    name: { vi: 'Tuyển dụng', en: 'Hiring' },
    types: [{
      name: ITEM,
      statuses: [
        status('Mới', 'New', UnStarted),
        status('Sàng lọc', 'Screening', Active),
        status('Phỏng vấn', 'Interview', Active),
        status('Thư mời', 'Offer', Active, true),
        status('Nhận việc', 'Hired', Won),
        status('Không tiếp tục', 'Not continued', Lost)
      ]
    }],
    fields: [
      { id: 'candidate', label: { vi: 'Ứng viên', en: 'Candidate' }, kind: 'text', isRequired: true, target: { to: 'title' } },
      { id: 'position', label: { vi: 'Vị trí', en: 'Position' }, kind: 'text', isRequired: true, target: { to: 'append' } },
      { id: 'email', label: { vi: 'Email', en: 'Email' }, kind: 'email', isRequired: true, target: { to: 'append' } },
      { id: 'start', label: { vi: 'Ngày có thể bắt đầu', en: 'Available from' }, kind: 'date', isRequired: false, target: { to: 'dueDate' } }
    ]
  },
  'mua-hang': {
    name: { vi: 'Mua hàng', en: 'Purchase' },
    types: [{
      name: ITEM,
      statuses: [
        status('Đề nghị', 'Requested', UnStarted),
        status('Lấy báo giá', 'Quoting', Active),
        status('Chờ duyệt', 'Awaiting approval', Active, true),
        status('Đã mua', 'Purchased', Won),
        status('Hủy', 'Canceled', Lost)
      ]
    }],
    fields: [
      { id: 'item', label: { vi: 'Hàng cần mua', en: 'Item' }, kind: 'text', isRequired: true, target: { to: 'title' } },
      { id: 'quantity', label: { vi: 'Số lượng', en: 'Quantity' }, kind: 'number', isRequired: true, target: { to: 'append' } },
      { id: 'estimate', label: { vi: 'Dự toán (VND)', en: 'Estimate (VND)' }, kind: 'number', isRequired: true, target: { to: 'append' } },
      { id: 'needed-by', label: { vi: 'Cần trước ngày', en: 'Needed by' }, kind: 'date', isRequired: false, target: { to: 'dueDate' } },
      { id: 'reason', label: { vi: 'Lý do', en: 'Reason' }, kind: 'longText', isRequired: false, target: { to: 'description' } }
    ]
  },
  'hop-dong': {
    name: { vi: 'Hợp đồng', en: 'Contract' },
    types: [{
      name: ITEM,
      statuses: [
        status('Soạn thảo', 'Drafting', UnStarted),
        status('Rà soát', 'Review', Active),
        status('Chờ duyệt', 'Awaiting approval', Active, true),
        status('Đã ký', 'Signed', Won),
        status('Hủy', 'Canceled', Lost)
      ]
    }],
    fields: [
      { id: 'contract', label: { vi: 'Tên hợp đồng', en: 'Contract' }, kind: 'text', isRequired: true, target: { to: 'title' } },
      { id: 'counterparty', label: { vi: 'Đối tác', en: 'Counterparty' }, kind: 'text', isRequired: true, target: { to: 'append' } },
      { id: 'value', label: { vi: 'Giá trị (VND)', en: 'Value (VND)' }, kind: 'number', isRequired: true, target: { to: 'append' } },
      { id: 'expires', label: { vi: 'Ngày hết hạn', en: 'Expires on' }, kind: 'date', isRequired: false, target: { to: 'dueDate' } }
    ]
  },
  'it-helpdesk': {
    name: { vi: 'Hỗ trợ IT', en: 'IT Helpdesk' },
    types: [
      { name: { vi: 'Sự cố', en: 'Incident' }, statuses: HELPDESK_STATUSES },
      { name: { vi: 'Yêu cầu dịch vụ', en: 'Service request' }, statuses: HELPDESK_STATUSES },
      { name: { vi: 'Vấn đề', en: 'Problem' }, statuses: HELPDESK_STATUSES },
      {
        name: { vi: 'Thay đổi', en: 'Change' },
        // Right after New so the usual path goes through it; the approval guard only stops moves out of it.
        statuses: [HELPDESK_NEW, status('Duyệt thay đổi', 'Change approval', ToDo, true), ...HELPDESK_AFTER_NEW]
      }
    ],
    fields: [
      { id: 'subject', label: { vi: 'Tiêu đề', en: 'Subject' }, kind: 'text', isRequired: true, target: { to: 'title' } },
      { id: 'requester', label: { vi: 'Email người yêu cầu', en: 'Requester email' }, kind: 'email', isRequired: true, target: { to: 'append' } },
      {
        id: 'category',
        label: { vi: 'Loại', en: 'Category' },
        kind: 'select',
        options: { vi: ['Phần cứng', 'Phần mềm', 'Quyền truy cập', 'Mạng', 'Khác'], en: ['Hardware', 'Software', 'Access', 'Network', 'Other'] },
        isRequired: true,
        target: { to: 'append' }
      },
      {
        id: 'impact',
        label: { vi: 'Mức ảnh hưởng', en: 'Impact' },
        kind: 'select',
        options: { vi: [...PRIORITY_OPTIONS], en: [...PRIORITY_OPTIONS] },
        isRequired: true,
        target: { to: 'priority' }
      },
      { id: 'description', label: { vi: 'Mô tả', en: 'Description' }, kind: 'longText', isRequired: false, target: { to: 'description' } }
    ],
    helpdesk: {
      sla: {
        urgent: { respondHours: 1, resolveHours: 4 },
        high: { respondHours: 4, resolveHours: 24 },
        medium: { respondHours: 24, resolveHours: 72 },
        low: { respondHours: 48, resolveHours: 120 }
      },
      autoCloseDays: 3
    }
  },
  // Jobs are started from a person in People, which adds the steps as sub-items; no form.
  'nhan-viec': { name: { vi: 'Nhận việc', en: 'Onboarding' }, types: [{ name: ITEM, statuses: BLANK_STATUSES }], fields: [] },
  'nghi-viec': { name: { vi: 'Nghỉ việc', en: 'Offboarding' }, types: [{ name: ITEM, statuses: BLANK_STATUSES }], fields: [] },
  trong: {
    name: { vi: 'Trống', en: 'Blank' },
    types: [{ name: ITEM, statuses: BLANK_STATUSES }],
    fields: []
  }
}

export function isTemplateKey (key: string): key is TemplateKey {
  return TEMPLATE_KEYS.some((it) => it === key)
}

export function formOf (template: WorkflowTemplate, language: Language): FormDefinition {
  return { version: FORM_VERSION, fields: template.fields.map((field) => ({ ...field, label: field.label[language], options: field.options?.[language] })) }
}
