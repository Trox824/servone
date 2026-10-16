<script lang="ts">
  import core, { type DocumentQuery, type Ref, type WithLookup } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { resolvedLocationStore } from '@hcengineering/ui'
  import view, { type Viewlet, type ViewletDescriptor, type ViewletPreference } from '@hcengineering/view'
  import { deepEqual } from 'fast-equals'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { activeViewlet, makeViewletKey, setActiveViewletId } from '../utils'
  import { withGantt } from './ganttViewlet'
  import { publishViewlets, retractViewlets, type ViewletSwitchEntry } from './viewletSwitchStore'

  export let viewlet: WithLookup<Viewlet> | undefined = undefined
  export let viewlets: Array<WithLookup<Viewlet>> = []
  export let viewletQuery: DocumentQuery<Viewlet>
  export let preference: ViewletPreference | undefined = undefined
  export let loading = true
  export let hidden = false
  export let ignoreFragment = false
  export let defaultViewletDescriptor: Ref<ViewletDescriptor> | undefined = undefined

  const dispatch = createEventDispatcher()
  const viewletListQuery = createQuery()
  const preferenceQuery = createQuery()

  function loadViewlets (currentQuery: DocumentQuery<Viewlet>): void {
    viewletListQuery.query(
      view.class.Viewlet,
      currentQuery,
      (found) => {
        const adaptedList = withGantt(found, currentQuery.descriptor === undefined)
        viewlets = adaptedList
        dispatch('viewlets', adaptedList)
      },
      { lookup: { descriptor: view.class.ViewletDescriptor } }
    )
  }

  $: loadViewlets(viewletQuery)

  let storageKey = makeViewletKey(undefined, ignoreFragment)
  const stopFollowingLocation = resolvedLocationStore.subscribe((location) => {
    storageKey = makeViewletKey(location, ignoreFragment)
  })
  onDestroy(stopFollowingLocation)

  function chooseViewlet (
    candidates: Array<WithLookup<Viewlet>>,
    storedChoices: Record<string, Ref<Viewlet> | null>,
    key: string
  ): void {
    if (candidates.length === 0) return
    const storedId = storedChoices[key]
    const chosen =
      candidates.find((candidate) => candidate._id === storedId) ??
      candidates.find((candidate) => candidate.descriptor === defaultViewletDescriptor) ??
      candidates[0]
    const isSameViewlet = viewlet !== undefined && viewlet._id === chosen._id && deepEqual(viewlet.config, chosen.config)
    if (isSameViewlet) return
    viewlet = chosen
    setActiveViewletId(chosen._id)
    dispatch('viewlet', chosen)
  }

  $: chooseViewlet(viewlets, $activeViewlet, storageKey)

  let publishedEntry: ViewletSwitchEntry | undefined

  function syncSwitcher (isHidden: boolean, availableViewlets: Array<WithLookup<Viewlet>>, key: string): void {
    if (!isHidden && availableViewlets.length > 1) {
      const nextEntry: ViewletSwitchEntry = { key, viewlets: availableViewlets }
      publishViewlets(nextEntry, publishedEntry)
      publishedEntry = nextEntry
    } else if (publishedEntry !== undefined) {
      retractViewlets(publishedEntry)
      publishedEntry = undefined
    }
  }

  $: syncSwitcher(hidden, viewlets, storageKey)

  onDestroy(() => {
    retractViewlets(publishedEntry)
  })

  function watchPreference (viewletId: Ref<Viewlet> | undefined): void {
    if (viewletId === undefined) {
      preferenceQuery.unsubscribe()
      return
    }
    preferenceQuery.query(
      view.class.ViewletPreference,
      { space: core.space.Workspace, attachedTo: viewletId },
      (found) => {
        preference = found[0]
        loading = false
        dispatch('loading', false)
        dispatch('preference', preference)
      },
      { limit: 1 }
    )
  }

  $: watchPreference(viewlet?._id)
</script>
