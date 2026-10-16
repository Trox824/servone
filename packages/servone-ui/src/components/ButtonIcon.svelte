<script lang="ts">
  import type { Asset } from '@hcengineering/platform'
  import type { ComponentType } from 'svelte'
  import type { AnySvelteComponent, IconSize, LabelAndProps } from '../original'
  import ButtonBase from './ButtonBase.svelte'

  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'
  export let icon: Asset | AnySvelteComponent | ComponentType
  export let iconProps: any | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let disabled: boolean = false
  export let pressed: boolean = false
  export let hasMenu: boolean = false
  export let noPrint: boolean = false
  export let loading: boolean = false
  export let inheritColor: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined
  export let focusIndex: number = -1
  export let id: string | undefined = undefined
  export let dataId: string | undefined = undefined
  export let track: string | undefined = undefined
  export let element: HTMLButtonElement | undefined = undefined

  let baseButton: ButtonBase | undefined = undefined

  export function focus (): void {
    baseButton?.focus()
  }
</script>

<ButtonBase
  bind:this={baseButton}
  bind:element
  type="type-button-icon"
  {kind}
  {size}
  {icon}
  {iconProps}
  {iconSize}
  {disabled}
  {loading}
  {pressed}
  {hasMenu}
  {noPrint}
  {inheritColor}
  {tooltip}
  {focusIndex}
  {id}
  {dataId}
  {track}
  on:click
  on:keydown
/>
