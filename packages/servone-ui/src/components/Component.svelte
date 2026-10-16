<script lang="ts">
  import { getResourceP } from '@hcengineering/platform'
  import type { SvelteComponent } from 'svelte'
  import { clone } from '@hcengineering/core'
  import { ErrorPresenter, type AnyComponent, type AnySvelteComponent } from '../original'
  import ErrorBoundary from '@hcengineering/ui/src/components/internal/ErrorBoundary.svelte'
  import { deepEqual } from 'fast-equals'
  import AppLoading from './AppLoading.svelte'
  import PendingComponent from './PendingComponent.svelte'

  export let innerRef: SvelteComponent | undefined = undefined
  export let is: AnyComponent | AnySvelteComponent
  export let props = {}
  export let shrink: boolean = false
  export let showLoading: boolean = true
  export let inline: boolean = false
  export let disabled: boolean = false
  export let appLoading: boolean = false

  let mountedComponent: AnySvelteComponent | undefined
  type PropBag = Record<string, unknown>

  let preparedProps: PropBag | null | undefined = {}
  let isLoading: boolean = false
  let loadError: unknown
  let latestRequest = 0
  let lastSeenIs: AnyComponent | AnySvelteComponent | undefined

  function prepareProps (incoming: PropBag | null | undefined, previous: PropBag | null | undefined): PropBag | null | undefined {
    if (incoming === null || incoming === undefined) return incoming
    const copied = clone(incoming, undefined, undefined, 10)
    const kept: PropBag = {}
    for (const key of Object.keys(copied)) {
      if (copied[key] !== undefined || previous?.[key] !== undefined) kept[key] = copied[key]
    }
    return kept
  }

  function mountFresh (component: AnySvelteComponent): void {
    mountedComponent = component
    preparedProps = prepareProps(props, undefined)
  }

  function resolveComponent (target: AnyComponent | AnySvelteComponent): void {
    latestRequest++
    const requestId = latestRequest
    if (target === null || target === undefined) {
      mountedComponent = undefined
      loadError = new Error('is not defined')
      return
    }
    if (typeof target !== 'string') {
      isLoading = false
      mountFresh(target)
      return
    }
    const resource = getResourceP<AnySvelteComponent>(target)
    if (resource instanceof Promise) {
      isLoading = true
      mountedComponent = undefined
      resource.then(
        (loaded) => {
          if (requestId !== latestRequest) return
          isLoading = false
          mountFresh(loaded)
        },
        (reason) => {
          if (requestId !== latestRequest) return
          loadError = reason
        }
      )
    } else {
      isLoading = false
      mountFresh(resource)
    }
  }

  $: if (!deepEqual(lastSeenIs, is) || lastSeenIs === undefined) {
    lastSeenIs = is
    resolveComponent(is)
  }

  function refreshProps (incoming: PropBag | null | undefined): void {
    const nextProps = prepareProps(incoming, preparedProps)
    if (!deepEqual(nextProps, preparedProps)) preparedProps = nextProps
  }

  $: if (mountedComponent !== undefined) refreshProps(props)
</script>

{#if isLoading}
  {#if showLoading}
    {#if appLoading}
      <AppLoading {shrink} />
    {:else}
      <PendingComponent {shrink} />
    {/if}
  {/if}
{:else if mountedComponent}
  <ErrorBoundary bind:error={loadError}>
    {#if $$slots.default}
      <svelte:component this={mountedComponent} bind:this={innerRef} {...preparedProps} {inline} {disabled} on:change on:close on:open on:click on:delete on:action on:valid on:validate on:submit on:select on:loaded>
        <slot />
      </svelte:component>
    {:else}
      <svelte:component this={mountedComponent} bind:this={innerRef} {...preparedProps} {inline} {disabled} on:change on:close on:open on:click on:delete on:action on:valid on:validate on:submit on:select on:loaded />
    {/if}
  </ErrorBoundary>
{/if}
{#if loadError}
  <pre style="max-height: 140px; overflow: auto;"><ErrorPresenter error={loadError} /></pre>
{/if}
