import type { Page } from '@playwright/test'
import { env } from '../lib/env'
import { expect, test, users, type Session } from '../lib/fixtures'
import { waitForOtp } from '../lib/inbox'
import { acceptInvite, createInviteLinkUi, enterOtp, uniqueTag, type Tr } from '../lib/ui'

const SCENARIO_BUDGET_MS = 5 * 60_000

async function createCompanyUi (page: Page, tr: Tr, name: string): Promise<string> {
  await page.goto(`${env.baseUrl}/login/createWorkspace`)
  await page.locator('input[name=workspace]').fill(name)
  await page.getByRole('button', { name: tr('Tạo không gian làm việc', 'Create workspace'), exact: true }).click()
  await expect(page.locator('#profile-button')).toBeVisible({ timeout: 180_000 })
  return new URL(page.url()).pathname.split('/')[2]
}

async function inviteTwo (owner: Session, invitees: Session[], tr: Tr, workspaceUrl: string): Promise<void> {
  for (const invitee of invitees) {
    const link = await createInviteLinkUi(owner.page, tr)
    await owner.page.keyboard.press('Escape')
    await acceptInvite(invitee.page, link)
    expect(new URL(invitee.page.url()).pathname).toContain(`/workbench/${workspaceUrl}`)
  }
}

test.describe('Scenario 1: signup', () => {
  test('a new visitor signs up, creates Công ty A, invites 2 people', async ({ browser, session, ownWorkspace, tr, lang }) => {
    test.skip(!env.isSignupEnabled, 'Production signup is off (invite only); set SERVONE_SIGNUP=1 when it is on')
    const startedAt = Date.now()
    const email = env.signupEmailTemplate.replace('{tag}', uniqueTag())
    // Left open: workspace deletion in teardown signs its request with this context's cookie.
    const context = await browser.newContext()
    await context.addInitScript((seed) => localStorage.setItem('lang', seed), lang)
    const page = await context.newPage()
    const visitor: Session = { email, context, page, request: context.request }

    await test.step('sign up with email, OTP under 30 s', async () => {
      await page.goto(`${env.baseUrl}/login/signup`)
      await page.locator('input[name=given-name]').fill('Lan')
      await page.locator('input[name=family-name]').fill('Nguyễn')
      await page.locator('input[name=email]').fill(email)
      const { code } = await waitForOtp(email, async () => {
        await page.getByRole('button', { name: tr('Đăng ký', 'Sign Up'), exact: true }).click()
      })
      await enterOtp(page, code)
    })

    const workspaceUrl = await test.step('create company', async () => {
      const url = await createCompanyUi(page, tr, `${tr('Công ty A', 'Company A')} ${uniqueTag()}`)
      ownWorkspace(visitor, url)
      return url
    })

    await test.step('invite 2 people by link', async () => {
      const { memberA, memberB } = users()
      await inviteTwo(visitor, [await session(memberA), await session(memberB)], tr, workspaceUrl)
    })

    expect(Date.now() - startedAt).toBeLessThan(SCENARIO_BUDGET_MS)
  })

  test('an existing user creates Công ty A and invites 2 people by link', async ({ session, ownWorkspace, tr }) => {
    const startedAt = Date.now()
    const { owner: ownerEmail, memberA, memberB } = users()
    const owner = await session(ownerEmail)

    const workspaceUrl = await test.step('create company', async () => {
      const url = await createCompanyUi(owner.page, tr, `${tr('Công ty A', 'Company A')} ${uniqueTag()}`)
      ownWorkspace(owner, url)
      return url
    })

    await test.step('invite 2 people from the account menu', async () => {
      await inviteTwo(owner, [await session(memberA), await session(memberB)], tr, workspaceUrl)
    })

    expect(Date.now() - startedAt).toBeLessThan(SCENARIO_BUDGET_MS)
  })
})
