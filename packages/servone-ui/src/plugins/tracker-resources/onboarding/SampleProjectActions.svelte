<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import core, { type Ref, type Space } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { teamFocusClass } from '../../../onboarding/team-focus'

  export let space: Ref<Space> | undefined

  const sampleLabel = 'ui:string:ServoneChecklistSample' as IntlString
  const archiveLabel = 'ui:string:ServoneChecklistArchive' as IntlString

  let hasSampleContent = true

  createQuery().query(teamFocusClass, {}, (settings) => {
    hasSampleContent = settings.find((setting) => setting.servoneTeamFocus !== undefined)?.servoneSampleContent !== false
  })

  $: isSample = hasSampleContent && space === tracker.project.DefaultProject

  async function archive (): Promise<void> {
    await getClient().updateDoc(tracker.class.Project, core.space.Space, tracker.project.DefaultProject, {
      archived: true
    })
    Analytics.handleEvent('sample_archived')
  }
</script>

{#if isSample}
  <span class="sample"><Label label={sampleLabel} /></span>
  <Button kind="regular" size="small" label={archiveLabel} on:click={archive} />
{/if}

<style>
  .sample {
    padding: 0.0625rem 0.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 9999px;
    color: var(--theme-dark-color);
    font-size: 0.75rem;
  }
</style>
