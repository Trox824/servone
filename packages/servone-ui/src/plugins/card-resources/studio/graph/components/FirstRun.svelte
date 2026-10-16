<script lang="ts">
  import { BUNDLED_PACKS, type Pack } from '@servone/config'
  import { ArrowRight, LayoutTemplate, Sparkles } from '@lucide/svelte'
  import { Button } from '../../../../../lib/components/ui/button'
  import { Textarea } from '../../../../../lib/components/ui/textarea'
  import type { StudioContext } from '../../extensions'
  import { text } from '../../strings'
  import { refusalsOf } from '../outcome'

  export let studio: StudioContext
  export let onAskAssistant: (story: string) => void
  export let onBlank: () => void

  let story = ''
  let installingKey: string | undefined
  let refusals: string[] = []

  async function install (pack: Pack): Promise<void> {
    if (installingKey !== undefined) return
    installingKey = pack.key
    try {
      refusals = refusalsOf(await studio.save(pack.operations))
    } finally {
      installingKey = undefined
    }
  }
</script>

<div class="graph-first-run" data-id="graph-first-run">
  <div class="grid gap-1.5">
    <h2 class="m-0 text-xl font-semibold">{text('FirstRunTitle')}</h2>
    <p class="graph-first-lead m-0 text-sm text-muted-foreground">{text('FirstRunLead')}</p>
  </div>
  <div class="graph-first-starts">
    <section class="graph-first-card">
      <label class="grid gap-2">
        <span class="flex items-center gap-2 text-sm font-semibold"><Sparkles size={18} class="graph-first-icon" />{text('FirstRunTell')}</span>
        <Textarea data-id="graph-first-run-story" rows={4} bind:value={story} placeholder={text('FirstRunExample')} />
      </label>
      <div class="flex items-center gap-2">
        <span class="mr-auto text-xs text-muted-foreground">{text('FirstRunHint')}</span>
        <Button
          data-id="graph-first-run-draw"
          disabled={story.trim() === ''}
          onclick={() => {
            onAskAssistant(story.trim())
          }}><ArrowRight size={16} />{text('FirstRunDraw')}</Button
        >
      </div>
    </section>
    <ul class="graph-templates">
      {#each BUNDLED_PACKS as pack (pack.key)}
        <li>
          <button
            type="button"
            class="graph-template"
            data-id={`graph-template-${pack.key}`}
            disabled={installingKey !== undefined}
            onclick={() => {
              void install(pack)
            }}
          >
            <span class="flex items-center gap-2 text-sm font-medium"><LayoutTemplate size={16} class="graph-first-icon" />{pack.name}</span>
            <span class="graph-template-note">{pack.description}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
  {#if refusals.length > 0}
    <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-refusal">
      {#each refusals as reason (reason)}<li>{reason}</li>{/each}
    </ul>
  {/if}
  <p class="m-0 text-sm text-muted-foreground">
    {text('FirstRunOr')}
    <button type="button" class="graph-blank" data-id="graph-first-run-blank" onclick={onBlank}>{text('FirstRunBlank')}</button>
  </p>
</div>

<style>
  /* Mockup screen 5: left-aligned column, assistant card beside a two-column template grid. */
  .graph-first-run {
    display: grid;
    align-content: start;
    gap: 18px;
    max-width: 880px;
    padding: 40px 32px;
    text-align: left;
  }
  .graph-first-lead {
    max-width: 60ch;
    line-height: 1.5;
  }
  .graph-first-starts {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }
  .graph-first-card {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--theme-button-border);
    border-radius: 12px;
    background: var(--theme-popup-color);
    box-shadow: var(--theme-popup-shadow);
  }
  .graph-first-run :global(.graph-first-icon) {
    flex-shrink: 0;
    color: var(--primary-button-default);
  }
  .graph-templates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .graph-template {
    display: grid;
    justify-items: start;
    align-content: start;
    gap: 3px;
    width: 100%;
    height: 100%;
    padding: 10px 12px;
    border: 1px solid var(--theme-button-border);
    border-radius: 10px;
    background: var(--theme-popup-color);
    color: var(--theme-caption-color);
    text-align: left;
  }
  .graph-template:hover:not(:disabled) {
    border-color: var(--primary-button-default);
  }
  .graph-template:disabled {
    opacity: 0.6;
  }
  /* Pack descriptions run to several sentences; the tile shows the first two lines. */
  .graph-template-note {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--theme-halfcontent-color);
    font-size: 12px;
    line-height: 1.35;
  }
  .graph-blank {
    color: var(--theme-link-color);
    font-weight: 500;
  }
  @media (max-width: 760px) {
    .graph-first-starts {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
