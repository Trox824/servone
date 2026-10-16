<script lang="ts">
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import type { ConfigSnapshot, RecordTypeInfo } from '@servone/config'
  import { Send, TriangleAlert } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Switch } from '../../../../lib/components/ui/switch'
  import {
    accessOp,
    accessRows,
    isOpenWithPeople,
    presetLabel,
    PRESETS,
    withPeople,
    withRestricted,
    type AccessRow
  } from '../access'
  import type { StudioContext } from '../extensions'
  import { text } from '../strings'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo

  let before: AccessRow[] = []
  let after: AccessRow[] = []
  let isSaving = false

  $: reset(snapshot, type)
  $: op = accessOp(type.key, before, after)

  function reset (nextSnapshot: ConfigSnapshot, nextType: RecordTypeInfo): void {
    before = accessRows(nextSnapshot, nextType)
    after = before
  }

  async function send (): Promise<void> {
    if (op === undefined || isSaving) return
    isSaving = true
    try {
      await studio.save([op])
    } finally {
      isSaving = false
    }
  }
</script>

<div class="studio-access">
  <div class="grid gap-1">
    <p class="studio-access-note">{text('AccessHelp')}</p>
    <p class="studio-access-note">{text('AccessLimit')}</p>
  </div>
  {#if after.length === 0}
    <p class="studio-access-empty">{text('AccessEmpty')}</p>
  {:else}
    <ul class="studio-access-list">
      {#each after as row (row.space)}
        <li class="studio-access-space" data-id="studio-access-row">
          <h3 class="studio-access-name" title={row.name}>{row.name}</h3>
          <label class="studio-access-line">
            <span class="studio-access-label">{text('Restricted')}</span>
            <Switch
              data-id="studio-access-restricted"
              checked={row.isRestricted}
              onCheckedChange={(isChecked) => {
                after = withRestricted(after, row.space, isChecked)
              }}
            />
          </label>
          {#each PRESETS as preset (preset)}
            <div class="studio-access-line" data-id={`studio-access-${preset}`}>
              <span class="studio-access-label">{presetLabel(preset)}</span>
              <div class="studio-access-people">
                <AccountArrayEditor
                  label={getEmbeddedLabel(presetLabel(preset))}
                  emptyLabel={getEmbeddedLabel(text('ApproverPickPeople'))}
                  value={row[preset]}
                  onChange={(people) => {
                    after = withPeople(after, row.space, preset, people)
                  }}
                />
              </div>
            </div>
          {/each}
          {#if isOpenWithPeople(row)}
            <p class="studio-access-warn"><TriangleAlert size={14} />{text('UnrestrictedHint')}</p>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="grid gap-2">
      <p class="studio-access-note">{text('AccessApproval')}</p>
      <Button
        class="justify-self-start"
        data-id="studio-send-approval"
        disabled={op === undefined || isSaving}
        onclick={() => {
          void send()
        }}><Send />{text('SendForApproval')}</Button
      >
    </div>
  {/if}
</div>

<style>
  .studio-access {
    display: grid;
    align-content: start;
    gap: 16px;
    max-width: 640px;
    padding: 24px;
  }
  /* The graph panel body already pads its content. */
  :global(.graph-panel-body) > .studio-access {
    padding: 0;
  }
  .studio-access-note {
    margin: 0;
    color: var(--theme-halfcontent-color);
    font-size: 13px;
    line-height: 1.45;
  }
  .studio-access-empty {
    margin: 0;
    padding: 16px;
    border: 1px dashed var(--theme-divider-color);
    border-radius: 8px;
    color: var(--theme-halfcontent-color);
    font-size: 13px;
  }
  .studio-access-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .studio-access-space {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 12px 0;
    border-top: 1px solid var(--theme-divider-color);
  }
  .studio-access-name {
    margin: 0 0 4px;
    overflow: hidden;
    color: var(--theme-caption-color);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .studio-access-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    min-height: 32px;
  }
  label.studio-access-line {
    cursor: pointer;
  }
  .studio-access-label {
    min-width: 0;
    color: var(--theme-dark-color);
    font-size: 13px;
  }
  .studio-access-people {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
    max-width: 60%;
  }
  .studio-access-warn {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 4px 0 0;
    color: var(--theme-button-warning-color);
    font-size: 12px;
    line-height: 1.4;
  }
  .studio-access-warn :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
</style>
