<script lang="ts">
  import contact, { type PermissionsStore } from '@hcengineering/contact'
  import core, { type AnyAttribute, type Doc, type Ref, type TypedSpace } from '@hcengineering/core'
  import { getResource } from '@hcengineering/platform'
  import type { AttributeModel } from '@hcengineering/view'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { canChangeAttribute, FixedColumn, restrictionStore } from '../..'
  import DividerPresenter from './DividerPresenter.svelte'

  export let docObject: Doc
  export let attributeModel: AttributeModel
  export let onChange: ((value: unknown) => void) | undefined
  export let value: unknown
  export let props: Record<string, unknown>
  export let hideDivider: boolean = false
  export let compactMode: boolean = false
  export let readonly: boolean = false

  const dispatch = createEventDispatcher<{ resize: unknown }>()

  let loadedPermissions: PermissionsStore | undefined
  let stopWatchingPermissions: (() => void) | undefined

  onMount(async () => {
    const permissionsStore = await getResource(contact.store.Permissions)
    stopWatchingPermissions = permissionsStore.subscribe((latest) => {
      loadedPermissions = latest
    })
  })
  onDestroy(() => stopWatchingPermissions?.())

  function mayChange (
    changedAttribute: AnyAttribute | undefined,
    permissions: PermissionsStore | undefined,
    document: Doc
  ): boolean {
    if (changedAttribute === undefined || permissions === undefined) return true
    return canChangeAttribute(changedAttribute, document.space as Ref<TypedSpace>, permissions, document._class)
  }

  function relayResize (event: CustomEvent<unknown>): void {
    if (event.detail !== undefined) dispatch('resize', event.detail)
  }

  $: attribute = attributeModel.attribute
  $: displayProps = attributeModel.displayProps
  $: isReadonlyCell = readonly || $restrictionStore.readonly || !mayChange(attribute, loadedPermissions, docObject)

  $: justification =
    displayProps?.fixed ?? (displayProps?.compression === true && displayProps?.key !== undefined ? 'left' : undefined)

  $: baseProps =
    attribute?.type._class === core.class.EnumOf
      ? { ...attributeModel.props, type: attribute.type, ...props }
      : { object: docObject, ...attributeModel.props, space: docObject.space, ...props }

  $: lockedProps =
    isReadonlyCell || attribute?.readonly === true
      ? { readonly: true, disabled: true, editable: false, isEditable: false }
      : {}

  $: presenterProps = { ...baseProps, ...lockedProps }
</script>

{#if displayProps?.dividerBefore === true && !hideDivider}
  <DividerPresenter />
{/if}
{#if justification !== undefined && displayProps !== undefined}
  <FixedColumn
    key={`list_item_${displayProps.key}`}
    justify={justification}
    addClass={displayProps.key !== undefined ? `list-cell-${displayProps.key}` : undefined}
  >
    <svelte:component
      this={attributeModel.presenter}
      {value}
      {onChange}
      kind={'list'}
      {compactMode}
      label={attributeModel.label}
      {attribute}
      {...presenterProps}
      on:resize={relayResize}
    />
  </FixedColumn>
{:else}
  <svelte:component
    this={attributeModel.presenter}
    {value}
    {onChange}
    kind={'list'}
    {compactMode}
    label={attributeModel.label}
    {attribute}
    {...presenterProps}
    on:resize={relayResize}
  />
{/if}
