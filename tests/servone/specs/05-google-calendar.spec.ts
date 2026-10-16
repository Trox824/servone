import { expect, test, users } from '../lib/fixtures'
import { openApp, uniqueTag } from '../lib/ui'

// Google sign-in blocks automated browsers, so only the hand-off to Google is checked; the sync is a manual check.
test('Scenario 5: Google Calendar connect starts Google OAuth', async ({ session, company, tr }) => {
  const owner = await session(users().owner)
  const ws = await company(owner, `Google ${uniqueTag()}`)
  const { page } = owner

  await openApp(page, ws.workspaceUrl, 'setting/integrations')
  const card = page.locator('div', { hasText: 'Google Calendar' }).filter({ has: page.getByRole('button', { name: tr('Kết nối', 'Connect'), exact: true }) }).last()
  await card.getByRole('button', { name: tr('Kết nối', 'Connect'), exact: true }).click()
  await expect(page.getByText(tr('Kết nối tài khoản Google Calendar', 'Connect Google Calendar account'))).toBeVisible()
  const [google] = await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('.popup').last().getByRole('button', { name: tr('Kết nối', 'Connect'), exact: true }).click()
  ])
  await expect(google).toHaveURL(/accounts\.google\.com/)
  await google.close()
})
