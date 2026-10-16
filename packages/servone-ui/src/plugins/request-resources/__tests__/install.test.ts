import { translate } from '@hcengineering/platform'
import { WAITING_APPROVAL } from '@servone/approvals/src/gate'
import '../install'

describe('refused move message', () => {
  it('explains a refused drag in Vietnamese and English', async () => {
    expect(await translate(WAITING_APPROVAL, {}, 'vi')).toBe('Đang chờ duyệt — cần người duyệt quyết định trước')
    expect(await translate(WAITING_APPROVAL, {}, 'en')).toBe('Waiting for approval — the approver must decide first')
  })
})
