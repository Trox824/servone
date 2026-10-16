import { expect, test, users } from '../lib/fixtures'
import { openApp, submitIssueForm, uniqueTag } from '../lib/ui'

const STORY_POINTS = 3
const STORY_COUNT = 5
const PLANNED = 3
const DONE = 2

test('Scenario 3: epic, stories, sprint, burndown', async ({ session, company, tr }) => {
  const owner = await session(users().owner)
  const ws = await company(owner, `Tracker ${uniqueTag()}`)
  const { page } = owner
  const tag = uniqueTag()
  const projectName = `Launch ${tag}`
  const epicTitle = `Epic ${tag}`
  const stories = Array.from({ length: STORY_COUNT }, (_, i) => `Story ${i + 1} ${tag}`)
  const nav = page.locator('.antiPanel-navigator')

  await test.step('create a Scrum project', async () => {
    await openApp(page, ws.workspaceUrl, 'tracker')
    await page.getByRole('button', { name: tr('Tạo dự án', 'Create project') }).first().click()
    const form = page.locator('form[id="tracker:string:NewProject"]')
    await form.locator('div#project-title input').fill(projectName)
    await form.locator('button[type="submit"]').click()
    await expect(form).toBeHidden()
    await nav.getByText(projectName, { exact: true }).click()
    await nav.getByText('Sprint', { exact: true }).click()
    const setup = page.getByRole('button', { name: tr('Thiết lập sprint', 'Set up sprints') })
    if (await setup.isVisible()) await setup.click()
  })

  await test.step('add an epic with 5 stories in points', async () => {
    await nav.getByText(tr('Epic', 'Epics'), { exact: true }).click()
    await page.getByRole('button', { name: tr('Epic mới', 'New epic') }).click()
    await submitIssueForm(page, tr, { title: epicTitle, kind: 'Epic' })
    for (const title of stories) {
      await page.locator('#tracker-string-NewIssue').click()
      await submitIssueForm(page, tr, { title, kind: 'Story', parentTitle: epicTitle, points: STORY_POINTS })
    }
  })

  await test.step('plan 3 stories into a sprint from the backlog', async () => {
    await nav.getByText('Sprint', { exact: true }).click()
    await page.locator('#planning').click()
    await page.getByRole('button', { name: tr('Sprint mới', 'New sprint') }).click()
    for (const title of stories.slice(0, PLANNED)) {
      const row = page.locator('[data-issue]', { hasText: title })
      await row.hover()
      await row.locator('input[type=checkbox], [role=checkbox]').first().click()
    }
    await page.getByRole('button', { name: tr('Chuyển vào sprint', 'Move to sprint') }).click()
    await page.locator('.popup').last().getByRole('button').first().click()
  })

  await test.step('start the sprint', async () => {
    await page.getByRole('button', { name: tr('Bắt đầu sprint', 'Start sprint') }).first().click()
    await page.getByRole('button', { name: tr('Bắt đầu', 'Start'), exact: true }).click()
  })

  await test.step('move 2 to Done on the sprint board', async () => {
    await page.locator('#board').click()
    // Status names are model data and stay English.
    const doneColumn = page.locator('.header', { hasText: /^Done/ }).first()
    for (const title of stories.slice(0, DONE)) {
      await page.getByText(title, { exact: true }).dragTo(doneColumn)
    }
    await expect(page.getByText(tr(`${DONE * STORY_POINTS}/${PLANNED * STORY_POINTS} điểm`, `${DONE * STORY_POINTS}/${PLANNED * STORY_POINTS} pts`))).toBeVisible()
  })

  await test.step('complete the sprint; the open story rolls into the next one', async () => {
    await page.getByRole('button', { name: tr('Hoàn tất sprint', 'Complete sprint') }).first().click()
    await expect(page.getByText(tr(`${DONE} đã xong · ${PLANNED - DONE} còn mở`, `${DONE} done · ${PLANNED - DONE} open`))).toBeVisible()
    await page.getByRole('radio', { name: tr('Một sprint mới', 'A new sprint') }).check()
    await page.getByRole('button', { name: tr('Hoàn tất', 'Complete'), exact: true }).click()
    await page.locator('#planning').click()
    await expect(page.locator('[data-issue]', { hasText: stories[PLANNED - 1] })).toBeVisible()
  })

  await test.step('burndown and epic progress show the right numbers', async () => {
    await nav.getByText(tr('Báo cáo', 'Reports'), { exact: true }).click()
    await expect(page.locator('figure svg').first()).toBeVisible()
    await nav.getByText(tr('Epic', 'Epics'), { exact: true }).click()
    const epicRow = page.locator('tr, [role=row]', { hasText: epicTitle })
    await expect(epicRow).toContainText(tr(`${DONE * STORY_POINTS}/${STORY_COUNT * STORY_POINTS} điểm`, `${DONE * STORY_POINTS}/${STORY_COUNT * STORY_POINTS} pts`))
  })
})
