<script lang="ts">
  import { BUNDLED_PACKS, packContents, packStatus, type ConfigSnapshot, type Pack } from '@servone/config'
  import { Download } from '@lucide/svelte'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import type { StudioContext } from '../extensions'
  import { canInstall, installLabel, installNotice, stateBadge } from '../packs'
  import { text } from '../strings'
  import ExportPackDialog from './ExportPackDialog.svelte'
  import PanelClose from './PanelClose.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let onClose: (() => void) | undefined = undefined

  let installingKey: string | undefined
  let notices = new Map<string, string>()
  let isExportOpen = false

  $: gallery = BUNDLED_PACKS.map((pack) => ({ pack, contents: packContents(pack), state: packStatus(pack, snapshot) }))

  async function install (pack: Pack): Promise<void> {
    installingKey = pack.key
    try {
      const notice = installNotice(pack, await studio.save(pack.operations))
      const next = new Map(notices)
      if (notice === undefined) next.delete(pack.key)
      else next.set(pack.key, notice)
      notices = next
    } finally {
      installingKey = undefined
    }
  }
</script>

<div class="packs" data-id="studio-packs-section">
  <header class="packs-head">
    <div class="flex items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">{text('Packs')}</h2>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          data-id="studio-export-pack"
          onclick={() => {
            isExportOpen = true
          }}><Download />{text('ExportPack')}</Button
        >
        {#if onClose !== undefined}<PanelClose {onClose} />{/if}
      </div>
    </div>
    <p class="packs-caption">{text('PacksHelp')}</p>
  </header>
  <ul class="packs-list">
    {#each gallery as entry (entry.pack.key)}
      {@const badge = stateBadge(entry.state)}
      <li class="pack-row" data-id={`studio-pack-${entry.pack.key}`}>
        <div class="flex items-start gap-3">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <span class="pack-name">{entry.pack.name}</span>
            <span class="packs-caption flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{entry.pack.industry} · {text('PackTypeCount', { count: entry.contents.typeNames.length })}</span>
              {#if badge !== undefined}<Badge variant="secondary">{badge}</Badge>{/if}
            </span>
          </div>
          {#if canInstall(entry.state)}
            <Button
              variant="outline"
              data-id={`studio-install-pack-${entry.pack.key}`}
              disabled={installingKey !== undefined}
              onclick={() => {
                void install(entry.pack)
              }}>{installingKey === entry.pack.key ? text('PackInstalling') : installLabel(entry.state)}</Button
            >
          {/if}
        </div>
        <p class="pack-description">{entry.pack.description}</p>
        {#if notices.has(entry.pack.key)}
          <p class="pack-notice" role="status">{notices.get(entry.pack.key)}</p>
        {/if}
      </li>
    {/each}
  </ul>
</div>

{#if isExportOpen}
  <ExportPackDialog
    {snapshot}
    {studio}
    onClose={() => {
      isExportOpen = false
    }}
  />
{/if}

<style>
  .packs {
    display: grid;
    align-content: start;
    max-width: 56rem;
    text-align: left;
  }
  .packs-head {
    display: grid;
    gap: 4px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .packs-caption {
    margin: 0;
    color: var(--theme-halfcontent-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .packs-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pack-row {
    display: grid;
    gap: 4px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .pack-name {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
  .pack-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .pack-notice {
    margin: 0;
    font-size: 12px;
  }
</style>
