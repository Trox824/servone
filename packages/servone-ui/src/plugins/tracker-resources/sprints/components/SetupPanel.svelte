<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { emptyCopy } from '../../../../onboarding/empty-copy'
  import { str } from '../plugin'
  import { canSetUp, isScrumProject, setUpScrum } from '../setup'

  export let project: Project

  const client = getClient()
  let busy = false
  let error: string | undefined

  async function run (): Promise<void> {
    busy = true
    error = undefined
    try {
      await setUpScrum(client, project)
    } catch (e: any) {
      error = String(e?.message ?? e)
    } finally {
      busy = false
    }
  }

  $: ready = isScrumProject(project)
</script>

<div class="mx-auto flex max-w-lg flex-col gap-3 p-8 text-sm">
  {#if !ready}
    <p class="text-foreground"><Label label={emptyCopy.sprints} /></p>
    {#if canSetUp()}
      <div>
        <Button track={'tracker.scrum_setup.submit'} kind={'primary'} size={'medium'} label={busy ? str.SettingUp : emptyCopy.sprintsAction} disabled={busy} on:click={run} />
      </div>
    {:else}
      <p class="text-muted-foreground"><Label label={str.SetupScrumNeedsOwner} /></p>
    {/if}
  {/if}
  {#if error !== undefined}
    <p class="text-destructive"><Label label={getEmbeddedLabel(error)} /></p>
  {/if}
</div>
