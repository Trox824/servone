import { expect, test, users } from '../lib/fixtures'
import { createJob, createWorkflowFromTemplate, moveToNextStage, openApp, uniqueTag } from '../lib/ui'

const REJECT_REASON = 'Over budget for this quarter' // RejectDialog needs at least 10 characters
const MOVES_TO_APPROVAL = 2 // Purchase template: Requested, Quoting, Awaiting approval

test('Scenario 8: leave request approved, purchase request rejected with a reason', async ({ session, company, tr }) => {
  const { owner: managerEmail, memberA } = users()
  const manager = await session(managerEmail)
  const staff = await session(memberA)
  const ws = await company(manager, `Approval ${uniqueTag()}`, [staff])
  const leaveReason = `Family trip ${uniqueTag()}`

  await test.step('staff submits Đơn nghỉ phép', async () => {
    await openApp(staff.page, ws.workspaceUrl, 'time')
    await staff.page.getByRole('button', { name: tr('Xin nghỉ', 'Request leave') }).click()
    await staff.page.locator('#lich-leave-reason').fill(leaveReason)
    // "Book leave" instead of "Send request" means no approver was found for staff.
    await staff.page.getByRole('button', { name: tr('Gửi đơn', 'Send request'), exact: true }).click()
  })

  await test.step('manager approves it; the log shows the approval', async () => {
    await openApp(manager.page, ws.workspaceUrl, 'inbox')
    await manager.page.getByRole('tab', { name: tr('Chờ tôi duyệt', 'Waiting for my approval') }).click()
    await manager.page.getByText(leaveReason).first().click()
    await manager.page.getByRole('button', { name: tr('Duyệt', 'Approve'), exact: true }).click()
    await expect(manager.page.getByText(tr('Đã duyệt', 'Approved')).first()).toBeVisible()
  })

  await test.step('the leave shows in Lịch, Nhóm', async () => {
    await openApp(manager.page, ws.workspaceUrl, 'time')
    await manager.page.getByRole('tab', { name: tr('Nhóm', 'Team') }).click()
    await expect(manager.page.getByText(tr('Nghỉ phép', 'Leave')).first()).toBeVisible()
  })

  const purchaseTitle = `Laptop ${uniqueTag()}`

  await test.step('staff submits a purchase request', async () => {
    const workflowName = `${tr('Mua hàng', 'Purchase')} ${uniqueTag()}`
    await createWorkflowFromTemplate(manager.page, tr, ws.workspaceUrl, workflowName, tr('Mua hàng', 'Purchase'))
    await openApp(staff.page, ws.workspaceUrl, 'approval')
    await staff.page.getByText(workflowName, { exact: true }).first().click()
    await createJob(staff.page, tr, purchaseTitle)
    for (let move = 0; move < MOVES_TO_APPROVAL; move++) await moveToNextStage(staff.page, tr)
  })

  await test.step('reject needs a reason, and the submitter sees it', async () => {
    await openApp(manager.page, ws.workspaceUrl, 'inbox')
    await manager.page.getByRole('tab', { name: tr('Chờ tôi duyệt', 'Waiting for my approval') }).click()
    await manager.page.getByText(purchaseTitle).first().click()
    await manager.page.getByRole('button', { name: tr('Từ chối', 'Reject'), exact: true }).click()
    const dialog = manager.page.locator('.popup').last()
    const confirm = dialog.getByRole('button', { name: tr('Từ chối', 'Reject'), exact: true })
    await expect(confirm).toBeDisabled()
    await dialog.locator('textarea').fill(REJECT_REASON)
    await confirm.click()
    await staff.page.reload()
    await expect(staff.page.locator('span.approval-line')).toContainText(`${tr('Đã từ chối', 'Rejected')}: ${REJECT_REASON}`)
  })
})
