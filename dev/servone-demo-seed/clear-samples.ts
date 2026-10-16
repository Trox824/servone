//
// Removes the sample content Huly puts in every new workspace (Game Design and Welcome projects, the
// Quick-Start Docs teamspace) so screenshots show only Acme Studio. Lists by default; --apply deletes.
//
//   SERVER_SECRET=… dev/railway/node_modules/.bin/tsx dev/servone-demo-seed/clear-samples.ts \
//     --workspace acmestudio [--apply]
//
import { parseArgs } from 'node:util'
import { defaultAccountsUrl, tracker } from '../servone-tracker-seed/workspace'
import { connectAs, TOOL_SERVICE } from './libs'

const DEMO_WORKSPACE = 'acmestudio'
const SAMPLE_PROJECT_IDENTIFIERS = ['HULY', 'GAME']
const SAMPLE_TEAMSPACE = 'Quick-Start Docs'
const DOCUMENT_CLASS = 'document:class:Document'
const TEAMSPACE_CLASS = 'document:class:Teamspace'
const NOTIFY_CONTEXT_CLASS = 'notification:class:DocNotifyContext'

async function main (): Promise<void> {
  const { values } = parseArgs({ options: { workspace: { type: 'string', default: '' }, apply: { type: 'boolean', default: false } } })
  if (values.workspace !== DEMO_WORKSPACE) throw new Error(`only the demo workspace "${DEMO_WORKSPACE}" is allowed`)

  const tool = await connectAs({ workspace: values.workspace, accounts: defaultAccountsUrl() }, TOOL_SERVICE)
  const { client } = tool
  try {
    const projects = (await client.findAll(tracker.class.Project, {})).filter((p: any) => SAMPLE_PROJECT_IDENTIFIERS.includes(p.identifier))
    const teamspaces = (await client.findAll(TEAMSPACE_CLASS, {})).filter((t: any) => t.name === SAMPLE_TEAMSPACE)
    const spaceIds = new Set<string>([...projects, ...teamspaces].map((s: any) => s._id))
    console.log('projects', projects.map((p: any) => p.identifier), 'teamspaces', teamspaces.map((t: any) => t.name))
    const issues = (await client.findAll(tracker.class.Issue, {})).filter((i: any) => spaceIds.has(i.space))
    const documents = (await client.findAll(DOCUMENT_CLASS, {})).filter((d: any) => spaceIds.has(d.space))
    const contexts = (await client.findAll(NOTIFY_CONTEXT_CLASS, {})).filter((c: any) => spaceIds.has(c.objectSpace))
    console.log(`${issues.length} issues, ${documents.length} documents, ${contexts.length} notify contexts`)
    if (!values.apply) return

    for (const context of contexts) await client.remove(context)
    for (const issue of issues) await client.remove(issue)
    for (const document of documents) await client.remove(document)
    for (const space of [...projects, ...teamspaces]) await client.remove(space)
    console.log('removed')
  } finally {
    await tool.close()
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err)
    process.exit(1)
  }
)
