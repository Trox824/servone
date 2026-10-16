import { env } from '../lib/env'
import { expect, test, users } from '../lib/fixtures'
import { issueForm, openApp, uniqueTag } from '../lib/ui'

const NEW_MAIL_DEADLINE_MS = 60_000 // scenario 11: a new email arrives within 1 minute

test('Scenario 11: Zoho mailbox, sync, reply in thread, Tạo việc', async ({ session, company, tr }) => {
  const zoho = env.zoho
  test.skip(zoho === undefined, 'Set SERVONE_ZOHO_EMAIL and SERVONE_ZOHO_APP_PASSWORD')
  if (zoho === undefined) return
  const owner = await session(users().owner)
  const ws = await company(owner, `Mail ${uniqueTag()}`)
  const { page } = owner
  const subject = `Báo giá ${uniqueTag()}`
  const replyText = `Reply ${uniqueTag()}`

  await test.step('connect a Zoho mailbox with an app password', async () => {
    await openApp(page, ws.workspaceUrl, 'mail')
    await page.getByRole('button', { name: 'Zoho Mail' }).click()
    await page.locator('#connect-email').fill(zoho.email)
    await page.locator('#connect-password').fill(zoho.appPassword)
    await page.getByRole('button', { name: tr('Kết nối', 'Connect'), exact: true }).click()
    await expect(page.getByText(tr('Kết nối hộp thư', 'Connect your mailbox'))).toBeHidden({ timeout: 120_000 })
  })

  await test.step('a new email arrives within 1 minute', async () => {
    // Sent to itself: the mailbox is both sender and recipient, so no second account is needed.
    await page.getByRole('button', { name: tr('Thư mới', 'New email') }).click()
    const composer = page.getByRole('group', { name: tr('Thư mới', 'New email') })
    await composer.locator('#composer-to').fill(zoho.email)
    await composer.locator('#composer-to').press('Enter')
    await composer.getByLabel(tr('Chủ đề', 'Subject')).fill(subject)
    await composer.getByLabel(tr('Nội dung thư', 'Message')).fill('Kính gửi anh chị, gửi báo giá.')
    await composer.getByRole('button', { name: tr('Gửi', 'Send'), exact: true }).click()
    await expect(page.getByText(subject).first()).toBeVisible({ timeout: NEW_MAIL_DEADLINE_MS })
  })

  await test.step('a reply stays in the same thread', async () => {
    await page.getByText(subject).first().click()
    const pane = page.locator('section[aria-label]').filter({ hasText: subject }).last()
    await pane.getByRole('button', { name: tr('Trả lời', 'Reply'), exact: true }).click()
    await page.getByLabel(tr('Nội dung thư', 'Message')).last().fill(replyText)
    await page.getByRole('button', { name: tr('Gửi', 'Send'), exact: true }).last().click()
    await expect(pane.getByText(replyText)).toBeVisible({ timeout: NEW_MAIL_DEADLINE_MS })
  })

  await test.step('Tạo việc makes a task linked to the email', async () => {
    await page.getByRole('button', { name: tr('Tạo việc', 'Create task'), exact: true }).first().click()
    await expect(issueForm(page).locator('input[type="text"]').first()).toHaveValue(new RegExp(subject))
    await issueForm(page).locator('button[type="submit"]').click()
    await expect(issueForm(page)).toBeHidden()
  })
})
