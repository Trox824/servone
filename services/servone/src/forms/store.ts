// hulykvs layout, namespace `servone-forms`:
//   link/<id>                       StoredFormLink
//   tmpl/<workspace>/<template>     id of that template's active link
import type { AccountUuid, Ref, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import type { IssueTemplate } from '@hcengineering/tracker'

export const KVS_NAMESPACE = 'servone-forms'

// Unlike hook secrets this one is kept readable: a public form link is meant to be re-copied and posted.
export interface StoredFormLink {
  id: string
  workspace: WorkspaceUuid
  template: Ref<IssueTemplate>
  secret: string
  createdBy: AccountUuid
  createdOn: number
}

const linkKey = (id: string): string => `link/${id}`
const templateKey = (workspace: WorkspaceUuid, template: Ref<IssueTemplate>): string => `tmpl/${workspace}/${template}`

export class FormLinkStore {
  constructor (private readonly kv: KeyValueClient) {}

  async getLink (id: string): Promise<StoredFormLink | undefined> {
    return (await this.kv.getValue<StoredFormLink>(linkKey(id))) ?? undefined
  }

  async getTemplateLink (workspace: WorkspaceUuid, template: Ref<IssueTemplate>): Promise<StoredFormLink | undefined> {
    const id = await this.kv.getValue<string>(templateKey(workspace, template))
    return id === null ? undefined : await this.getLink(id)
  }

  async saveLink (link: StoredFormLink): Promise<void> {
    await this.kv.setValue(linkKey(link.id), link)
    await this.kv.setValue(templateKey(link.workspace, link.template), link.id)
  }

  // The link key goes first: once it is gone the public URL stops working even if the index delete fails.
  async deleteLink (link: StoredFormLink): Promise<void> {
    await this.kv.deleteKey(linkKey(link.id))
    await this.kv.deleteKey(templateKey(link.workspace, link.template))
  }
}
