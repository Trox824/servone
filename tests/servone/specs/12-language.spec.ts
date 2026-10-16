import { env } from '../lib/env'
import { expect, test, users } from '../lib/fixtures'
import { expectCleanLanguage, openApp, signInWithOtp, switchLanguage, translator, uniqueTag, VIETNAMESE_LETTER } from '../lib/ui'

const MVP_APPS = ['tracker', 'time', 'approval', 'mail', 'drive', 'love', 'inbox', 'setting']

// vi run: a new user from Vietnam gets Vietnamese by default, then switches to English.
// en run: a user who picked English, then switches to Vietnamese.
test('Scenario 12: one language from login to OTP mail to workspace, then switch', async ({ browser, session, company, lang, tr }) => {
  const ownerEmail = users().owner
  const ws = await company(await session(ownerEmail), `Language ${uniqueTag()}`)
  const context = await browser.newContext()
  if (lang === 'en') await context.addInitScript(() => localStorage.setItem('lang', 'en'))
  const page = await context.newPage()

  await test.step('login page and OTP mail are in the run language', async () => {
    await page.goto(`${env.baseUrl}/login/login`)
    await expect(page.getByRole('button', { name: tr('Đăng nhập', 'Log In'), exact: true })).toBeVisible()
    await expectCleanLanguage(page, lang)
    const otpMail = await signInWithOtp(page, ownerEmail, tr)
    if (lang === 'vi') expect(otpMail).toMatch(VIETNAMESE_LETTER)
    else expect(otpMail).not.toMatch(VIETNAMESE_LETTER)
  })

  await test.step('every MVP screen is in the run language', async () => {
    for (const app of MVP_APPS) {
      await openApp(page, ws.workspaceUrl, app)
      await expectCleanLanguage(page, lang, [ws.workspaceUrl])
    }
  })

  const other = lang === 'vi' ? 'en' : 'vi'
  await test.step(`switch to ${other} in the profile menu; every MVP screen follows`, async () => {
    await switchLanguage(page, lang, other)
    for (const app of MVP_APPS) {
      await openApp(page, ws.workspaceUrl, app)
      await expectCleanLanguage(page, other, [ws.workspaceUrl])
    }
    await page.locator('#profile-button').click()
    await expect(page.getByRole('button', { name: translator(other)('Giao diện', 'Appearance'), exact: true })).toBeVisible()
  })

  await context.close()
})
