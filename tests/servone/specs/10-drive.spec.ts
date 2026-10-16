import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { expect, test, users } from '../lib/fixtures'
import { issueForm, openApp, submitIssueForm, uniqueTag } from '../lib/ui'

// 1x1 PNG and a one-page PDF, so the suite carries no binary fixtures.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj',
  '2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj',
  '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj',
  'trailer <</Root 1 0 R>>',
  '%%EOF'
].join('\n')

test('Scenario 10: upload a folder, preview PDF and image, find a task attachment', async ({ session, company, tr }, testInfo) => {
  const owner = await session(users().owner)
  const ws = await company(owner, `Drive ${uniqueTag()}`)
  const { page } = owner
  const folder = testInfo.outputPath(`Hop-dong-${uniqueTag()}`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'bao-gia.pdf'), MINIMAL_PDF)
  writeFileSync(join(folder, 'logo.png'), Buffer.from(PNG_1X1, 'base64'))

  await test.step('create a drive and upload a folder', async () => {
    await openApp(page, ws.workspaceUrl, 'drive')
    await page.getByRole('button', { name: tr('Tạo Drive', 'Create Drive') }).first().click()
    const dialog = page.locator('.popup').last()
    await dialog.locator('#teamspace-title input').fill(`Team ${uniqueTag()}`)
    await dialog.getByRole('button', { name: tr('Tạo', 'Create'), exact: true }).click()
    await page.locator('#uploader-string-UploadFiles + button').click()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: tr('Tải thư mục lên', 'Upload Folders') }).click()
    ])
    await chooser.setFiles(folder)
    await page.getByText(folder.split('/').pop() ?? '', { exact: true }).first().dblclick()
  })

  await test.step('preview the PDF and the image in place', async () => {
    await page.getByText('bao-gia.pdf', { exact: true }).first().click()
    await expect(page.locator('iframe, embed, object').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByText('logo.png', { exact: true }).first().click()
    await expect(page.locator('img[src*="blob"], img[src*="files"], img[src*="logo"]').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step("a task's attachment shows under Tệp đính kèm", async () => {
    const taskTitle = `Attach ${uniqueTag()}`
    await openApp(page, ws.workspaceUrl, 'tracker')
    await page.locator('#tracker-string-NewIssue').click()
    await issueForm(page).locator('input[type="file"]#file').setInputFiles(join(folder, 'bao-gia.pdf'))
    await submitIssueForm(page, tr, { title: taskTitle })
    await openApp(page, ws.workspaceUrl, 'drive')
    await page.getByText(tr('Tệp đính kèm', 'Attachments'), { exact: true }).first().click()
    await expect(page.getByText('bao-gia.pdf').first()).toBeVisible()
  })
})
