<script lang="ts">
  import type { Employee, Person } from '@hcengineering/contact'
  import { type IconSize, type LabelAndProps, tooltip } from '@hcengineering/ui'
  import { DocNavLink, ObjectMention } from '@hcengineering/view-resources'
  import type { ObjectPresenterType } from '@hcengineering/view'
  import Avatar from './Avatar.svelte'

  export let value: Person | Employee | undefined | null
  export let name: string
  export let inline: boolean = false
  export let disabled: boolean = false
  export let shouldShowAvatar: boolean = true
  export let shouldShowName: boolean = true
  export let noUnderline: boolean = false
  export let avatarSize: IconSize = 'x-small'
  export let onEdit: ((event: MouseEvent) => void) | undefined = undefined
  export let showTooltip: LabelAndProps | undefined = undefined
  export let enlargedText: boolean = false
  export let colorInherit: boolean = false
  export let accent: boolean = false
  export let maxWidth: string | undefined = undefined
  export let type: ObjectPresenterType = 'link'
  export let showStatus: boolean = true
  export let overflowLabel: boolean = true
  export let inlineBlock: boolean = false
  export let shrink: boolean = false

  $: activeTooltip = disabled ? undefined : showTooltip
  $: avatarGap = !shouldShowName ? '' : enlargedText ? 'mr-3' : 'mr-2'
  $: labelClasses = ['ap-label', overflowLabel ? 'overflow-label' : '', colorInherit ? 'colorInherit' : '', accent ? 'fs-bold' : '']
    .filter((className) => className !== '')
    .join(' ')
  $: textClasses = [overflowLabel ? 'overflow-label' : '', shrink ? '' : 'flex-no-shrink']
    .filter((className) => className !== '')
    .join(' ')
</script>

{#if value}
  {#if inline}
    <ObjectMention object={value} {disabled} onClick={onEdit} />
  {:else if type === 'link'}
    <DocNavLink
      object={value}
      onClick={onEdit}
      {disabled}
      {noUnderline}
      {colorInherit}
      {accent}
      {inlineBlock}
      noOverflow={true}
      shrink={shrink ? 1 : 0}
      title={shouldShowName ? undefined : name}
    >
      <span
        class="antiPresenter h-full"
        class:text-base={enlargedText}
        style:max-width={maxWidth}
        use:tooltip={activeTooltip}
      >
        {#if shouldShowAvatar}
          <span class="ap-icon {avatarGap}">
            <Avatar size={avatarSize} person={value} name={value.name} {showStatus} />
          </span>
        {/if}
        {#if shouldShowName}
          <span class={labelClasses}>{name}</span>
        {/if}
      </span>
    </DocNavLink>
  {:else if type === 'text'}
    <span class={textClasses} style:max-width={maxWidth} use:tooltip={activeTooltip}>{name}</span>
  {/if}
{/if}
