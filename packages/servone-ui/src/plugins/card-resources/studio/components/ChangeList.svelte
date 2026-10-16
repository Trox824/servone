<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { PersonIdPresenter } from '@hcengineering/view-resources'
  import type { ChangeId, ChangeRecord } from '@servone/config'
  import { ChevronDown, ChevronRight, Undo2 } from '@lucide/svelte'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import { diffRows, riskLabel, riskTone } from '../diff'
  import type { StudioContext } from '../extensions'
  import { changeRows } from '../history'
  import { text } from '../strings'

  export let studio: StudioContext
  export let changes: ChangeRecord[]

  const account = getCurrentAccount()
  const viewer = { socialIds: account.socialIds, isMaintainer: hasAccountRole(account, AccountRole.Maintainer) }

  let openId: ChangeId | undefined
  let busyId: ChangeId | undefined

  $: rows = changeRows(changes, viewer)

  async function act (id: ChangeId, action: () => Promise<void>): Promise<void> {
    busyId = id
    try {
      await action()
    } finally {
      busyId = undefined
    }
  }

  function when (at: number): string {
    return new Date(at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  }
</script>

{#if rows.length === 0}
  <p class="change-empty">{text('HistoryEmpty')}</p>
{:else}
  <ul class="change-list">
    {#each rows as row (row.change.id)}
      {@const isOpen = openId === row.change.id}
      <li class="change-row" data-id="studio-change-row">
        <button
          type="button"
          class="change-toggle"
          aria-label={text('Details')}
          aria-expanded={isOpen}
          on:click={() => {
            openId = isOpen ? undefined : row.change.id
          }}
        >
          {#if isOpen}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}
        </button>
        <div class="change-body">
          <div class="flex items-start gap-2">
            <span class="change-summary">{row.change.summary}</span>
            <Badge variant={row.tone} data-id="studio-change-status">{row.statusLabel}</Badge>
          </div>
          <div class="change-meta">
            <span class="change-person" title={text('Author')}><PersonIdPresenter value={row.change.author} /></span>
            <span>{when(row.change.createdOn)}</span>
            {#if row.change.approver !== undefined}
              <span class="change-person">{text('Approver')}: <PersonIdPresenter value={row.change.approver} /></span>
            {/if}
            {#if row.change.risk !== 'safe'}
              <Badge variant={riskTone(row.change.risk)}>{riskLabel(row.change.risk)}</Badge>
            {/if}
          </div>
          {#if row.change.undoOf !== undefined}<span class="change-note">{text('UndoneChange')}</span>{/if}
          {#if row.isOwnPending}<span class="change-note">{text('OwnChange')}</span>{/if}
          {#if isOpen}
            <ul class="change-diff">
              {#each diffRows(row.change.diff) as line}
                <li class="flex items-start justify-between gap-2">
                  <span class="min-w-0">{line.text}</span>
                  {#if line.affectedText !== undefined}<Badge variant="destructive">{line.affectedText}</Badge>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if row.canApprove || row.canReject || row.canUndo || row.canDiscard}
            <div class="flex flex-wrap gap-2" class:change-actions-quiet={!row.canApprove}>
              {#if row.canApprove}
                <Button
                  variant="outline"
                  data-id="studio-approve"
                  disabled={busyId !== undefined}
                  onclick={() => {
                    void act(row.change.id, async () => {
                      await studio.approve(row.change.id)
                    })
                  }}>{text('Approve')}</Button
                >
              {/if}
              {#if row.canReject}
                <Button
                  variant="ghost"
                  data-id="studio-reject"
                  disabled={busyId !== undefined}
                  onclick={() => {
                    void act(row.change.id, async () => {
                      await studio.reject(row.change.id)
                    })
                  }}>{row.rejectLabel}</Button
                >
              {/if}
              {#if row.canUndo}
                <Button
                  variant="ghost"
                  class="text-muted-foreground"
                  data-id="studio-history-undo"
                  disabled={busyId !== undefined}
                  onclick={() => {
                    void act(row.change.id, async () => {
                      await studio.undo(row.change.id)
                    })
                  }}><Undo2 />{text('Undo')}</Button
                >
              {/if}
              {#if row.canDiscard}
                <Button
                  variant="ghost"
                  class="text-muted-foreground"
                  data-id="studio-discard"
                  disabled={busyId !== undefined}
                  onclick={() => {
                    void act(row.change.id, async () => {
                      await studio.reject(row.change.id)
                    })
                  }}>{text('Discard')}</Button
                >
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .change-empty {
    margin: 0;
    padding: 24px 16px;
    color: var(--theme-halfcontent-color);
    font-size: 13px;
  }
  .change-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .change-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .change-toggle {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 4px;
    color: var(--theme-halfcontent-color);
  }
  .change-toggle:hover {
    background: var(--theme-button-default);
  }
  .change-body {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
  }
  .change-summary {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
  .change-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    color: var(--theme-halfcontent-color);
    font-size: 12px;
  }
  .change-person {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  /* PersonIdPresenter pads itself 12px; the author starts on the summary's edge. */
  .change-person > :global(.pl-3) {
    padding-left: 0;
  }
  /* A ghost button's text sits 10px in; pull the row back so it lines up with the summary. */
  .change-actions-quiet {
    margin-left: -10px;
  }
  .change-note {
    color: var(--theme-halfcontent-color);
    font-size: 12px;
  }
  .change-diff {
    display: grid;
    gap: 4px;
    margin: 4px 0;
    padding: 0 0 0 12px;
    list-style: none;
    border-left: 1px solid var(--theme-divider-color);
    font-size: 13px;
  }
</style>
