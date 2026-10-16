<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import type { ScopeOption } from '@servone/import'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import { groupScopes } from './connect'

  export let scopes: ScopeOption[]
  export let selected: Set<string>

  const SELECT_ALL = 'setting:string:ServoneImportSelectAll' as IntlString
  const SELECT_NONE = 'setting:string:ServoneImportSelectNone' as IntlString
  const SELECTED_COUNT = 'setting:string:ServoneImportSelectedCount' as IntlString

  $: groups = groupScopes(scopes)

  function setSelected (ids: string[], isSelected: boolean): void {
    for (const id of ids) {
      if (isSelected) selected.add(id)
      else selected.delete(id)
    }
    selected = selected
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-4">
    <span class="text-xs tabular-nums text-muted-foreground">
      <Label label={SELECTED_COUNT} params={{ selected: selected.size, total: scopes.length }} />
    </span>
    <span class="flex items-center gap-3 text-xs">
      <button
        type="button"
        class="text-muted-foreground transition-colors hover:text-foreground"
        on:click={() => {
          setSelected(scopes.map((scope) => scope.id), true)
        }}
      >
        <Label label={SELECT_ALL} />
      </button>
      <button
        type="button"
        class="text-muted-foreground transition-colors hover:text-foreground"
        on:click={() => {
          setSelected(scopes.map((scope) => scope.id), false)
        }}
      >
        <Label label={SELECT_NONE} />
      </button>
    </span>
  </div>
  {#each groups as group (group.parentName)}
    <div class="flex flex-col gap-2">
      {#if group.parentName !== undefined}
        <div class="flex items-center justify-between gap-4">
          <span class="truncate text-xs font-medium text-muted-foreground">{group.parentName}</span>
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {group.scopes.filter((scope) => selected.has(scope.id)).length}/{group.scopes.length}
          </span>
        </div>
      {/if}
      <ul class="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {#each group.scopes as scope (scope.id)}
          <li>
            <label class="flex cursor-pointer items-center gap-3 px-3 py-2">
              <Checkbox
                checked={selected.has(scope.id)}
                onCheckedChange={(checked) => {
                  setSelected([scope.id], checked)
                }}
              />
              <span class="min-w-0 flex-1 truncate text-sm text-foreground">{scope.name}</span>
            </label>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>
