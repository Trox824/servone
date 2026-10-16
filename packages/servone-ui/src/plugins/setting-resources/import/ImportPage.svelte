<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Breadcrumb, Header, Label, Loading, Scroller } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { servoneServiceUrl } from '../../chunter-resources/webhooks/api'
  import IconImport from './IconImport.svelte'
  import ImportWizard from './ImportWizard.svelte'

  const IMPORT = 'setting:string:ServoneImport' as IntlString
  const NOT_CONFIGURED = 'setting:string:ServoneImportNotConfigured' as IntlString

  let serviceUrl: string | undefined | null = null

  onMount(async () => {
    serviceUrl = await servoneServiceUrl('SERVONE_MCP_URL')
  })
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={IconImport} label={IMPORT} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
      {#if serviceUrl === null}
        <Loading size="small" />
      {:else if serviceUrl === undefined}
        <span class="text-sm text-muted-foreground"><Label label={NOT_CONFIGURED} /></span>
      {:else}
        <ImportWizard base={serviceUrl} />
      {/if}
    </div>
  </Scroller>
</div>
