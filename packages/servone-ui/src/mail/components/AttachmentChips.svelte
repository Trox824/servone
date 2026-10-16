<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import type { Ref } from '@hcengineering/core'
  import { createQuery, FilePreviewPopup, getFileUrl, getPreviewAlignment } from '@hcengineering/presentation'
  import { showPopup } from '@hcengineering/ui'
  import { Paperclip } from '@lucide/svelte'
  import type { MailMessageCard } from '@servone/mail'

  export let messageId: Ref<MailMessageCard>

  const DOWNLOAD_ONLY_EXTENSIONS = new Set([
    'html', 'htm', 'svg', 'js', 'exe', 'bat', 'cmd', 'sh', 'msi', 'apk', 'dmg', 'jar', 'vbs', 'scr'
  ])
  const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

  let files: Attachment[] = []
  createQuery().query(attachment.class.Attachment, { attachedTo: messageId }, (found) => {
    files = [...found]
  })

  function extensionOf (name: string): string {
    const dot = name.lastIndexOf('.')
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
  }

  function isDownloadOnly (file: Attachment): boolean {
    return DOWNLOAD_ONLY_EXTENSIONS.has(extensionOf(file.name))
  }

  function formatSize (bytes: number): string {
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
      value /= 1024
      unitIndex++
    }
    return unitIndex === 0 ? `${value} ${SIZE_UNITS[unitIndex]}` : `${value.toFixed(1)} ${SIZE_UNITS[unitIndex]}`
  }

  function preview (file: Attachment): void {
    showPopup(
      FilePreviewPopup,
      { file: file.file, name: file.name, contentType: file.type, metadata: file.metadata },
      getPreviewAlignment(file.type)
    )
  }
</script>

{#if files.length > 0}
  <ul class="attachment-chips">
    {#each files as file (file._id)}
      <li>
        {#if isDownloadOnly(file)}
          <a class="attachment-chip" href={getFileUrl(file.file, file.name)} download={file.name}>
            <Paperclip size={14} />
            <span class="attachment-chip__name">{file.name}</span>
            <span class="attachment-chip__size">{formatSize(file.size)}</span>
          </a>
        {:else}
          <button type="button" class="attachment-chip" onclick={() => { preview(file) }}>
            <Paperclip size={14} />
            <span class="attachment-chip__name">{file.name}</span>
            <span class="attachment-chip__size">{formatSize(file.size)}</span>
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .attachment-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }
  .attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
    font-size: 13px;
  }
  .attachment-chip:hover {
    background: var(--theme-button-hovered);
  }
  .attachment-chip__name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachment-chip__size {
    color: var(--theme-halfcontent-color);
  }
</style>
