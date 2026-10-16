import { accountRpc, AccountRpcError, selectWorkspace } from '../lib/account'
import { expect, test, users } from '../lib/fixtures'
import { createIssue, openApp, uniqueTag } from '../lib/ui'
import { env } from '../lib/env'

// An absence check passes instantly, so give the page time to load whatever it would leak.
const SETTLE_MS = 5000

test('Scenario 2: isolation between Công ty A and Công ty B', async ({ session, company, tr }) => {
  const { owner: ownerEmail, memberA: memberAEmail, memberB: memberBEmail } = users()
  const ownerA = await session(ownerEmail)
  const memberA = await session(memberAEmail)
  const ownerB = await session(memberBEmail)
  const companyA = await company(ownerA, `${tr('Công ty A', 'Company A')} ${uniqueTag()}`, [memberA])
  const companyB = await company(ownerB, `${tr('Công ty B', 'Company B')} ${uniqueTag()}`)
  const secretTitle = `Secret A ${uniqueTag()}`

  await test.step('A has a task', async () => {
    await createIssue(ownerA.page, tr, companyA.workspaceUrl, secretTitle)
  })

  await test.step('the invitee joined A and no other company', async () => {
    const workspaces = await accountRpc<Array<{ url: string }>>(memberA.request, 'getUserWorkspaces', {})
    const urls = workspaces.map((ws) => ws.url)
    expect(urls).toContain(companyA.workspaceUrl)
    expect(urls).not.toContain(companyB.workspaceUrl)
  })

  await test.step('B cannot get a token for A through the API', async () => {
    await expect(selectWorkspace(ownerB.request, companyA.workspaceUrl)).rejects.toBeInstanceOf(AccountRpcError)
  })

  await test.step('B cannot open A by URL', async () => {
    await ownerB.page.goto(`${env.baseUrl}/workbench/${companyA.workspaceUrl}/tracker`)
    await ownerB.page.waitForTimeout(SETTLE_MS)
    await expect(ownerB.page.getByText(secretTitle)).toHaveCount(0)
  })

  await test.step('B searching its own company finds nothing from A', async () => {
    await openApp(ownerB.page, companyB.workspaceUrl, 'tracker')
    await ownerB.page.keyboard.press('ControlOrMeta+k')
    await ownerB.page.keyboard.type(secretTitle)
    await ownerB.page.waitForTimeout(SETTLE_MS)
    await expect(ownerB.page.getByText(secretTitle, { exact: true })).toHaveCount(0)
  })
})
