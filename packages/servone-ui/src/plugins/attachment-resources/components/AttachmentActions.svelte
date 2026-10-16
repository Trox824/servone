<script lang="ts">
  import type { Attachment } from '@hcengineering/attachment'
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import { getResource } from '@hcengineering/platform'
  import presentation, { canPreviewFile, getFileUrl, previewTypes } from '@hcengineering/presentation'
  import { IconMoreH, Menu, showPopup, tooltip, type Action as UIAction } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import workbench from '@hcengineering/workbench'
  import AttachmentAction from './AttachmentAction.svelte'
  import FileDownload from './icons/FileDownload.svelte'
  import attachmentPlugin from '../plugin'
  import { isAttachment, openAttachmentInSidebar, showAttachmentPreviewPopup } from '../utils'
  import SaveToDriveIcon from '../../drive-resources/save-to-drive/SaveToDriveIcon.svelte'
  import SaveToDrivePopup from '../../drive-resources/save-to-drive/SaveToDrivePopup.svelte'
  import { saveToDriveStrings } from '../../drive-resources/save-to-drive/strings'

  export let attachment: WithLookup<Attachment> | BlobType
  export let isSaved: boolean = false
  export let removable: boolean = false
  export let hovered: boolean = false

  let canPreview: boolean = false
  let downloadAnchor: HTMLAnchorElement | undefined

  $: contentType = attachment?.type ?? ''
  $: void refreshPreviewability(contentType, $previewTypes)

  async function refreshPreviewability (type: string, types: typeof $previewTypes): Promise<void> {
    if (attachment === undefined) {
      canPreview = false
      return
    }
    canPreview = await canPreviewFile(type, types)
  }

  async function openPreview (event: Event): Promise<void> {
    if (!canPreview) return
    event.preventDefault()
    event.stopPropagation()
    const pointer = event as MouseEvent
    if (pointer.metaKey || pointer.ctrlKey) {
      window.open((event.target as HTMLAnchorElement).href, '_blank')
      return
    }
    showAttachmentPreviewPopup(attachment)
  }

  async function runResource (
    resource: typeof attachmentPlugin.actionImpl.DeleteAttachment,
    event: Event
  ): Promise<void> {
    const implementation = await getResource(resource)
    await implementation(attachment, event)
  }

  function openMoreMenu (event: MouseEvent): void {
    const entries = [
      {
        visible: canPreview,
        menuAction: { label: view.string.Open, icon: view.icon.Open, action: async (_: unknown, ev: Event) => { await openPreview(ev) } }
      },
      {
        visible: true,
        menuAction: {
          label: workbench.string.OpenInSidebar,
          icon: view.icon.DetailsFilled,
          action: async () => {
            await openAttachmentInSidebar(attachment)
          }
        }
      },
      {
        visible: isAttachment(attachment),
        menuAction: {
          label: isSaved
            ? attachmentPlugin.string.RemoveAttachmentFromSaved
            : attachmentPlugin.string.AddAttachmentToSaved,
          action: async (_: unknown, ev: Event) => {
            await runResource(
              isSaved
                ? attachmentPlugin.actionImpl.DeleteAttachmentFromSaved
                : attachmentPlugin.actionImpl.AddAttachmentToSaved,
              ev
            )
          }
        }
      },
      {
        visible: isAttachment(attachment),
        menuAction: {
          label: saveToDriveStrings.SaveToDrive,
          icon: SaveToDriveIcon,
          action: async () => {
            showPopup(SaveToDrivePopup, { attachment }, 'top')
          }
        }
      },
      {
        visible: isAttachment(attachment) && removable,
        menuAction: {
          label: attachmentPlugin.string.DeleteFile,
          action: async (_: unknown, ev: Event) => {
            await runResource(attachmentPlugin.actionImpl.DeleteAttachment, ev)
          }
        }
      }
    ]
    const actions: UIAction[] = entries.filter((entry) => entry.visible).map((entry) => entry.menuAction)

    hovered = true
    showPopup(Menu, { actions }, event.currentTarget as HTMLElement, () => {
      hovered = false
    })
  }
</script>

<div class="flex">
  {#if canPreview}
    <AttachmentAction
      label={view.string.Open}
      icon={view.icon.Open}
      size={'small'}
      dataId={'open-in-sidebar'}
      action={openPreview}
    />
  {/if}
  <a
    bind:this={downloadAnchor}
    href={getFileUrl(attachment.file, attachment.name)}
    download={attachment.name}
    use:tooltip={{ label: presentation.string.Download }}
    on:click={(event) => {
      event.stopPropagation()
    }}
  >
    <AttachmentAction
      label={presentation.string.Download}
      icon={FileDownload}
      size={'small'}
      dataId={'open-in-sidebar'}
      action={() => {
        downloadAnchor?.click()
      }}
    />
  </a>
  <AttachmentAction
    label={view.string.MoreActions}
    icon={IconMoreH}
    size={'small'}
    dataId={'open-in-sidebar'}
    action={openMoreMenu}
  />
</div>
