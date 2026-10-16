import { expect, test, users } from '../lib/fixtures'
import { createIssue, openApp, uniqueTag } from '../lib/ui'

// Labels come from the plan (Lịch tabs Của tôi / Nhóm); the tabs are not built yet, so this fails at the first tab.
test('Scenario 4: plan 3 tasks into tomorrow in Lịch', async ({ session, company, tr }) => {
  const { owner: managerEmail, memberA } = users()
  const manager = await session(managerEmail)
  const staff = await session(memberA)
  const ws = await company(manager, `Plan ${uniqueTag()}`, [staff])
  const tasks = [1, 2, 3].map((n) => `Plan ${n} ${uniqueTag()}`)

  await test.step('staff has 3 tasks', async () => {
    for (const title of tasks) await createIssue(staff.page, tr, ws.workspaceUrl, title)
  })

  await test.step('drag them into tomorrow in Lịch, Của tôi', async () => {
    await openApp(staff.page, ws.workspaceUrl, 'time')
    await staff.page.getByRole('tab', { name: tr('Của tôi', 'Mine') }).click()
    await staff.page.getByRole('button', { name: tr('Tới', 'Next') }).click()
    const tomorrow = staff.page.locator('[data-lich]').getByRole('grid').first()
    for (const title of tasks) await staff.page.getByText(title, { exact: true }).first().dragTo(tomorrow)
    for (const title of tasks) await expect(tomorrow.getByText(title)).toBeVisible()
  })

  await test.step('the manager sees them in Lịch, Nhóm', async () => {
    await openApp(manager.page, ws.workspaceUrl, 'time')
    await manager.page.getByRole('tab', { name: tr('Nhóm', 'Team') }).click()
    await manager.page.getByRole('button', { name: tr('Tới', 'Next') }).click()
    for (const title of tasks) await expect(manager.page.getByText(title).first()).toBeVisible()
  })
})
