import contact, { getCurrentEmployee } from '@hcengineering/contact'
import { type Class, type Ref, type Space } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import presentation, { getClient, onClient } from '@hcengineering/presentation'
import tracker from '@hcengineering/tracker'
import { getCurrentLocation, navigate } from '@hcengineering/ui'
import { workbenchId } from '@hcengineering/workbench'
import { mount, unmount } from 'svelte'
import BringTeam from '../plugins/login-resources/onboarding/BringTeam.svelte'
import {
  clearPendingSetup,
  hasOpenedBefore,
  markOpened,
  readPendingSetup
} from './bring-team/pending-setup'
import { TEAM_FOCUS_SPACE, teamFocusClass, type StarterSetup } from './team-focus'

const GENERAL_CHANNEL = 'chunter:space:General' as Ref<Space>
const CHANNEL_CLASS = 'chunter:class:Channel' as Ref<Class<Space>>
const TRACKER_APP = 'tracker'
const CHAT_APP = 'chunter'
const MY_ISSUES_PAGE = 'my-issues'
const IMPORT_SETTINGS_PATH = ['setting', 'import']
const MAX_DEFAULT_LANDING_PATH = 4
const NEW_MEMBER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const handledSessions = new Set<string>()

async function saveStarterSetup (setup: StarterSetup): Promise<void> {
  const client = getClient()
  const existing = await client.findOne(teamFocusClass, {})
  const fields = { servoneTeamFocus: setup.focus, servoneSampleContent: setup.hasSampleContent }
  if (existing === undefined) {
    await client.createDoc(teamFocusClass, TEAM_FOCUS_SPACE, fields)
  } else if (existing.servoneTeamFocus !== setup.focus || existing.servoneSampleContent !== setup.hasSampleContent) {
    await client.updateDoc(teamFocusClass, TEAM_FOCUS_SPACE, existing._id, fields)
  }
}

function showBringTeam (workspaceUrl: string, finish: () => void): void {
  const overlay = mount(BringTeam, {
    target: document.body,
    props: {
      onFinish: (next: 'continue' | 'import') => {
        finish()
        void unmount(overlay)
        if (next === 'import') navigate({ path: [workbenchId, workspaceUrl, ...IMPORT_SETTINGS_PATH] })
      }
    }
  })
}

async function landInvitee (workspaceUrl: string): Promise<void> {
  const client = getClient()
  const me = getCurrentEmployee()
  const person = await client.findOne(contact.class.Person, { _id: me })
  const joinedAt = person?.createdOn
  if (joinedAt === undefined || Date.now() - joinedAt > NEW_MEMBER_WINDOW_MS) return

  const loc = getCurrentLocation()
  const isDefaultLanding =
    (loc.path[2] === undefined || loc.path[2] === TRACKER_APP) &&
    loc.path.length <= MAX_DEFAULT_LANDING_PATH &&
    loc.fragment === undefined
  if (!isDefaultLanding) return

  const assigned = await client.findOne(tracker.class.Issue, { assignee: me })
  const destination =
    assigned !== undefined
      ? [TRACKER_APP, MY_ISSUES_PAGE]
      : [CHAT_APP, `${GENERAL_CHANNEL}|${CHANNEL_CLASS}`]
  navigate({ path: [workbenchId, workspaceUrl, ...destination] }, true)
}

async function handleFirstOpen (accountUuid: string): Promise<void> {
  const loc = getCurrentLocation()
  const workspaceUrl = loc.path[1]
  const workspaceUuid = getMetadata(presentation.metadata.WorkspaceUuid)
  if (loc.path[0] !== workbenchId || workspaceUrl === undefined || workspaceUuid === undefined) return

  const session = `${workspaceUuid}:${accountUuid}`
  if (handledSessions.has(session)) return
  handledSessions.add(session)

  const setup = readPendingSetup(workspaceUrl)
  if (setup !== undefined) {
    await saveStarterSetup(setup)
    showBringTeam(workspaceUrl, () => {
      clearPendingSetup(workspaceUrl)
      markOpened(workspaceUuid, accountUuid)
    })
    return
  }

  if (hasOpenedBefore(workspaceUuid, accountUuid)) return
  markOpened(workspaceUuid, accountUuid)
  await landInvitee(workspaceUrl)
}

export function installFirstOpen (): void {
  onClient(async (_client, account) => {
    await handleFirstOpen(account.uuid)
  })
}
