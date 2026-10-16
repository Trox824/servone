<script lang="ts">
  import contact from '@hcengineering/contact'
  import type { Doc, Mixin } from '@hcengineering/core'
  import notification from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import ClassAttributeBar from './ClassAttributeBar.svelte'

  export let object: Doc
  export let mixins: Array<Mixin<Doc>> = []
  export let ignoreKeys: string[]
  export let allowedCollections: string[] = []
  export let showHeader: boolean = true
  export let readonly: boolean = false

  const hierarchy = getClient().getHierarchy()

  $: isPerson = hierarchy.isDerived(object._class, contact.class.Person)
  $: sectionHeaderVisible = showHeader && !isPerson
  $: sectionCollections = [...allowedCollections, 'collaborators']
  $: hasCollaboratorsMixin = mixins.some((mixin) => mixin._id === notification.mixin.Collaborators)
  $: shownMixins =
    isPerson || hasCollaboratorsMixin
      ? mixins
      : [...mixins, hierarchy.getClass(notification.mixin.Collaborators)]

  function isMixinVisible (mixin: Mixin<Doc>): boolean {
    if (!hierarchy.hasMixin(mixin, setting.mixin.Editable)) return true
    return Boolean(hierarchy.as(mixin, setting.mixin.Editable).value)
  }

  function getAttributeLimit (mixin: Mixin<Doc>): Mixin<Doc>['extends'] {
    return hierarchy.hasMixin(mixin, setting.mixin.UserMixin) ? mixin.extends : object._class
  }
</script>

<ClassAttributeBar
  _class={object._class}
  {object}
  {ignoreKeys}
  to={undefined}
  allowedCollections={sectionCollections}
  showHeader={sectionHeaderVisible}
  {readonly}
  isMainClass={true}
  on:update
/>
{#each shownMixins as mixin (mixin._id)}
  {#if isMixinVisible(mixin)}
    <ClassAttributeBar
      _class={mixin._id}
      object={hierarchy.as(object, mixin._id)}
      {ignoreKeys}
      to={getAttributeLimit(mixin)}
      {readonly}
      allowedCollections={sectionCollections}
      showHeader={sectionHeaderVisible}
      on:update
    />
  {/if}
{/each}
