<script lang="ts">
  import love from '../../../plugin'
  import { state, toggleMicState } from '@hcengineering/media-resources'
  import { eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getClient } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/theme'
  import { Mic, MicOff } from '@lucide/svelte'
  import MicSettingPopup from '../MicSettingPopup.svelte'
  import MediaToggle from '../../../calls/components/MediaToggle.svelte'
  import { textOf } from '../../../calls/strings'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  const toggleShortcut: string[] | undefined = getClient()
    .getModel()
    .findAllSync(view.class.Action, { _id: love.action.ToggleMic })[0]?.keyBinding

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: isMicOn = $state?.microphone?.enabled === true

  function openMicMenu (event: MouseEvent): void {
    showPopup(MicSettingPopup, {}, eventToHTMLElement(event))
  }
</script>

<MediaToggle
  icon={isMicOn ? Mic : MicOff}
  label={isMicOn ? translate('MicOff') : translate('MicOn')}
  optionsLabel={translate('MicOptions')}
  tone={isMicOn ? 'neutral' : 'danger'}
  keys={toggleShortcut}
  onToggle={toggleMicState}
  onOptions={openMicMenu}
/>
