<script lang="ts">
  import { eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { RoomType } from '@hcengineering/love'
  import { state, toggleCamState } from '@hcengineering/media-resources'
  import view from '@hcengineering/view'
  import { getClient } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/theme'
  import { Video, VideoOff } from '@lucide/svelte'
  import CamSettingPopup from '../CamSettingPopup.svelte'
  import { currentRoom } from '../../../stores'
  import love from '../../../plugin'
  import MediaToggle from '../../../calls/components/MediaToggle.svelte'
  import { textOf } from '../../../calls/strings'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  const toggleShortcut: string[] | undefined = getClient()
    .getModel()
    .findAllSync(view.class.Action, { _id: love.action.ToggleVideo })[0]?.keyBinding

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: isCameraOn = $state?.camera?.enabled === true

  function openCameraMenu (event: MouseEvent): void {
    showPopup(CamSettingPopup, {}, eventToHTMLElement(event))
  }
</script>

{#if $currentRoom?.type === RoomType.Video}
  <MediaToggle
    icon={isCameraOn ? Video : VideoOff}
    label={isCameraOn ? translate('CameraOff') : translate('CameraOn')}
    optionsLabel={translate('CameraOptions')}
    tone={isCameraOn ? 'neutral' : 'danger'}
    keys={toggleShortcut}
    onToggle={toggleCamState}
    onOptions={openCameraMenu}
  />
{/if}
