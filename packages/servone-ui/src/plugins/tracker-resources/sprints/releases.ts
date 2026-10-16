import core, { type Ref, type TxOperations } from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import tags, { type TagCategory, type TagElement, type TagReference } from '@hcengineering/tags'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import { icon } from './plugin'
import { RELEASE, RELEASE_CATEGORY_ID } from './scrum-spec'
import { ensureScrumAttributes } from './setup'

export type ReleaseState = 'unreleased' | 'released' | 'archived'

export const RELEASE_CATEGORY = RELEASE_CATEGORY_ID as Ref<TagCategory>

export interface Release {
  doc: TagElement
  name: string
  description: string
  project: string | undefined
  startDate: number | undefined
  releaseDate: number | undefined
  state: ReleaseState
  releasedAt: number | undefined
}

function field<T> (doc: object, name: string): T | undefined {
  const v = (doc as Record<string, unknown>)[name]
  return v === null ? undefined : (v as T | undefined)
}

export function toRelease (doc: TagElement): Release {
  const state = field<string>(doc, RELEASE.state)
  return {
    doc,
    name: doc.title,
    description: doc.description,
    project: field<string>(doc, RELEASE.project),
    startDate: field<number>(doc, RELEASE.startDate),
    releaseDate: field<number>(doc, RELEASE.releaseDate),
    state: state === 'released' || state === 'archived' ? state : 'unreleased',
    releasedAt: field<number>(doc, RELEASE.releasedAt)
  }
}

/** The Releases label category and the release fields; both are model writes, made once. */
export async function ensureReleaseSchema (client: TxOperations): Promise<void> {
  await ensureScrumAttributes(client)
  const found = await client.findOne(tags.class.TagCategory, { _id: RELEASE_CATEGORY })
  if (found !== undefined) return
  await client.createDoc(
    tags.class.TagCategory,
    core.space.Model,
    {
      icon: icon.release,
      label: getEmbeddedLabel('Releases') as unknown as string,
      targetClass: tracker.class.Issue,
      tags: [],
      default: false
    },
    RELEASE_CATEGORY
  )
}

export interface ReleaseData {
  name: string
  description: string
  startDate: number | undefined
  releaseDate: number | undefined
}

export async function createRelease (client: TxOperations, project: Project, data: ReleaseData): Promise<Ref<TagElement>> {
  return await client.createDoc(tags.class.TagElement, core.space.Workspace, {
    title: data.name,
    description: data.description,
    targetClass: tracker.class.Issue,
    color: 17,
    category: RELEASE_CATEGORY,
    [RELEASE.project]: project._id,
    [RELEASE.startDate]: data.startDate ?? null,
    [RELEASE.releaseDate]: data.releaseDate ?? null,
    [RELEASE.state]: 'unreleased'
  } as any)
}

export async function updateRelease (client: TxOperations, release: TagElement, data: ReleaseData): Promise<void> {
  await client.update(release, {
    title: data.name,
    description: data.description,
    [RELEASE.startDate]: data.startDate ?? null,
    [RELEASE.releaseDate]: data.releaseDate ?? null
  } as any)
}

export async function setReleaseState (client: TxOperations, release: TagElement, state: ReleaseState, at?: number): Promise<void> {
  await client.update(release, {
    [RELEASE.state]: state,
    ...(state === 'released' ? { [RELEASE.releasedAt]: at ?? Date.now(), [RELEASE.releaseDate]: at ?? Date.now() } : {})
  } as any)
}

export async function deleteRelease (client: TxOperations, release: TagElement): Promise<void> {
  const refs = await client.findAll(tags.class.TagReference, { tag: release._id })
  for (const r of refs) await client.remove(r)
  await client.remove(release)
}

export async function toggleIssueRelease (client: TxOperations, issue: Issue, release: TagElement): Promise<void> {
  const existing = await client.findOne(tags.class.TagReference, { attachedTo: issue._id, tag: release._id })
  if (existing !== undefined) {
    await client.remove(existing)
    return
  }
  await client.addCollection(tags.class.TagReference, issue.space, issue._id, tracker.class.Issue, 'labels', {
    title: release.title,
    color: release.color,
    tag: release._id
  })
}

export async function moveOpenIssues (
  client: TxOperations,
  refs: TagReference[],
  openIds: Set<string>,
  to: TagElement
): Promise<void> {
  for (const r of refs) {
    if (!openIds.has(r.attachedTo)) continue
    await client.remove(r)
    const already = await client.findOne(tags.class.TagReference, { attachedTo: r.attachedTo, tag: to._id })
    if (already === undefined) {
      await client.addCollection(tags.class.TagReference, r.space, r.attachedTo, tracker.class.Issue, 'labels', {
        title: to.title,
        color: to.color,
        tag: to._id
      })
    }
  }
}
