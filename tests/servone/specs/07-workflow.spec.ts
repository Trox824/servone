import { expect, test, users } from '../lib/fixtures'
import { createJob, createWorkflowFromTemplate, moveToNextStage, uniqueTag } from '../lib/ui'

const STAGE_MOVES = 2

test('Scenario 7: Tuyển dụng workflow from a template, a job moves through stages', async ({ session, company, tr }) => {
  const owner = await session(users().owner)
  const ws = await company(owner, `Workflow ${uniqueTag()}`)
  const { page } = owner
  const workflowName = `${tr('Tuyển dụng', 'Hiring')} ${uniqueTag()}`
  const jobTitle = `Candidate ${uniqueTag()}`

  await test.step('admin creates Tuyển dụng from the template', async () => {
    await createWorkflowFromTemplate(page, tr, ws.workspaceUrl, workflowName, tr('Tuyển dụng', 'Hiring'))
  })

  // TODO(qa): set an owner and a deadline per stage once the stage settings expose them (not in the create dialog yet).

  await test.step('a job moves through the stages', async () => {
    await createJob(page, tr, jobTitle)
    const stepper = page.locator('ol[data-id=stage-stepper]')
    for (let move = 1; move <= STAGE_MOVES; move++) {
      await moveToNextStage(page, tr)
      await expect(stepper.locator('li.step.done')).toHaveCount(move)
    }
  })

  await test.step('history shows the move', async () => {
    // Third stage of the Hiring template (services/servone/src/workflows/templates.ts).
    await expect(page.locator('[class*="activity"]').filter({ hasText: tr('Phỏng vấn', 'Interview') }).first()).toBeVisible()
  })

  // TODO(qa): assert the stage owner's in-app and email notification once per-stage owners exist (waitForMail in lib/inbox.ts).
})
