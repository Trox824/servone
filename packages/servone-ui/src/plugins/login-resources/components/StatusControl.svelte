<!--
// Copyright © 2020 Anticrm Platform Contributors.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<!--
  Shadow of plugins/login-resources/src/components/StatusControl.svelte (webpack
  NormalModuleReplacementPlugin, dev/prod/webpack.config.js).
  Renders `status.code` directly rather than via @hcengineering/ui `Status` so the Alert's icon is the only one.
-->
<script lang="ts">
  import type { Status } from '@hcengineering/platform'
  import { Severity } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { CircleAlert, Info } from '@lucide/svelte'

  import { Alert, AlertDescription } from '../../../lib/components/ui/alert'

  export let status: Status
</script>

{#if status.severity !== Severity.OK}
  <Alert variant={status.severity === Severity.ERROR ? 'destructive' : 'default'} class="bg-muted/40">
    {#if status.severity === Severity.ERROR}
      <CircleAlert />
    {:else}
      <Info />
    {/if}
    <AlertDescription class={status.severity === Severity.ERROR ? '' : 'text-foreground'}>
      <Label label={status.code} params={status.params} />
    </AlertDescription>
  </Alert>
{/if}
