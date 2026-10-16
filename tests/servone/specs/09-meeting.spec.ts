import type { Page } from '@playwright/test'
import { expect, test, users } from '../lib/fixtures'
import { openApp, submitIssueForm, uniqueTag, type Tr } from '../lib/ui'

const ACTION_ITEMS = 2

async function openMeetingFromLich (page: Page, tr: Tr, workspaceUrl: string, title: string): Promise<void> {
  await openApp(page, workspaceUrl, 'time')
  await page.getByText(title).first().click()
  // "Join" shows from 10 minutes before the start; earlier the same button reads "Open meeting".
  await page.getByRole('button', { name: new RegExp(`^(${tr('Tham gia', 'Join')}|${tr('Mở cuộc họp', 'Open meeting')})$`) }).first().click()
  await expect(page).toHaveURL(/\/love/)
}

test('Scenario 9: meeting from Lịch with 2 people, action items become tasks', async ({ session, company, tr }) => {
  const { owner: ownerEmail, memberA, memberB } = users()
  const owner = await session(ownerEmail)
  const guests = [await session(memberA), await session(memberB)]
  const ws = await company(owner, `Meeting ${uniqueTag()}`, guests)
  const title = `Standup ${uniqueTag()}`

  await test.step('create a meeting from Lịch with 2 people', async () => {
    await openApp(owner.page, ws.workspaceUrl, 'time')
    await owner.page.getByRole('button', { name: tr('Tạo', 'Create'), exact: true }).click()
    await owner.page.getByRole('button', { name: tr('Thêm cuộc họp video', 'Add video meeting') }).click()
    await owner.page.getByLabel(tr('Tiêu đề', 'Title'), { exact: true }).fill(title)
    for (const guest of guests) {
      await owner.page.locator('#lich-quick-guests').click()
      await owner.page.getByPlaceholder(tr('Tìm người hoặc nhập email', 'Search people or type an email')).fill(guest.email)
      await owner.page.keyboard.press('Enter')
    }
    await owner.page.getByRole('button', { name: tr('Lưu', 'Save'), exact: true }).click()
  })

  await test.step('everyone joins from the event in one click', async () => {
    for (const person of [owner, ...guests]) await openMeetingFromLich(person.page, tr, ws.workspaceUrl, title)
  })

  await test.step('2 action items become tasks', async () => {
    for (let n = 1; n <= ACTION_ITEMS; n++) {
      await owner.page.getByRole('button', { name: tr('Thêm việc', 'Add action item') }).click()
      // TODO(qa): pick an owner in the assignee field once the test users' display names are known.
      await submitIssueForm(owner.page, tr, { title: `Follow-up ${n} ${title}` })
    }
    await expect(owner.page.getByRole('button', { name: new RegExp(`Follow-up \\d ${title}`) })).toHaveCount(ACTION_ITEMS)
  })
})
