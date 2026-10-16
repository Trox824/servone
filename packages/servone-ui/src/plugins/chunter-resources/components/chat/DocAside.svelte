<script lang="ts">
  import core, { type Class, type Doc, type Mixin, type Ref, type Space } from '@hcengineering/core'
  import {
    AttributeBarEditor,
    getClient,
    getFiltredKeys,
    isCollectionAttr,
    type KeyedAttribute
  } from '@hcengineering/presentation'
  import { Scroller } from '@hcengineering/ui'
  import { ClassAttributeBar, getDocMixins } from '@hcengineering/view-resources'
  import type { ObjectChatPanel } from '@hcengineering/chunter'

  interface MixinKeyGroup {
    mixinId: Ref<Mixin<Doc>>
    keys: KeyedAttribute[]
  }

  export let object: Doc
  export let objectChatPanel: ObjectChatPanel | undefined
  export let locked = false

  const hierarchy = getClient().getHierarchy()

  $: panelIgnoreKeys = objectChatPanel?.ignoreKeys ?? []
  $: isSpaceArchived = hierarchy.isDerived(object._class, core.class.Space) && (object as Space).archived
  $: isMainBarReadonly = locked || isSpaceArchived

  function collectMixinKeys (mixinId: Ref<Mixin<Doc>>, ignoreKeys: string[], objectClass: Ref<Class<Doc>>): KeyedAttribute[] {
    const parentClass = hierarchy.getClass(mixinId).extends
    const stopAt = parentClass !== undefined && hierarchy.isMixin(parentClass) ? parentClass : objectClass
    return getFiltredKeys(hierarchy, mixinId, ignoreKeys, stopAt).filter((attribute) => !isCollectionAttr(hierarchy, attribute))
  }

  $: mixinGroups = getDocMixins(object)
    .map((mixin): MixinKeyGroup => ({ mixinId: mixin._id, keys: collectMixinKeys(mixin._id, panelIgnoreKeys, object._class) }))
    .filter((group) => group.keys.length > 0)
</script>

<Scroller>
  <ClassAttributeBar
    _class={object._class}
    {object}
    ignoreKeys={panelIgnoreKeys}
    showHeader={false}
    readonly={isMainBarReadonly}
    on:update
  />
  <div class="popupPanel-body__aside-grid">
    {#each mixinGroups as group (group.mixinId)}
      <div class="divider"></div>
      {#each group.keys as attribute (attribute.key)}
        <AttributeBarEditor
          key={attribute}
          _class={group.mixinId}
          object={hierarchy.as(object, group.mixinId)}
          showHeader
          size="medium"
          readonly={locked}
        />
      {/each}
    {/each}
  </div>
  <slot />
</Scroller>
