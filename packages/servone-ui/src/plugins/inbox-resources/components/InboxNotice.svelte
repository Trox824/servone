<!--
  Right pane for a system notice about a space (an export landing in the Export drive). The space's own
  panel is a folder browser that drops the notice text; this shows what happened and the next step.
-->
<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import type { CommonInboxNotification } from '@hcengineering/notification'
  import { getResource, translateCB, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { themeStore } from '@hcengineering/theme'
  import { Icon, Label, TimeSince, navigate } from '@hcengineering/ui'
  import type { ViewAction } from '@hcengineering/view'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { Download, FileArchive, FolderOpen } from '@lucide/svelte'

  import { Button } from '../../../lib/components/ui/button'
  import { parseExportArchive } from '../notice'

  export let doc: Doc
  export let notice: CommonInboxNotification

  const DRIVE_FILE = 'drive:class:File' as Ref<Class<Doc & { title: string, file: Ref<Doc> }>>
  const DRIVE_FILE_VERSION = 'drive:class:FileVersion' as Ref<Class<Doc>>
  const DOWNLOAD_FILE = 'drive:actionImpl:DownloadFile' as ViewAction
  const DOWNLOAD = 'notification:string:ServoneNoticeDownload' as IntlString
  const OPEN_IN = 'notification:string:ServoneNoticeOpenIn' as IntlString
  const FILE_GONE = 'notification:string:ServoneNoticeFileGone' as IntlString
  const EXPORT_NAME = 'notification:string:ServoneExportFileName' as IntlString

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: lang = $themeStore.language
  $: appLabel = hierarchy.getClass(doc._class).label
  $: spaceName = 'name' in doc && typeof doc.name === 'string' ? doc.name : ''
  $: fileName = typeof notice.props?.fileName === 'string' ? notice.props.fileName : undefined
  $: archive = fileName !== undefined ? parseExportArchive(fileName) : undefined

  let message = ''
  let appName = ''
  let exportedWhat = ''
  $: if (notice.message !== undefined) translateCB(notice.message, notice.props ?? {}, lang, (text) => { message = text })
  $: translateCB(appLabel, {}, lang, (text) => { appName = text })
  $: if (archive !== undefined) translateCB(archive.classLabel, {}, lang, (text) => { exportedWhat = text })
  $: fileDate = archive !== undefined
    ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(archive.createdOn)
    : ''

  let file: (Doc & { title: string, file: Ref<Doc> }) | undefined
  let isFileMissing = false
  $: void findFile(doc, fileName)
  async function findFile (space: Doc, title: string | undefined): Promise<void> {
    file = undefined
    isFileMissing = false
    if (title === undefined) return
    file = await client.findOne(DRIVE_FILE, { space: space._id, title }, { lookup: { file: DRIVE_FILE_VERSION } })
    isFileMissing = file === undefined
  }

  async function download (): Promise<void> {
    if (file === undefined) return
    const downloadFile = await getResource(DOWNLOAD_FILE)
    await downloadFile(file)
  }

  async function openSource (): Promise<void> {
    navigate(await getObjectLinkFragment(hierarchy, doc))
  }
</script>

<div class="notice">
  <div class="notice__bar">
    <span class="notice__crumb">{appName}</span>
    {#if spaceName !== ''}
      <span class="notice__crumb-sep" aria-hidden="true">/</span>
      <span class="notice__crumb notice__crumb--current">{spaceName}</span>
    {/if}
  </div>

  <div class="notice__body">
    <div class="notice__event">
      <span class="notice__icon">
        {#if notice.icon !== undefined}
          <Icon icon={notice.icon} size="medium" iconProps={notice.iconProps} />
        {:else}
          <FolderOpen size={16} strokeWidth={1.75} />
        {/if}
      </span>
      <div class="notice__text">
        <p class="notice__message">{message}</p>
        <p class="notice__time"><TimeSince value={notice.createdOn ?? notice.modifiedOn} /></p>
      </div>
    </div>

    {#if fileName !== undefined}
      <div class="notice__file">
        <FileArchive size={16} strokeWidth={1.75} class="notice__file-icon" />
        <div class="notice__file-text">
          <span class="notice__file-name" title={fileName}>
            {#if archive !== undefined && exportedWhat !== ''}
              <Label label={EXPORT_NAME} params={{ what: exportedWhat, format: archive.format }} />
            {:else}
              {fileName}
            {/if}
          </span>
          {#if isFileMissing}
            <span class="notice__file-meta"><Label label={FILE_GONE} /></span>
          {:else if fileDate !== ''}
            <span class="notice__file-meta">{fileDate}</span>
          {/if}
        </div>
      </div>
    {/if}

    <div class="notice__actions">
      {#if file !== undefined}
        <Button size="sm" onclick={() => { void download() }}>
          <Download /><Label label={DOWNLOAD} />
        </Button>
      {/if}
      <Button size="sm" variant="outline" onclick={() => { void openSource() }}>
        <FolderOpen /><Label label={OPEN_IN} params={{ app: appName }} />
      </Button>
    </div>
  </div>
</div>

<style lang="scss">
  .notice {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;

    &__bar {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      flex-shrink: 0;
      height: 3rem;
      padding: 0 1.5rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }
    &__crumb {
      color: var(--muted-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &__crumb--current {
      color: var(--foreground);
      font-weight: 600;
    }
    &__crumb-sep {
      color: var(--muted-foreground);
    }

    &__body {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: 100%;
      max-width: 40rem;
      padding: 2rem 1.5rem;
    }

    &__event {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    &__icon {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 0.5rem;
      background-color: var(--muted);
      color: var(--muted-foreground);
    }
    &__text {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      padding-top: 0.25rem;
    }
    &__message {
      margin: 0;
      color: var(--foreground);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.45;
      text-wrap: pretty;
    }
    &__time {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }

    &__file {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      :global(.notice__file-icon) {
        flex-shrink: 0;
        color: var(--muted-foreground);
      }
    }
    &__file-text {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }
    &__file-name {
      overflow: hidden;
      color: var(--foreground);
      font-size: 0.8125rem;
      font-weight: 500;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    &__file-meta {
      color: var(--muted-foreground);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  }
</style>
