import contact, { formatName, type Person } from '@hcengineering/contact'
import core, { type AccountUuid, AccountRole, type Class, type Doc, type Ref, type TxOperations, type WorkspaceMemberInfo } from '@hcengineering/core'
import notification, { type CommonInboxNotification } from '@hcengineering/notification'
import { getEmbeddedLabel } from '@hcengineering/platform'
import { type Language } from '../workflows/templates'
import { resolveLanguage } from './content'

export interface JoinedAccounts {
  workspaceInfo: () => Promise<{ name: string, createdBy?: AccountUuid }>
  members: () => Promise<WorkspaceMemberInfo[]>
  locale: (account: AccountUuid) => Promise<string | null>
}

export type JoinedClient = Pick<TxOperations, 'findOne' | 'createDoc'>

const JOINED_TEXT: Record<Language, (name: string, workspace: string) => string> = {
  en: (name, workspace) => `${name} joined ${workspace}`,
  vi: (name, workspace) => `${name} đã tham gia ${workspace}`
}

export interface JoinedOutcome {
  newcomer: AccountUuid
  isCreator: boolean
}

export async function notifyJoined (
  client: JoinedClient,
  accounts: JoinedAccounts,
  joined: Ref<Person>
): Promise<JoinedOutcome | undefined> {
  const newcomer = await client.findOne(contact.class.Person, { _id: joined })
  if (newcomer?.personUuid === undefined) return undefined
  const newcomerAccount = newcomer.personUuid as AccountUuid
  const info = await accounts.workspaceInfo()
  if (info.createdBy === newcomerAccount) return { newcomer: newcomerAccount, isCreator: true }

  const owners = (await accounts.members()).filter((member) => member.role === AccountRole.Owner && !member.disabled).map((member) => member.person)
  const recipients = new Set<AccountUuid>(info.createdBy === undefined ? owners : [info.createdBy, ...owners])
  recipients.delete(newcomerAccount)
  for (const recipient of recipients) {
    await notifyOne(client, accounts, { recipient, newcomer, workspaceName: info.name, noticeId: `servone:joined:${newcomer._id}:${recipient}` as Ref<CommonInboxNotification> })
  }
  return { newcomer: newcomerAccount, isCreator: false }
}

interface Notice {
  recipient: AccountUuid
  newcomer: Person
  workspaceName: string
  noticeId: Ref<CommonInboxNotification>
}

async function notifyOne (client: JoinedClient, accounts: JoinedAccounts, notice: Notice): Promise<void> {
  if ((await client.findOne(notification.class.CommonInboxNotification, { _id: notice.noticeId })) !== undefined) return
  const person = await client.findOne(contact.class.Person, { personUuid: notice.recipient })
  if (person === undefined) return
  const space = await client.findOne(contact.class.PersonSpace, { person: person._id })
  if (space === undefined) return
  const language = resolveLanguage(await accounts.locale(notice.recipient), notice.workspaceName, person.name)
  const existingContext = await client.findOne(notification.class.DocNotifyContext, { objectId: notice.newcomer._id, user: notice.recipient })
  const contextId = existingContext?._id ?? await client.createDoc(
    notification.class.DocNotifyContext,
    space._id,
    { objectId: notice.newcomer._id, objectClass: contact.class.Person as Ref<Class<Doc>>, objectSpace: contact.space.Contacts, user: notice.recipient, isPinned: false, hidden: false },
    undefined,
    undefined,
    core.account.System
  )
  await client.createDoc(
    notification.class.CommonInboxNotification,
    space._id,
    {
      user: notice.recipient,
      objectId: notice.newcomer._id,
      objectClass: contact.class.Person,
      icon: contact.icon.ContactApplication,
      message: getEmbeddedLabel(JOINED_TEXT[language](formatName(notice.newcomer.name), notice.workspaceName)),
      isViewed: false,
      archived: false,
      docNotifyContext: contextId
    },
    notice.noticeId,
    undefined,
    core.account.System
  )
}
