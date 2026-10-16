<script lang="ts">
  import type { FavoriteType, MasterTag } from '@hcengineering/card'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, type Ref, type Space } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import preference from '@hcengineering/preference'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Action, getCurrentLocation, IconAdd, location, navigate, NavItem } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { setFilters, TreeNode } from '@hcengineering/view-resources'
  import type { GroupsNavModel } from '@hcengineering/workbench'
  import { CHANGE_TYPE, describe, isLockedType, type ConfigSnapshot } from '@servone/config'
  import { Waypoints } from '@lucide/svelte'
  import card from '../../plugin'
  import TagHierarchy from './TagHierarchy.svelte'
  import { treeRoots } from './type-tree'
  import { cardViewPath, parseCardView } from '../../studio/graph/routes'
  import { isArchivedType } from '../../servone-archived'
  import CreateTypeDialog from '../../studio/components/CreateTypeDialog.svelte'
  import { pageStudio } from '../../studio/page-studio'

  export let model: GroupsNavModel
  export let currentSpace: Ref<Space> | undefined

  const relationsLabel = 'card:string:ServoneRelations' as IntlString
  const systemTypesLabel = 'card:string:ServoneSystemTypes' as IntlString
  const createTypeLabel = 'card:string:ServoneCreateType' as IntlString

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const studio = pageStudio()
  const isAdmin = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const socialIds = getCurrentAccount().socialIds

  let listedTypes: MasterTag[] = []
  let favorites: FavoriteType[] = []
  let snapshot: ConfigSnapshot | undefined

  createQuery().query(card.class.MasterTag, {}, (found) => {
    listedTypes = found
      .filter(
        (type) =>
          !type.removed && !isArchivedType(type) && type._id !== CHANGE_TYPE && type._id !== card.class.Card
      )
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  createQuery().query(card.class.FavoriteType, { createdBy: { $in: socialIds } }, (found) => {
    favorites = found
  })

  function select (typeId: Ref<MasterTag>): void {
    const current = getCurrentLocation()
    setFilters([])
    navigate({ ...current, path: [...current.path.slice(0, 3), 'type', typeId] })
  }

  function openRelations (): void {
    const current = getCurrentLocation()
    navigate({ ...current, path: cardViewPath(current.path, { kind: 'relations' }) })
  }

  async function openCreateType (): Promise<void> {
    snapshot = await describe(studio.session)
  }

  function toggleFavorite (typeId: Ref<MasterTag>): void {
    const existing = favorites.find((favorite) => favorite.attachedTo === typeId)
    if (existing !== undefined) {
      void client.remove(existing)
    } else {
      void client.createDoc(card.class.FavoriteType, core.space.Workspace, { attachedTo: typeId })
    }
  }

  function getItemActions (typeId: Ref<MasterTag>): Action[] {
    const isStarred = favoriteIds.has(typeId)
    return [
      {
        id: 'toggle-favorite-type',
        label: isStarred ? preference.string.Unstar : preference.string.Star,
        icon: view.icon.Star,
        action: async () => {
          toggleFavorite(typeId)
        }
      }
    ]
  }

  const createTypeActions = async (): Promise<Action[]> =>
    isAdmin
      ? [
          {
            id: 'servone-create-type',
            label: createTypeLabel,
            icon: IconAdd,
            action: openCreateType
          }
        ]
      : []

  $: favoriteIds = new Set<Ref<MasterTag>>(favorites.map((favorite) => favorite.attachedTo as Ref<MasterTag>))
  $: systemTypes = listedTypes.filter(isLockedType)
  $: companyTypes = listedTypes.filter((type) => !isLockedType(type))
  $: visibleTypes = isAdmin ? listedTypes : companyTypes
  $: systemIds = systemTypes.map((type) => type._id)
  $: companyIds = companyTypes.map((type) => type._id)
  $: favoriteIdList = [...favoriteIds]

  $: selectedId = $location.path[4] as Ref<MasterTag> | undefined
  $: selectedType = visibleTypes.find((type) => type._id === selectedId)
  $: isSelectedFavorite = selectedType !== undefined && favoriteIds.has(selectedType._id)
  $: isSelectedSystem = selectedType !== undefined && systemIds.includes(selectedType._id)

  $: favoriteTypes = visibleTypes.filter((type) => favoriteIds.has(type._id))
  $: favoriteRoots = favoriteTypes.filter(
    (type) => !favoriteTypes.some((other) => other._id !== type._id && hierarchy.isDerived(type._id, other._id))
  )
  $: companyRoots = treeRoots(companyTypes).filter((type) => !favoriteIds.has(type._id))
  $: systemRoots = treeRoots(systemTypes).filter((type) => !favoriteIds.has(type._id))

  $: favoritesExcluded = isAdmin ? [] : systemIds
  $: isRelationsSelected = parseCardView($location.path)?.kind === 'relations'
</script>

<div class="flex flex-col w-full shrink-0">
  {#if isAdmin}
    <NavItem
      _id="servone-card-relations"
      label={relationsLabel}
      icon={Waypoints}
      selected={isRelationsSelected}
      on:click={openRelations}
    >
      <svelte:fragment slot="icon">
        <Waypoints size={16} />
      </svelte:fragment>
    </NavItem>
  {/if}

  {#if favoriteRoots.length > 0}
    <TreeNode
      _id={`tree-favorites-${model.id}`}
      label={card.string.Favorites}
      highlighted={isSelectedFavorite}
      isFold
      empty={false}
    >
      <TagHierarchy
        classes={favoriteRoots}
        allClasses={visibleTypes}
        _class={selectedId}
        space={undefined}
        {currentSpace}
        {getItemActions}
        excludedClasses={favoritesExcluded}
        on:select={(event) => {
          select(event.detail)
        }}
      />
    </TreeNode>
  {/if}

  {#if isAdmin || companyRoots.length > 0}
    <TreeNode
      _id={`tree-${model.id}`}
      label={model.label}
      highlighted={selectedType !== undefined && !isSelectedFavorite && !isSelectedSystem}
      isFold={companyRoots.length > 0}
      empty={companyRoots.length === 0}
      actions={createTypeActions}
    >
      <TagHierarchy
        classes={companyRoots}
        allClasses={companyTypes}
        _class={selectedId}
        space={undefined}
        {currentSpace}
        {getItemActions}
        excludedClasses={[...favoriteIdList, ...systemIds]}
        on:select={(event) => {
          select(event.detail)
        }}
      />
    </TreeNode>
  {/if}

  {#if isAdmin && systemRoots.length > 0}
    <TreeNode
      _id={`tree-system-${model.id}`}
      label={systemTypesLabel}
      highlighted={isSelectedSystem && !isSelectedFavorite}
      isFold
      empty={false}
    >
      <TagHierarchy
        classes={systemRoots}
        allClasses={systemTypes}
        _class={selectedId}
        space={undefined}
        {currentSpace}
        {getItemActions}
        excludedClasses={[...favoriteIdList, ...companyIds]}
        on:select={(event) => {
          select(event.detail)
        }}
      />
    </TreeNode>
  {/if}
</div>

{#if snapshot !== undefined}
  <CreateTypeDialog
    {snapshot}
    {studio}
    onClose={() => {
      snapshot = undefined
    }}
  />
{/if}
