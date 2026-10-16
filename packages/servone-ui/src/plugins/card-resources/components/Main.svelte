<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import type { CardSpace, MasterTag } from '@hcengineering/card'
  import { AccountRole, getCurrentAccount, hasAccountRole, type Ref, type Space } from '@hcengineering/core'
  import { getEmbeddedLabel, getResource, type IntlString } from '@hcengineering/platform'
  import { createQuery, IconWithEmoji } from '@hcengineering/presentation'
  import {
    type AnyComponent,
    type AnySvelteComponent,
    Breadcrumb,
    Breadcrumbs,
    getCurrentLocation,
    Header,
    location,
    navigate,
    resizeObserver,
    tooltip
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { SpecialView } from '@hcengineering/workbench-resources'
  import { CHANGE_TYPE, isLockedType } from '@servone/config'
  import { Archive, Settings, Workflow } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import card from '../plugin'
  import MasterTagEditor from './settings/MasterTagEditor.svelte'
  import GraphStudio from '../studio/graph/components/GraphStudio.svelte'
  import { extraViewStore } from '../../view-resources/components/extraViewStore'
  import { toolbarIconButton } from '../../../lib/search-classes'
  import { cn } from '../../../lib/utils'
  import { cardViewOf, cardViewPath, graphRouteOf, parseCardView, PROCESS_EDITOR, type CardView } from '../studio/graph/routes'
  import { archiveOp } from '../studio/header'
  import { typeDoc, typeKeyOf } from '../studio/huly'
  import { pageStudio } from '../studio/page-studio'

  interface Crumb {
    id: string
    editor: string
    title: string
  }

  const SECOND_NAV_MIN_WIDTH = 720 // same breakpoint as the stock settings page

  const relationsLabel = 'card:string:ServoneRelations' as IntlString
  const canvasLabel = 'card:string:ServoneCanvas' as IntlString
  const settingsLabel = 'card:string:ServoneSettings' as IntlString
  const archiveLabel = 'card:string:ServoneArchiveType' as IntlString

  const isAdmin = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const studio = pageStudio()

  let masterTags: MasterTag[] = []
  let heldSpace: CardSpace | undefined
  let crumbs: Crumb[] = []
  let subEditorComponent: AnySvelteComponent | undefined
  let isSecondNavVisible = true

  const tagQuery = createQuery()
  tagQuery.query(card.class.MasterTag, {}, (found) => {
    masterTags = found.filter((tag) => tag.removed !== true)
  })

  const spaceQuery = createQuery()

  function followSpace (spaceId: string | undefined): void {
    if (spaceId === undefined) {
      spaceQuery.unsubscribe()
      heldSpace = undefined
      return
    }
    spaceQuery.query(card.class.CardSpace, { _id: spaceId as Ref<CardSpace> }, (found) => {
      heldSpace = found[0]
    })
  }

  function goTo (target: CardView): void {
    const next = getCurrentLocation()
    next.path = cardViewPath(next.path, target)
    navigate(next)
  }

  function isCompanyType (tag: MasterTag): boolean {
    return tag._id !== card.class.Card && tag._id !== CHANGE_TYPE && !isLockedType(tag)
  }

  function resolveShownView (
    requested: CardView | undefined,
    canConfigure: boolean
  ): CardView | undefined {
    if (requested === undefined) return undefined
    if (requested.kind === 'relations') return isAdmin ? requested : undefined
    if (requested.kind === 'records') return requested
    return canConfigure ? requested : { kind: 'records', tagId: requested.tagId }
  }

  function publishCanvasEntry (canConfigure: boolean, shownKind: string | undefined, shownTagId: string | undefined): void {
    const hasEntry = canConfigure && shownTagId !== undefined && (shownKind === 'records' || shownKind === 'canvas' || shownKind === 'settings')
    if (!hasEntry) {
      extraViewStore.set(undefined)
      return
    }
    extraViewStore.set({
      id: 'servone-card-canvas',
      label: canvasLabel,
      icon: Workflow,
      isActive: shownKind === 'canvas',
      open: () => {
        goTo({ kind: 'canvas', tagId: shownTagId, nodeId: undefined })
      },
      recordsLocation: () => {
        const target = getCurrentLocation()
        target.path = cardViewPath(target.path, { kind: 'records', tagId: shownTagId })
        return target
      }
    })
  }

  function loadSubEditor (editorId: string | undefined): void {
    crumbs = []
    subEditorComponent = undefined
    if (editorId === undefined) return
    getResource(editorId as AnyComponent)
      .then((loaded) => {
        if (editorId === requestedEditorId) subEditorComponent = loaded
      })
      .catch((error) => {
        Analytics.handleError(error instanceof Error ? error : new Error(String(error)))
      })
  }

  function onSubEditorChange (event: CustomEvent<Crumb[] | undefined>): void {
    if (Array.isArray(event.detail)) crumbs = event.detail
  }

  function selectCrumb (index: number): void {
    if (currentTag === undefined) return
    if (index === 0) {
      goTo({ kind: 'settings', tagId: currentTag._id, sub: undefined })
      return
    }
    const crumb = crumbs[index - 1]
    goTo({ kind: 'settings', tagId: currentTag._id, sub: { editor: crumb.editor, docId: crumb.id } })
  }

  async function archiveType (tag: MasterTag): Promise<void> {
    const outcome = await studio.save([archiveOp(typeKeyOf(tag))])
    if (outcome.kind !== 'applied') return
    if (tag.extends !== undefined && tag.extends !== card.class.Card) {
      goTo({ kind: 'records', tagId: tag.extends })
      return
    }
    const root = getCurrentLocation()
    root.path = root.path.slice(0, 3)
    navigate(root)
  }

  $: path = $location.path
  $: spaceId = path[3] === 'type' ? undefined : path[3]
  $: requestedTypeId = path[4]
  $: requestedView = spaceId === undefined ? parseCardView(path) : undefined
  $: followSpace(spaceId)

  $: currentTag =
    masterTags.find((tag) => tag._id === requestedTypeId) ?? masterTags.find((tag) => tag._id === card.class.Card)
  $: canConfigure =
    isAdmin && currentTag !== undefined && currentTag._id === requestedTypeId && isCompanyType(currentTag)
  $: shownView = resolveShownView(requestedView, canConfigure)
  $: shownKind = shownView?.kind
  $: shownTagId = shownView !== undefined && shownView.kind !== 'relations' ? shownView.tagId : undefined
  $: publishCanvasEntry(canConfigure, shownKind, shownTagId)

  $: hasEmojiIcon = currentTag?.icon === view.ids.IconWithEmoji
  $: typeIcon = hasEmojiIcon ? IconWithEmoji : currentTag?.icon
  $: typeIconProps = hasEmojiIcon ? { icon: currentTag?.color } : {}

  $: graphRoute =
    shownView !== undefined && (shownView.kind === 'relations' || shownView.kind === 'canvas')
      ? graphRouteOf(shownView, (tagId) => {
        const tag = masterTags.find((candidate) => candidate._id === tagId)
        return tag === undefined ? undefined : typeKeyOf(tag)
      })
      : undefined

  $: settingsSub = shownView !== undefined && shownView.kind === 'settings' ? shownView.sub : undefined
  $: requestedEditorId = settingsSub?.editor
  $: loadSubEditor(requestedEditorId)

  $: breadcrumbItems =
    currentTag === undefined
      ? []
      : [
          {
            id: currentTag._id,
            label: currentTag.label,
            icon: typeIcon,
            iconProps: typeIconProps
          },
          ...crumbs.map((crumb) => ({ id: crumb.id, title: crumb.title }))
        ]

  $: showRecordsSettings = canConfigure && shownKind === 'records'

  onDestroy(() => {
    extraViewStore.set(undefined)
  })
</script>

{#if graphRoute !== undefined}
  <GraphStudio
    route={graphRoute}
    onGo={(next) => {
      goTo(cardViewOf(next, (typeKey) => typeDoc(typeKey)?._id))
    }}
    onOpenProcess={(tagId, processId) => {
      goTo({ kind: 'settings', tagId, sub: { editor: PROCESS_EDITOR, docId: processId } })
    }}
  >
    <svelte:fragment slot="title">
      {#if shownKind === 'relations'}
        <Breadcrumb label={relationsLabel} size="large" isCurrent />
      {:else if currentTag !== undefined && currentTag.label}
        <Breadcrumb icon={typeIcon} iconProps={typeIconProps} label={currentTag.label} size="large" isCurrent />
      {/if}
    </svelte:fragment>
  </GraphStudio>
{:else if shownKind === 'settings' && currentTag !== undefined}
  <div
    class="flex flex-col h-full min-h-0"
    use:resizeObserver={(element) => {
      isSecondNavVisible = element.clientWidth > SECOND_NAV_MIN_WIDTH
    }}
  >
    <Header adaptive={'disabled'}>
      <Breadcrumbs
        items={breadcrumbItems}
        selected={breadcrumbItems.length - 1}
        size="large"
        on:select={(event) => {
          selectCrumb(event.detail)
        }}
      />
      <svelte:fragment slot="actions">
        <button
          type="button"
          class={toolbarIconButton}
          data-id="card-type-archive"
          use:tooltip={{ label: archiveLabel, direction: 'bottom' }}
          on:click={() => {
            if (currentTag !== undefined) void archiveType(currentTag)
          }}
        >
          <Archive size={14} />
        </button>
        <button
          type="button"
          class={cn(toolbarIconButton, 'bg-accent text-foreground')}
          data-id="card-type-settings"
          aria-pressed="true"
          use:tooltip={{ label: settingsLabel, direction: 'bottom' }}
          on:click={() => {
            if (currentTag !== undefined) goTo({ kind: 'records', tagId: currentTag._id })
          }}
        >
          <Settings size={14} />
        </button>
      </svelte:fragment>
    </Header>
    {#if settingsSub !== undefined}
      {#if subEditorComponent !== undefined}
        {#key settingsSub.docId}
          <svelte:component
            this={subEditorComponent}
            _id={settingsSub.docId}
            masterTag={currentTag}
            visibleSecondNav={isSecondNavVisible}
            on:change={onSubEditorChange}
          />
        {/key}
      {/if}
    {:else}
      {#key currentTag._id}
        <MasterTagEditor masterTag={currentTag} visibleSecondNav={isSecondNavVisible} readonly={false} />
      {/key}
    {/if}
  </div>
{:else if currentTag !== undefined && currentTag.label}
  <SpecialView
    _class={currentTag._id}
    baseQuery={spaceId !== undefined ? { space: spaceId } : {}}
    space={spaceId}
    label={currentTag.label}
    icon={typeIcon}
    iconProps={typeIconProps}
  >
    <svelte:fragment slot="searchExtra">
      {#if showRecordsSettings}
        <button
          type="button"
          class={toolbarIconButton}
          data-id="card-type-settings"
          use:tooltip={{ label: settingsLabel, direction: 'bottom' }}
          on:click={() => {
            if (currentTag !== undefined) goTo({ kind: 'settings', tagId: currentTag._id, sub: undefined })
          }}
        >
          <Settings size={14} />
        </button>
      {/if}
    </svelte:fragment>
  </SpecialView>
{:else if heldSpace !== undefined}
  <SpecialView
    _class={card.class.Card}
    baseQuery={{ space: heldSpace._id }}
    space={heldSpace._id}
    label={getEmbeddedLabel(heldSpace.name)}
    icon={card.icon.Space}
    defaultViewletDescriptor={view.viewlet.Table}
  />
{/if}
