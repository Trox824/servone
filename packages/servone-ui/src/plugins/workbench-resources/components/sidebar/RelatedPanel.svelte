<!-- The "Related" sidebar widget (./related-widget.ts): what links to, and from, the page open in the main area. -->
<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import calendar, { type Event } from '@hcengineering/calendar'
  import type { Class, Doc, Ref, RelatedDocument } from '@hcengineering/core'
  import { createQuery, FilePreviewPopup, getClient, getPreviewAlignment } from '@hcengineering/presentation'
  import { markupToText } from '@hcengineering/text'
  import { languageStore } from '@hcengineering/theme'
  import tracker, { type Issue } from '@hcengineering/tracker'
  import { Breadcrumbs, getCurrentLocation, Header, location, navigate, panelstore, showPanel, showPopup } from '@hcengineering/ui'
  import { getDocLabel, getDocTitle, openDoc } from '@hcengineering/view-resources'
  import { MAIL_MESSAGE_CLASS, MAIL_TYPES, type MailThreadCard } from '@servone/mail'
  import { seriesId } from '../../../calendar-resources/lich/lib/rsvp'
  import { groupRelated, openTarget, type OpenTarget, type RelatedKind, type RelatedRow } from './related'
  import { textOf, type StringKey } from './strings'

  interface Reference extends Doc {
    attachedTo: Ref<Doc>
    srcDocId: Ref<Doc>
    srcDocClass: Ref<Class<Doc>>
  }
  interface ChatLine extends Doc {
    message: string
  }
  const REFERENCE_CLASS = 'activity:class:ActivityReference' as Ref<Class<Reference>>
  const CHAT_MESSAGE_CLASS = 'chunter:class:ChatMessage' as Ref<Class<ChatLine>>
  const MEETINGS_APP = 'love'
  const CHAT_TITLE_CHARS = 80
  const KIND_TEXT: Record<RelatedKind, StringKey> = {
    meeting: 'KindMeeting',
    mail: 'KindMail',
    task: 'KindTask',
    chat: 'KindChat',
    file: 'KindFile',
    mention: 'KindMention',
    other: 'KindOther'
  }

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: t = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: target = openTarget($panelstore.panel, $location)

  let anchors: Array<Ref<Doc>> = []
  let isAnchored = false
  let outgoing: RelatedDocument[] = []
  const targetQuery = createQuery()
  const anchorQuery = createQuery()

  $: load(target)

  let loadedKey: string | undefined
  function load (open: OpenTarget | undefined): void {
    const key = JSON.stringify(open ?? null)
    if (key === loadedKey) return
    loadedKey = key
    anchors = []
    outgoing = []
    isAnchored = false
    anchorQuery.unsubscribe()
    targetQuery.unsubscribe()
    if (open === undefined) return
    if (open.kind === 'mail') {
      anchorQuery.query(MAIL_MESSAGE_CLASS, { mailThread: open.thread as Ref<MailThreadCard> }, (found) => {
        anchors = found.map((message) => message._id)
        isAnchored = true
      })
    } else if (open.kind === 'meeting' || hierarchy.isDerived(open._class as Ref<Class<Doc>>, calendar.class.Event)) {
      const eventId = (open.kind === 'meeting' ? open.event : open._id) as Ref<Event>
      targetQuery.query(calendar.class.Event, { _id: eventId }, ([event]) => {
        if (event === undefined) {
          isAnchored = true
          return
        }
        anchorQuery.query(calendar.class.Event, { eventId: seriesId(event) }, (copies) => {
          anchors = copies.map((copy) => copy._id)
          isAnchored = true
        })
      })
    } else {
      const _id = open._id as Ref<Doc>
      anchors = [_id]
      isAnchored = true
      if (hierarchy.isDerived(open._class as Ref<Class<Doc>>, tracker.class.Issue)) {
        targetQuery.query(tracker.class.Issue, { _id: _id as Ref<Issue> }, ([issue]) => { outgoing = issue?.relations ?? [] })
      }
    }
  }

  let tasks: Issue[] = []
  let isTasksLoaded = false
  let files: Attachment[] = []
  let references: Reference[] = []
  const tasksQuery = createQuery()
  const filesQuery = createQuery()
  const referencesQuery = createQuery()
  $: if (anchors.length > 0) {
    isTasksLoaded = false
    tasksQuery.query(tracker.class.Issue, { 'relations._id': { $in: anchors } }, (found) => {
      tasks = found
      isTasksLoaded = true
    })
    filesQuery.query(attachment.class.Attachment, { attachedTo: { $in: anchors } }, (found) => { files = found })
    referencesQuery.query(REFERENCE_CLASS, { attachedTo: { $in: anchors } }, (found) => { references = found })
  } else {
    tasksQuery.unsubscribe()
    filesQuery.unsubscribe()
    referencesQuery.unsubscribe()
    tasks = []
    files = []
    references = []
    isTasksLoaded = true
  }

  $: taskRows = tasks.filter((issue) => !anchors.includes(issue._id)).map((issue): RelatedRow => ({
    key: issue._id,
    kind: 'task',
    title: `${issue.identifier} ${issue.title}`,
    open: () => { showPanel(tracker.component.EditIssue, issue._id, tracker.class.Issue, 'content') }
  }))
  $: fileRows = files.map((file): RelatedRow => ({
    key: file._id,
    kind: 'file',
    title: file.name,
    open: () => { showPopup(FilePreviewPopup, { file: file.file, name: file.name, contentType: file.type, metadata: file.metadata }, getPreviewAlignment(file.type)) }
  }))

  let linkRows: RelatedRow[] = []
  let isResolving = false
  let resolveRun = 0
  $: void resolveLinks(outgoing, references)

  async function resolveLinks (links: RelatedDocument[], mentions: Reference[]): Promise<void> {
    const run = ++resolveRun
    isResolving = true
    const sources = [...new Map(mentions.map((m) => [m.srcDocId, m])).values()].filter((m) => !anchors.includes(m.srcDocId))
    const rows = await Promise.all([
      ...links.map(async (link) => await rowOf(link._id, link._class)),
      ...sources.map(async (m) => {
        const row = await rowOf(m.srcDocId, m.srcDocClass)
        return row === undefined ? undefined : { ...row, kind: 'mention' as const }
      })
    ])
    if (run !== resolveRun) return
    linkRows = rows.filter((row): row is RelatedRow => row !== undefined)
    isResolving = false
  }

  async function rowOf (_id: Ref<Doc>, _class: Ref<Class<Doc>>): Promise<RelatedRow | undefined> {
    if (hierarchy.isDerived(_class, tracker.class.Issue)) {
      const issue = await client.findOne(tracker.class.Issue, { _id: _id as Ref<Issue> })
      if (issue === undefined) return undefined
      return { key: issue._id, kind: 'task', title: `${issue.identifier} ${issue.title}`, open: () => { showPanel(tracker.component.EditIssue, issue._id, tracker.class.Issue, 'content') } }
    }
    if (hierarchy.isDerived(_class, calendar.class.Event)) {
      const event = await client.findOne(calendar.class.Event, { _id: _id as Ref<Event> })
      if (event === undefined) return undefined
      return { key: seriesId(event), kind: 'meeting', title: event.title, open: () => { openMeetingPage(event._id) } }
    }
    if (MAIL_TYPES.some((type) => hierarchy.isDerived(_class, type))) return undefined
    if (hierarchy.isDerived(_class, CHAT_MESSAGE_CLASS)) {
      const line = await client.findOne(CHAT_MESSAGE_CLASS, { _id: _id as Ref<ChatLine> })
      if (line === undefined) return undefined
      return { key: line._id, kind: 'chat', title: markupToText(line.message).trim().slice(0, CHAT_TITLE_CHARS), open: () => { void openDoc(hierarchy, line) } }
    }
    const doc = await client.findOne(_class, { _id })
    if (doc === undefined) return undefined
    const title = (await getDocTitle(client, doc._id, doc._class, doc)) ?? (await getDocLabel(client, doc)) ?? t('Untitled')
    return { key: doc._id, kind: 'other', title, open: () => { void openDoc(hierarchy, doc) } }
  }

  function openMeetingPage (eventId: Ref<Event>): void {
    const loc = getCurrentLocation()
    navigate({ path: [...loc.path.slice(0, 2), MEETINGS_APP], query: { meeting: eventId } })
  }

  $: groups = groupRelated([...linkRows, ...taskRows, ...fileRows])
  $: isLoaded = isAnchored && isTasksLoaded && !isResolving
</script>

<Header allowFullsize={false} type="type-aside" hideBefore hideActions={false} hideDescription adaptive="disabled" closeOnEscape={false} on:close>
  <Breadcrumbs items={[{ title: t('Related') }]} currentOnly />
</Header>

<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 text-[13px]">
  {#if target === undefined}
    <p class="m-0 px-2 text-muted-foreground">{t('NothingOpen')}</p>
  {:else if isLoaded && groups.length === 0}
    <p class="m-0 px-2 text-muted-foreground">{t('NothingLinked')}</p>
  {:else}
    {#each groups as group (group.kind)}
      <section class="grid gap-0.5" aria-labelledby="related-{group.kind}">
        <h3 id="related-{group.kind}" class="m-0 flex h-6 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
          {t(KIND_TEXT[group.kind])}<span class="tabular-nums">{group.rows.length}</span>
        </h3>
        <ul class="m-0 grid list-none gap-0.5 p-0">
          {#each group.rows as row (row.key)}
            <li>
              <button type="button" class="flex min-h-8 w-full items-center rounded-lg px-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50" on:click={row.open}>
                <span class="truncate">{row.title === '' ? t('Untitled') : row.title}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
