import {
  BUNDLED_PACKS,
  describe as describeConfig,
  findPack,
  packContents,
  type Pack,
  type PackInstallState,
  packStatus,
  plan,
  saveDraft
} from '@servone/config'
import { z } from 'zod'

import { type AnyTool, capText, defineTool, ToolInputError } from '../tool'
import { changeLines, configSession, draftNextStep, issueText, NEXT_STEP, type NextSteps, withConfigErrors } from './studio'

const STATE_TEXT: Record<PackInstallState, string> = {
  installed: 'installed',
  partial: 'partly installed (install_pack adds what is missing)',
  notInstalled: 'not installed'
}

function contentsText (pack: Pack): string {
  const contents = packContents(pack)
  return (
    `creates record types ${contents.typeNames.join(', ')}; ` +
    `fields: ${contents.fieldCount}, links: ${contents.linkCount}, field groups: ${contents.groupCount}`
  )
}

const listPacks = defineTool({
  name: 'list_packs',
  title: 'List packs',
  description:
    'Lists the ready-made packs Servone ships. A pack is a set of record types with their fields, links and field groups ' +
    'for one business need, such as internal requests or customer contracts. Shows each pack key, what it creates and ' +
    'whether it is installed in this workspace. Install one with install_pack.',
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session) => {
    const snapshot = await describeConfig(configSession(session))
    const lines = [`Packs (${BUNDLED_PACKS.length}); install one with install_pack:`]
    for (const pack of BUNDLED_PACKS) {
      lines.push(
        '',
        `${pack.key} "${pack.name}" v${pack.version} (${pack.industry}): ${STATE_TEXT[packStatus(pack, snapshot)]}`,
        `  ${pack.description}`,
        `  ${contentsText(pack)}`
      )
    }
    return capText(lines.join('\n'))
  }
})

// install_pack only plans and saves a draft, so a stale draft is fixed by calling it again, not plan_config_change.
const PACK_NEXT_STEP: NextSteps = {
  ...NEXT_STEP,
  invalid: 'Fix the pack or call list_packs to see the current packs.',
  stale: 'The configuration changed after this draft was made. Call install_pack again with the same pack key to get a fresh change id.',
  'not-found': 'Check the pack key with list_packs.'
}

const installPack = defineTool({
  name: 'install_pack',
  title: 'Install pack',
  description:
    'Drafts one change that installs a pack from list_packs: its record types, fields, links and field groups. ' +
    'Anything this pack already installed is skipped, so installing again only adds what is missing. ' +
    'Record types of this pack that were archived, for example by undoing its install, are restored. ' +
    'Nothing changes until apply_config_change runs with the returned change id.',
  input: z.object({ pack: z.string().trim().min(1).describe('Pack key from list_packs, e.g. "de-nghi-noi-bo"') }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const pack = findPack(args.pack)
    if (pack === undefined) {
      throw new ToolInputError(`Pack "${args.pack}" not found. Known: ${BUNDLED_PACKS.map((it) => it.key).join(', ')}`)
    }
    const config = configSession(session)
    const draft = await withConfigErrors(async () => await plan(config, pack.operations), PACK_NEXT_STEP)
    if (draft.issues.length > 0) throw new ToolInputError(issueText(`Pack "${pack.key}" cannot be installed`, draft.issues))
    if (draft.ops.length === 0) return `Pack ${pack.key} "${pack.name}" is already installed; nothing to add.`
    const change = await withConfigErrors(async () => await saveDraft(config, draft), PACK_NEXT_STEP)
    const lines = [`Drafted change ${change.id} to install pack ${pack.key} "${pack.name}" (not applied yet).`]
    const skipped = pack.operations.length - draft.ops.length
    if (skipped > 0) lines.push(`${skipped} of ${pack.operations.length} items were already installed by this pack and are skipped.`)
    lines.push(...changeLines(change), draftNextStep(change))
    return capText(lines.join('\n'))
  }
})

export const packTools: AnyTool[] = [listPacks, installPack]
