//
// Writes ticket text into the SRV project ./apply.ts made: each `## SRV-N · Title` section sets issue N's
// title and description (via the collaborator). Status, sprint, points and dates are left alone.
//
//   SERVER_SECRET="$(tr -d '\n' < dev/railway/secret.txt)" dev/railway/node_modules/.bin/tsx \
//     dev/servone-tracker-import/tickets.ts --workspace servone [--file docs/tracker-tickets.md] [--dry-run]
//
// --file     the ticket text (default docs/tracker-tickets.md, which is kept out of git)
// --dry-run  lists what would change and writes nothing
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { connect, core, defaultAccountsUrl, need, repoRoot, tracker } from '../servone-tracker-seed/workspace'

const { markdownToMarkup } = need('@hcengineering/text-markdown')
const { jsonToMarkup } = need('@hcengineering/text-core')

/** The project apply.ts made carries this description. */
const MARKER = 'Generated from docs/SERVONE-PRODUCT-PLAN.md by dev/servone-tracker-import/apply.ts.'

interface Ticket {
  number: number
  title: string
  body: string
}

function readArgs (): { workspace: string, accounts: string, file: string, dryRun: boolean } {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string', default: '' },
      accounts: { type: 'string', default: '' },
      file: { type: 'string', default: join(repoRoot, 'docs', 'tracker-tickets.md') },
      'dry-run': { type: 'boolean', default: false }
    }
  })
  if (values.workspace === '') throw new Error('--workspace is required')
  return {
    workspace: values.workspace,
    accounts: values.accounts === '' ? defaultAccountsUrl() : values.accounts,
    file: values.file,
    dryRun: values['dry-run']
  }
}

/** Every `## SRV-N · Title` section of the file, with the markdown up to the next one. */
export function parseTickets (text: string): Ticket[] {
  const out: Ticket[] = []
  const heads = [...text.matchAll(/^## [A-Z]+-(\d+) · (.+)$/gm)]
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length
    const body = text
      .slice((m.index as number) + m[0].length, end)
      .replace(/\n---\s*$/, '')
      .trim()
    out.push({ number: Number(m[1]), title: m[2].trim(), body })
  })
  return out
}

function collaboratorUrl (): string {
  const cfg = JSON.parse(readFileSync(join(repoRoot, 'dev', '.servone-railway.json'), 'utf8'))
  return String(cfg.COLLABORATOR_URL).replace('wss://', 'https://').replace('ws://', 'http://')
}

/** Stores the markup as the issue's description, as the collaborator's createContent does for the editor. */
async function writeDescription (url: string, token: string, workspace: string, issueId: string, markup: string): Promise<string> {
  const docId = [workspace, tracker.class.Issue, issueId, 'description'].join('|')
  const res = await fetch(`${url}/rpc/${encodeURIComponent(docId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'createContent', payload: { content: { description: markup } } })
  })
  if (!res.ok) throw new Error(`collaborator: HTTP ${res.status}`)
  const json = await res.json()
  if (json.error != null) throw new Error(`collaborator: ${json.error}`)
  return json.content.description
}

async function main (): Promise<void> {
  const args = readArgs()
  const tickets = parseTickets(readFileSync(args.file, 'utf8'))
  if (tickets.length === 0) throw new Error(`no "## SRV-N · Title" sections in ${args.file}`)

  const { client, close, token, workspaceUuid } = await connect(args)
  try {
    const project = (await client.findAll(tracker.class.Project, {})).find((p: any) => p.description === MARKER)
    if (project === undefined) throw new Error('the plan project is not in this workspace; run apply.ts first')
    const issues = await client.findAll(tracker.class.Issue, { space: project._id })
    const byNumber = new Map<number, any>(issues.map((it: any) => [it.number, it]))
    const url = collaboratorUrl()

    let done = 0
    for (const t of tickets) {
      const issue = byNumber.get(t.number)
      if (issue === undefined) {
        console.warn(`  ${project.identifier}-${t.number}: no such issue, skipped`)
        continue
      }
      if (args.dryRun) {
        console.log(`  ${issue.identifier}: "${issue.title}" → "${t.title}" (${t.body.length} chars)`)
        continue
      }
      const markup = jsonToMarkup(markdownToMarkup(t.body))
      const ref = await writeDescription(url, token, workspaceUuid, issue._id, markup)
      await client.update(issue, { title: t.title, description: ref }, false, Date.now(), core.account.System)
      process.stdout.write(`  ${++done}/${tickets.length}\r`)
    }
    if (!args.dryRun) console.log(`\nupdated ${done} issues in ${project.identifier}`)
  } finally {
    await close()
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
)
