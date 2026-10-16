<script lang="ts">
  import { NavLink } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { type BottomAction } from '../index'
  import { getHref } from '../utils'

  export let action: BottomAction

  function followPlainLink (event: MouseEvent): void {
    event.preventDefault()
    action.func()
  }
</script>

<span class="footer-link-row text-sm text-muted-foreground">
  {#if action.caption !== undefined}
    <span><Label label={action.caption} /></span>
  {/if}
  {#if action.page !== undefined}
    <NavLink href={getHref(action.page)} onClick={() => action.func()}>
      <Label label={action.i18n} />
    </NavLink>
  {:else}
    <a href="." on:click={followPlainLink}><Label label={action.i18n} /></a>
  {/if}
</span>

<style>
  .footer-link-row :global(a) {
    color: var(--foreground);
    font-weight: 500;
    text-decoration: none;
  }

  .footer-link-row :global(a:hover) {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
</style>
