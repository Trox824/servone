<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { getMetadata, type IntlString } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, getFileUrl } from '@hcengineering/presentation'
  import { Breadcrumb, Expandable, Header, Label, Loading, Scroller } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount } from 'svelte'
  import setting from '../plugin'
  import { type BackupInfo } from '../types'
  import {
    backupRestoreGuideLink,
    buildStoreZip,
    collectBackupFileNames,
    generateBackupScript,
    generateRestoreReadme
  } from '../utils/backup'
  import { Button } from '../../../lib/components/ui/button'
  import * as Empty from '../../../lib/components/ui/empty'

  const NO_BACKUPS = 'setting:string:ServoneNoBackups' as IntlString
  const NO_BACKUPS_HINT = 'setting:string:ServoneNoBackupsHint' as IntlString

  interface FileEntry {
    name: string
    size: number
  }

  interface ExtraBlobEntry extends FileEntry {
    contentType: string
  }

  interface BackupIndex {
    files?: FileEntry[]
    extraBlobs?: ExtraBlobEntry[]
    extraBlobsTotal?: number
    error?: string
    info?: BackupInfo
  }

  type CopyFeedbackGroup = 'script' | 'cardToken' | 'links' | 'bearer'

  const COPY_FEEDBACK_MS = 2500
  const OBJECT_URL_REVOKE_DELAY_MS = 30000
  const MAX_EXTRA_BLOBS_SHOWN = 100
  const BYTES_PER_KIB = 1024
  const BYTES_PER_MIB = 1024 * 1024
  const MS_PER_MINUTE = 60 * 1000
  const MS_PER_HOUR = 60 * MS_PER_MINUTE
  const MS_PER_DAY = 24 * MS_PER_HOUR
  const ROOT_FILE_NAMES = ['index.json', 'backup.json.gz', 'blob-info.json.gz']
  const EXAMPLE_BLOB_URL = getFileUrl('blob.uuid', 'filename.blob')

  const backupServiceUrl = getMetadata(setting.metadata.BackupUrl) ?? ''
  const bearerToken = getMetadata(presentation.metadata.Token) ?? ''
  const isWorkspaceOwner = hasAccountRole(getCurrentAccount(), AccountRole.Owner)
  const workspaceFolderId =
    getMetadata(presentation.metadata.WorkspaceDataId) ?? getMetadata(presentation.metadata.WorkspaceUuid) ?? ''
  const workspaceBase = `${backupServiceUrl}/${workspaceFolderId}`
  const authHeaders = { Authorization: `Bearer ${bearerToken}` }

  let isLoading = true
  let backupIndex: BackupIndex | undefined
  let isFullDownloadRunning = false
  let copiedByGroup: Record<CopyFeedbackGroup, boolean> = {
    script: false,
    cardToken: false,
    links: false,
    bearer: false
  }
  const copyResetTimers = new Map<CopyFeedbackGroup, ReturnType<typeof setTimeout>>()

  $: backupFiles = backupIndex?.files ?? []
  $: sizeByFileName = new Map(backupFiles.map((file) => [file.name, file.size ?? 0]))
  $: snapshotList = backupIndex?.info?.snapshots
  $: newestSnapshot = snapshotList?.[snapshotList.length - 1]
  $: totalBackupBytes = backupFiles.reduce((sum, file) => sum + (file.size ?? 0), 0)
  $: shownExtraBlobs = [...(backupIndex?.extraBlobs ?? [])]
    .sort((first, second) => second.size - first.size)
    .slice(0, MAX_EXTRA_BLOBS_SHOWN)
  $: extraBlobsTotal = backupIndex?.extraBlobsTotal ?? shownExtraBlobs.length

  onMount(async () => {
    try {
      if (isWorkspaceOwner && backupServiceUrl !== '') {
        const indexResponse = await fetch(`${workspaceBase}/index.json`, { headers: authHeaders })
        backupIndex = (await indexResponse.json()) as BackupIndex
      }
    } catch (error) {
      console.error(error)
    } finally {
      isLoading = false
    }
  })

  function formatSize (bytes: number): string {
    if (bytes < BYTES_PER_KIB) return `${bytes}b`
    if (bytes < BYTES_PER_MIB) return `${Math.round(bytes / BYTES_PER_KIB)}kb`
    return `${Math.round((bytes / BYTES_PER_MIB) * 100) / 100}Mb`
  }

  function formatAgo (timestamp: number): string {
    const elapsedMs = Date.now() - timestamp
    if (elapsedMs < MS_PER_HOUR) return `${Math.floor(elapsedMs / MS_PER_MINUTE)} minutes ago`
    if (elapsedMs < MS_PER_DAY) return `${Math.floor(elapsedMs / MS_PER_HOUR)} hours ago`
    return ''
  }

  function sizeOfFile (fileName: string): number {
    return sizeByFileName.get(fileName) ?? 0
  }

  function snapshotStorageBytes (domains: Record<string, { storage?: string[] }>): number {
    return Object.values(domains).reduce(
      (domainSum, domain) => domainSum + (domain.storage ?? []).reduce((sum, name) => sum + sizeOfFile(name), 0),
      0
    )
  }

  function saveBlobAs (blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob)
    const downloadLink = document.createElement('a')
    downloadLink.href = objectUrl
    downloadLink.download = fileName
    document.body.appendChild(downloadLink)
    downloadLink.click()
    downloadLink.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS)
  }

  async function downloadSingleFile (url: string, fileName: string): Promise<void> {
    try {
      const fileResponse = await fetch(url, { headers: authHeaders })
      if (!fileResponse.ok) {
        console.error(`Failed to download ${fileName}: ${fileResponse.status}`)
        return
      }
      saveBlobAs(await fileResponse.blob(), fileName)
    } catch (error) {
      console.error(error)
    }
  }

  function downloadBackupFile (fileName: string): void {
    void downloadSingleFile(`${workspaceBase}/${fileName}`, fileName)
  }

  function downloadExtraBlob (blobName: string): void {
    void downloadSingleFile(getFileUrl(blobName), blobName)
  }

  async function downloadEverything (): Promise<void> {
    if (isFullDownloadRunning) return
    isFullDownloadRunning = true
    try {
      const zipEntries: { name: string, data: Uint8Array }[] = []
      for (const fileName of collectBackupFileNames(backupIndex)) {
        const fileResponse = await fetch(`${workspaceBase}/${fileName}`, { headers: authHeaders })
        if (!fileResponse.ok) continue
        zipEntries.push({ name: fileName, data: new Uint8Array(await fileResponse.arrayBuffer()) })
      }
      const readmeText = generateRestoreReadme({ sourceWorkspace: workspaceFolderId, fileCount: zipEntries.length })
      zipEntries.push({ name: 'RESTORE.md', data: new TextEncoder().encode(readmeText) })
      const zipBlob = new Blob([buildStoreZip(zipEntries)], { type: 'application/zip' })
      const dateStamp = new Date().toISOString().slice(0, 10)
      saveBlobAs(zipBlob, `huly-backup-${workspaceFolderId}-${dateStamp}.zip`)
    } catch (error) {
      console.error(error)
    } finally {
      isFullDownloadRunning = false
    }
  }

  async function copyWithFeedback (text: string, group: CopyFeedbackGroup): Promise<void> {
    await copyTextToClipboard(text)
    copiedByGroup = { ...copiedByGroup, [group]: true }
    clearTimeout(copyResetTimers.get(group))
    copyResetTimers.set(
      group,
      setTimeout(() => {
        copiedByGroup = { ...copiedByGroup, [group]: false }
      }, COPY_FEEDBACK_MS)
    )
  }

  function copyScript (): void {
    const allFileNames = collectBackupFileNames(backupIndex)
    const scriptText = generateBackupScript({
      baseUrl: workspaceBase,
      files: allFileNames,
      outDir: `huly-backup-${workspaceFolderId}`,
      restoreReadme: generateRestoreReadme({ sourceWorkspace: workspaceFolderId, fileCount: allFileNames.length })
    })
    void copyWithFeedback(scriptText, 'script')
  }

  function openRestoreGuide (): void {
    window.open(backupRestoreGuideLink, '_blank', 'noopener,noreferrer')
  }
</script>

{#snippet backupFileRow (fileName, sizeLabel)}
  <div class="flex items-center justify-between rounded bg-muted/50 p-1 hover:bg-muted">
    <span>{fileName}</span>
    <div class="flex items-center gap-4">
      {#if sizeLabel !== undefined}
        <span class="text-sm text-muted-foreground">{sizeLabel}</span>
      {/if}
      <Button variant="outline" size="sm" onclick={() => downloadBackupFile(fileName)}>
        <Label label={setting.string.BackupFileDownload} />
      </Button>
    </div>
  </div>
{/snippet}

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.Setting} label={setting.string.Backup} size={'large'} isCurrent />
  </Header>
  <Scroller noStretch>
    <div class="mx-auto w-full max-w-2xl p-6">
      {#if isLoading}
        <Loading />
      {:else if backupIndex === undefined}
        <Empty.Empty class="border">
          <Empty.Header>
            <Empty.Title><Label label={NO_BACKUPS} /></Empty.Title>
          </Empty.Header>
          <Empty.Content>
            <p class="text-sm text-muted-foreground">
              <Label label={NO_BACKUPS_HINT} />
            </p>
          </Empty.Content>
        </Empty.Empty>
      {:else}
        <div class="flex flex-wrap items-center gap-4 p-2">
          <span>
            <Label label={setting.string.BackupLast} />: {newestSnapshot !== undefined ? formatAgo(newestSnapshot.date) : ''}
          </span>
          <span>
            <Label label={setting.string.BackupTotalSnapshots} />: {snapshotList !== undefined ? snapshotList.length : ''}
          </span>
          <span><Label label={setting.string.BackupTotalFiles} />: {backupFiles.length}</span>
          <span><Label label={setting.string.BackupSize} />: {formatSize(totalBackupBytes)}</span>
        </div>

        <div class="mt-2 mb-4 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div>
              <div class="font-medium text-foreground"><Label label={setting.string.BackupDownloadAll} /></div>
              <div class="mt-0.5 text-sm text-muted-foreground"><Label label={setting.string.BackupDownloadAllInfo} /></div>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button size="sm" disabled={isFullDownloadRunning} onclick={() => void downloadEverything()}>
                <Label
                  label={isFullDownloadRunning ? setting.string.BackupPreparingDownload : setting.string.BackupDownloadAll}
                />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div>
              <div class="font-medium text-foreground"><Label label={setting.string.BackupCopyScript} /></div>
              <div class="mt-0.5 text-sm text-muted-foreground"><Label label={setting.string.BackupScriptInfo} /></div>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onclick={copyScript}>
                <Label label={copiedByGroup.script ? view.string.Copied : setting.string.BackupCopyScript} />
              </Button>
              <Button variant="outline" size="sm" onclick={() => void copyWithFeedback(bearerToken, 'cardToken')}>
                <Label label={copiedByGroup.cardToken ? view.string.Copied : setting.string.BackupCopyToken} />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div>
              <div class="font-medium text-foreground"><Label label={setting.string.BackupRestoreGuide} /></div>
              <div class="mt-0.5 text-sm text-muted-foreground"><Label label={setting.string.BackupRestoreGuideInfo} /></div>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onclick={openRestoreGuide}>
                <Label label={setting.string.BackupRestoreGuide} />
              </Button>
            </div>
          </div>
        </div>

        <Expandable bordered expanded={false}>
          <svelte:fragment slot="title">
            <div class="flex items-center p-1">
              <Label label={setting.string.BackupSnapshots} />: {snapshotList?.length ?? 0}
            </div>
          </svelte:fragment>
          <div class="p-1">
            {#each ROOT_FILE_NAMES as rootFileName (rootFileName)}
              {@render backupFileRow(
                rootFileName,
                formatSize(rootFileName === 'index.json' ? JSON.stringify(backupIndex).length : sizeOfFile(rootFileName))
              )}
            {/each}

            {#if snapshotList !== undefined}
              {#each [...snapshotList].reverse() as snapshot, reversedPosition (snapshot.date)}
                {@const snapshotNumber = snapshotList.length - reversedPosition}
                {@const snapshotDomains = Object.entries(snapshot.domains)}
                <Expandable
                  bordered
                  expandable={snapshotDomains.length > 0}
                  showChevron={snapshotDomains.length > 0}
                >
                  <svelte:fragment slot="title">
                    <div class="flex items-center gap-2 p-1">
                      <span>#{snapshotNumber}</span>
                      <span>{new Date(snapshot.date).toLocaleString()}</span>
                      <span>{formatAgo(snapshot.date)}</span>
                      <span>-</span>
                      <span>{formatSize(snapshotStorageBytes(snapshot.domains))}</span>
                    </div>
                  </svelte:fragment>
                  <div class="p-1">
                    {#each snapshotDomains as [domainName, domainData] (domainName)}
                      {#if (domainData.storage ?? []).length > 0}
                        <div class="py-2">
                          <div class="font-medium text-muted-foreground">{domainName}</div>
                          <div class="flex flex-col gap-px">
                            {#each domainData.storage ?? [] as storageFile (storageFile)}
                              {@render backupFileRow(storageFile, formatSize(sizeOfFile(storageFile)))}
                            {/each}
                            {#each domainData.snapshots ?? [] as snapshotFile (snapshotFile)}
                              {@render backupFileRow(snapshotFile, formatSize(sizeOfFile(snapshotFile)))}
                            {/each}
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </Expandable>
              {/each}
            {:else}
              <div class="p-1"><Label label={setting.string.BackupNoBackup} /></div>
            {/if}

            {#if backupIndex.error !== undefined}
              <div class="rounded bg-destructive/10 p-4 text-destructive">{backupIndex.error}</div>
            {/if}
          </div>
        </Expandable>

        <Expandable bordered expanded>
          <svelte:fragment slot="title">
            <div class="flex items-center p-1"><Label label={setting.string.BackupFiles} /></div>
          </svelte:fragment>
          <div class="p-1">
            {@render backupFileRow('index.json', undefined)}
            {@render backupFileRow('index.html', undefined)}

            {#each [`${workspaceBase}/index.html`, EXAMPLE_BLOB_URL] as linkUrl (linkUrl)}
              <div class="mt-2 flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <Label label={setting.string.BackupLinkInfo} />
                  <div class="border-b border-border p-3 select-text">{linkUrl}</div>
                </div>
                <Button variant="outline" size="sm" onclick={() => void copyWithFeedback(linkUrl, 'links')}>
                  <Label label={copiedByGroup.links ? view.string.Copied : view.string.CopyToClipboard} />
                </Button>
              </div>
            {/each}

            <div class="mt-2 flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1"><Label label={setting.string.BackupBearerTokenInfo} /></div>
              <Button variant="outline" size="sm" onclick={() => void copyWithFeedback(bearerToken, 'bearer')}>
                <Label label={copiedByGroup.bearer ? view.string.Copied : view.string.CopyToClipboard} />
              </Button>
            </div>
          </div>
        </Expandable>

        <Expandable bordered expanded={false}>
          <svelte:fragment slot="title">
            <div class="flex items-center gap-2 p-1">
              <Label label={setting.string.NonBackupedBlobs} />
              <span>{shownExtraBlobs.length}/{extraBlobsTotal}</span>
            </div>
          </svelte:fragment>
          <div class="p-1">
            {#each shownExtraBlobs as extraBlob (extraBlob.name)}
              <div class="flex items-center justify-between rounded bg-muted/50 p-1 hover:bg-muted">
                <span class="min-w-0 truncate select-text">{extraBlob.name}</span>
                <div class="flex items-center gap-4">
                  <span class="text-sm text-muted-foreground">{formatSize(extraBlob.size)}</span>
                  <span class="text-sm text-muted-foreground">{extraBlob.contentType}</span>
                  <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" onclick={() => downloadExtraBlob(extraBlob.name)}>
                      <Label label={setting.string.BackupFileDownload} />
                    </Button>
                    <Button variant="outline" size="sm" onclick={() => void copyWithFeedback(extraBlob.name, 'bearer')}>
                      <Label label={copiedByGroup.bearer ? view.string.Copied : view.string.CopyToClipboard} />
                    </Button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </Expandable>
      {/if}
    </div>
  </Scroller>
</div>
