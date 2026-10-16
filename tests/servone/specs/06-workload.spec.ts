import { expect, test, users } from '../lib/fixtures'
import { openApp, uniqueTag } from '../lib/ui'

// Lịch, Nguồn lực is not built yet (lich/resources/strings.ts reserves the name); this fails at the tab.
test('Scenario 6: manager sees who is over-booked in Nguồn lực', async ({ session, company, tr }) => {
  const { owner: managerEmail, memberA } = users()
  const manager = await session(managerEmail)
  const staff = await session(memberA)
  const ws = await company(manager, `Workload ${uniqueTag()}`, [staff])
  const { page } = manager

  await openApp(page, ws.workspaceUrl, 'time')
  await page.getByRole('tab', { name: tr('Nguồn lực', 'Workload') }).click()
  // TODO(qa): seed planned hours above 8 h/day and assert the over-booked mark once the view's markup exists.
  const memberRow = page.getByRole('row').nth(1) // row 0 is the header
  await expect(memberRow).toBeVisible()
  await memberRow.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
