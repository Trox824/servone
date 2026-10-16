<script lang="ts">
  import contact, { getCurrentEmployee, type Person } from '@hcengineering/contact'
  import core, {
    type Class,
    type Doc,
    type Ref,
    type SearchResultDoc,
    SortingOrder,
    type VersionableDoc
  } from '@hcengineering/core'
  import { getResource, translate } from '@hcengineering/platform'
  import presentation, {
    getClient,
    reduceCalls,
    searchFor,
    SearchResult,
    type SearchItem
  } from '@hcengineering/presentation'
  import { Component, Label, ListView, resizeObserver, Submenu } from '@hcengineering/ui'
  import view, { type ReferenceVersion, type ReferenceVersionsProvider } from '@hcengineering/view'
  import { Megaphone, Radio, Users } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { cn } from '../../../lib/utils'
  import { menuGroupLabelClass, menuItemClass, menuPopupClass } from '../../../lib/menu-classes'
  import { getReferenceLabel, getReferenceObject } from './extension/reference'
  import MentionVersionPopup from './MentionVersionPopup.svelte'
  import { departmentClass, matchesTeam, resolveTeamMembers, teamStrings, type TeamDepartment } from '$lib/team-mentions'
  import { teamDirectory, type TeamDirectory } from '$lib/team-departments'

  interface MentionedDoc {
    _id: Ref<Doc>
    _class: Ref<Class<Doc>>
    baseId?: Ref<Doc>
    isLatest?: boolean
  }

  export let query: string = ''
  export let multipleMentions: boolean = false
  export let docClass: Ref<Class<Doc>> | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const directory = teamDirectory()

  const peopleCategory = client
    .getModel()
    .findAllSync(presentation.class.ObjectSearchCategory, { classToSearch: contact.mixin.Employee })[0]

  const notifyCategory =
    peopleCategory === undefined ? undefined : { ...peopleCategory, title: teamStrings.NotifySection }

  let entries: SearchItem[] = []
  let personById = new Map<Ref<Doc>, Person>()
  let selection = 0
  let list: ListView | undefined
  let scrollArea: HTMLElement

  const everyoneAndHere = [
    {
      mention: contact.mention.Everyone,
      titleString: contact.string.Everyone,
      descriptionString: contact.string.EveryoneDescription
    },
    {
      mention: contact.mention.Here,
      titleString: contact.string.Here,
      descriptionString: contact.string.HereDescription
    }
  ]

  async function buildGroupEntries (searchQuery: string, teams: TeamDirectory): Promise<SearchResultDoc[]> {
    const lowerQuery = searchQuery.toLowerCase()
    const noun = (
      await translate(
        docClass !== undefined && hierarchy.hasClass(docClass) ? hierarchy.getClass(docClass).label : core.string.Object,
        {}
      )
    ).toLowerCase()

    const groupDocs: SearchResultDoc[] = []
    for (const group of everyoneAndHere) {
      const title = await translate(group.titleString, {})
      if (!title.toLowerCase().includes(lowerQuery)) continue
      groupDocs.push({
        id: group.mention,
        title,
        description: await translate(group.descriptionString, { title: noun }),
        doc: { _id: group.mention, _class: contact.mixin.Employee }
      })
    }

    const sender = getCurrentEmployee()
    const departmentIcon = hierarchy.findClass(departmentClass)?.icon
    for (const department of teams.departments) {
      const handle = teams.handles.get(department._id)
      if (handle === undefined || !matchesTeam(searchQuery, department.name, handle)) continue
      const memberCount = resolveTeamMembers(department._id, teams.departments, {
        active: teams.active,
        sender
      }).length
      groupDocs.push({
        id: department._id,
        icon: departmentIcon,
        title: '@' + handle,
        description: await translate(teamStrings.MentionDescription, { count: memberCount, name: department.name }),
        doc: { _id: department._id, _class: department._class }
      })
    }
    return groupDocs
  }

  const rebuildEntries = reduceCalls(async (searchQuery: string, teams: TeamDirectory): Promise<void> => {
    const found = await searchFor('mention', searchQuery)
    if (found.query !== query) return

    let lastPeopleIndex = -1
    found.items.forEach((searchItem, index) => {
      if (searchItem.category.classToSearch === contact.mixin.Employee) lastPeopleIndex = index
    })

    const groupDocs =
      multipleMentions && peopleCategory !== undefined ? await buildGroupEntries(searchQuery, teams) : []
    const groupEntries: SearchItem[] = groupDocs.map((groupDoc, offset) => ({
      num: offset,
      item: groupDoc,
      category: notifyCategory ?? peopleCategory
    }))

    const merged = [...found.items]
    merged.splice(lastPeopleIndex + 1, 0, ...groupEntries)

    const personIds = found.items
      .filter((searchItem) => searchItem.category.classToSearch === contact.mixin.Employee)
      .map((searchItem) => searchItem.item.doc._id as Ref<Person>)
    const people = personIds.length > 0 ? await client.findAll(contact.class.Person, { _id: { $in: personIds } }) : []
    personById = new Map(people.map((person) => [person._id, person]))
    entries = merged
  })

  $: void rebuildEntries(query, $directory)

  function referenceVersionsProviderOf (docOrClass: Ref<Class<Doc>>): ReferenceVersionsProvider | undefined {
    return hierarchy.classHierarchyMixin(docOrClass, view.mixin.ReferenceVersionsProvider)
  }

  function isGroupEntry (entry: SearchItem): boolean {
    return entry.item.id === contact.mention.Everyone || entry.item.id === contact.mention.Here || entry.item.doc._class === departmentClass
  }

  function isPersonEntry (entry: SearchItem): boolean {
    return entry.category.classToSearch === contact.mixin.Employee && !isGroupEntry(entry)
  }

  function isVersionedDoc (mentioned: MentionedDoc): boolean {
    const isVersionable = hierarchy.classHierarchyMixin(mentioned._class, core.mixin.VersionableClass)?.enabled === true
    const isOwnLatest = mentioned.isLatest === true && mentioned.baseId === mentioned._id
    return isVersionable && mentioned.baseId !== undefined && !isOwnLatest
  }

  function hasVersions (mentioned: MentionedDoc): boolean {
    return referenceVersionsProviderOf(mentioned._class) !== undefined || isVersionedDoc(mentioned)
  }

  async function loadVersions (mentioned: MentionedDoc): Promise<ReferenceVersion[]> {
    const providerMixin = referenceVersionsProviderOf(mentioned._class)
    if (providerMixin !== undefined) {
      const loadProvider = await getResource(providerMixin.provider)
      return await loadProvider(client, mentioned._id)
    }
    if (!isVersionedDoc(mentioned)) return []
    const versionDocs = await client.findAll(
      mentioned._class as Ref<Class<VersionableDoc>>,
      { baseId: mentioned.baseId },
      { sort: { version: SortingOrder.Descending } }
    )
    return await Promise.all(
      versionDocs.map(async (versionDoc) => ({
        id: versionDoc._id,
        objectclass: versionDoc._class,
        label: await getReferenceLabel(versionDoc._class, versionDoc._id, versionDoc),
        fixed: true
      }))
    )
  }

  async function selectEntry (entry: SearchItem): Promise<void> {
    const mentioned = entry.item.doc
    const entryTitle = entry.item.title ?? ''
    if (entry.item.id === contact.mention.Everyone || entry.item.id === contact.mention.Here) {
      dispatch('close', { id: mentioned._id, label: entryTitle.toLowerCase(), objectclass: mentioned._class })
    } else if (mentioned._class === departmentClass) {
      const department = $directory.departments.find((candidate: TeamDepartment) => candidate._id === mentioned._id)
      const handle = department === undefined ? undefined : $directory.handles.get(department._id)
      dispatch('close', { id: mentioned._id, label: handle ?? '', objectclass: departmentClass })
    } else if (referenceVersionsProviderOf(mentioned._class) !== undefined) {
      dispatch('close', {
        id: mentioned._id,
        objectclass: mentioned._class,
        label: await getReferenceLabel(mentioned._class, mentioned._id)
      })
    } else {
      const target = (await getReferenceObject(mentioned._class, mentioned._id)) ?? mentioned
      dispatch('close', {
        id: target._id,
        label: await getReferenceLabel(target._class, target._id),
        objectclass: target._class
      })
    }
  }

  export function onKeyDown (event: KeyboardEvent): boolean {
    if (event.key === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      list?.select(selection + 1)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.stopPropagation()
      event.preventDefault()
      if (selection === 0) {
        scrollArea.scrollTo({ top: 0 })
      }
      list?.select(selection - 1)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      if (selection >= 0 && selection < entries.length) {
        void selectEntry(entries[selection])
        return true
      }
      return false
    }
    return false
  }
</script>

{#if entries.length > 0 || query !== ''}
  <form
    class={cn(menuPopupClass, 'w-[24rem] max-w-[90vw]')}
    use:resizeObserver={() => {
      dispatch('changeSize')
    }}
    on:keydown={onKeyDown}
  >
    <div bind:this={scrollArea} class="max-h-80 overflow-y-auto">
      <div class="flex flex-col">
        {#if entries.length === 0}
          <div class="px-2 py-1.5 text-sm text-muted-foreground">
            <Label label={presentation.string.NoResults} />
          </div>
        {:else}
          <ListView bind:this={list} count={entries.length} bind:selection>
            <svelte:fragment slot="category" let:item={entryIndex}>
              {#if entries[entryIndex].num === 0}
                <div class={cn(menuGroupLabelClass, entries[entryIndex].num === 0 && entryIndex > 0 && 'mt-1')}>
                  <Label label={entries[entryIndex].category.title} />
                </div>
              {/if}
            </svelte:fragment>
            <svelte:fragment slot="item" let:item={entryIndex}>
              {@const entry = entries[entryIndex]}
              {#if isPersonEntry(entry)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class={cn(menuItemClass, 'min-h-8', selection === entryIndex && 'bg-accent')}
                  on:click={() => {
                    void selectEntry(entry)
                  }}
                >
                  <div class="flex min-w-0 items-center gap-2 px-1">
                    <Component
                      is={contact.component.Avatar}
                      props={{
                        person: personById.get(entry.item.doc._id),
                        name: entry.item.title,
                        size: 'small',
                        statusSize: 'x-small',
                        variant: 'circle',
                        showStatus: true
                      }}
                    />
                    <span class="truncate text-sm">{entry.item.title}</span>
                  </div>
                </div>
              {:else if isGroupEntry(entry)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class={cn(menuItemClass, 'min-h-8', selection === entryIndex && 'bg-accent')}
                  on:click={() => {
                    void selectEntry(entry)
                  }}
                >
                  <div class="flex min-w-0 items-center gap-2 px-1">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                      {#if entry.item.id === contact.mention.Everyone}
                        <Megaphone class="size-3.5" />
                      {:else if entry.item.id === contact.mention.Here}
                        <Radio class="size-3.5" />
                      {:else}
                        <Users class="size-3.5" />
                      {/if}
                    </span>
                    <span class="shrink-0 text-sm font-medium">{entry.item.title}</span>
                    <span class="truncate text-sm text-muted-foreground">{entry.item.description}</span>
                  </div>
                </div>
              {:else if hasVersions(entry.item.doc)}
                <Submenu
                  withoutMargin
                  withHover
                  options={{ component: MentionVersionPopup }}
                  props={{
                    latest: {
                      id: entry.item.doc._id,
                      objectclass: entry.item.doc._class,
                      label: entry.item.title ?? ''
                    },
                    versions: loadVersions(entry.item.doc),
                    onSelect: (version) => {
                      dispatch('close', version)
                    }
                  }}
                >
                  <svelte:fragment slot="item">
                    <div class="flex items-center h-8 w-full min-w-0">
                      <SearchResult value={entry.item} />
                    </div>
                  </svelte:fragment>
                </Submenu>
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class={cn(menuItemClass, 'min-h-8', selection === entryIndex && 'bg-accent')}
                  on:click={() => {
                    void selectEntry(entry)
                  }}
                >
                  <SearchResult value={entry.item} />
                </div>
              {/if}
            </svelte:fragment>
          </ListView>
        {/if}
      </div>
    </div>
  </form>
{/if}
