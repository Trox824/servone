<script lang="ts">
  import { languageStore } from '@hcengineering/theme'
  import { eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { MonitorUp, MonitorX } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import MediaToggle from '../../../calls/components/MediaToggle.svelte'
  import { textOf } from '../../../calls/strings'
  import { lkSessionConnected, ScreenSharingState, screenSharingState } from '../../../liveKitClient'
  import { isShareWithSound, liveKitClient } from '../../../utils'
  import ShareSettingPopup from '../../ShareSettingPopup.svelte'

  // svelte-ignore export_let_unused
  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  const dispatch = createEventDispatcher()

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: isSharingLocally = $screenSharingState === ScreenSharingState.Local
  $: isControlDisabled = $screenSharingState === ScreenSharingState.Remote || !$lkSessionConnected

  async function applyShareRequest (shouldShare: boolean, withAudio: boolean): Promise<void> {
    await liveKitClient.setScreenShareEnabled(shouldShare, withAudio)
    dispatch('changeShare')
  }

  function toggleSharing (): void {
    const shouldShare = !isSharingLocally
    void applyShareRequest(shouldShare, shouldShare && $isShareWithSound)
  }

  function openShareOptions (event: MouseEvent): void {
    showPopup(ShareSettingPopup, {}, eventToHTMLElement(event))
  }
</script>

<MediaToggle
  icon={isSharingLocally ? MonitorX : MonitorUp}
  label={translate(isSharingLocally ? 'StopShare' : 'ShareScreen')}
  optionsLabel={translate('ShareOptions')}
  tone={isSharingLocally ? 'active' : 'neutral'}
  disabled={isControlDisabled}
  onToggle={toggleSharing}
  onOptions={openShareOptions}
/>
