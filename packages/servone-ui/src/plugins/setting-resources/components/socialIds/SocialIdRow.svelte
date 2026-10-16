<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import contact, {
    type SocialIdentity,
    type SocialIdentityProvider,
    type SocialIdentityRef
  } from '@hcengineering/contact'
  import { SocialIdentityPresenter } from '@hcengineering/contact-resources'
  import {
    getCurrentAccount,
    loginSocialTypes,
    pickPrimarySocialId,
    setCurrentAccount,
    type SocialId
  } from '@hcengineering/core'
  import { setPlatformStatus, unknownError } from '@hcengineering/platform'
  import { getClient, MessageBox } from '@hcengineering/presentation'
  import { Label, showPopup } from '@hcengineering/ui'
  import { Analytics } from '@hcengineering/analytics'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import setting from '../../plugin'
  import { getAccountClient } from '../../utils'

  export let socialId: SocialId
  export let socialIdProvider: SocialIdentityProvider
  export let canRelease: boolean = false
  export let socialIdRating: number | undefined = undefined
  export let socialIdRatingTotal: number | undefined = undefined

  const dispatch = createEventDispatcher()

  let currentAccount = getCurrentAccount()

  $: identityValue = socialId as SocialIdentity
  $: isLoginIdentity = loginSocialTypes.includes(socialId.type)
  $: isPrimaryIdentity = socialId._id === currentAccount.primarySocialId
  $: ratingPercent =
    socialIdRating != null && socialIdRatingTotal != null && socialIdRatingTotal > 0
      ? Math.round((socialIdRating / socialIdRatingTotal) * 100)
      : undefined

  async function releaseIdentity (): Promise<boolean> {
    try {
      const freshAccount = getCurrentAccount()
      const releasedIdentity = await getAccountClient().releaseSocialId(
        undefined,
        socialId.type,
        socialId.value,
        true
      )
      await getClient().updateDoc(
        contact.class.SocialIdentity,
        contact.space.Contacts,
        releasedIdentity._id as SocialIdentityRef,
        { key: releasedIdentity.key, value: releasedIdentity.value, isDeleted: releasedIdentity.isDeleted }
      )
      const updatedIdentities = freshAccount.fullSocialIds.map((existing) =>
        existing._id === releasedIdentity._id ? releasedIdentity : existing
      )
      const updatedAccount = {
        ...freshAccount,
        fullSocialIds: updatedIdentities,
        primarySocialId: pickPrimarySocialId(updatedIdentities)._id
      }
      setCurrentAccount(updatedAccount)
      currentAccount = updatedAccount
      dispatch('released')
      return true
    } catch (err) {
      Analytics.handleError(err)
      setPlatformStatus(unknownError(err))
      return false
    }
  }

  async function releaseAndReload (): Promise<void> {
    if (!(await releaseIdentity())) return
    console.log('reload due to primary social id release')
    location.reload()
  }

  async function confirmedRelease (): Promise<void> {
    if (!isPrimaryIdentity) {
      await releaseIdentity()
      return
    }
    showPopup(MessageBox, {
      label: setting.string.ReleasePrimarySocialId,
      message: setting.string.ReleasePrimarySocialIdConfirm,
      dangerous: true,
      action: releaseAndReload
    })
  }

  function askRelease (): void {
    showPopup(MessageBox, {
      label: setting.string.ReleaseSocialId,
      message: setting.string.ReleaseSocialIdConfirm,
      params: { socialId: socialId.displayValue ?? socialId.value },
      dangerous: true,
      action: confirmedRelease
    })
  }
</script>

<div
  class="group flex-row-center flex-gap-2 p-4 hover:bg-[var(--global-ui-highlight-BackgroundColor)]"
>
  <SocialIdentityPresenter value={identityValue} {socialIdProvider} />
  {#if ratingPercent !== undefined}
    <span class="hidden group-hover:inline">{ratingPercent}%</span>
  {/if}
  <div class="flex-grow"></div>
  {#if isLoginIdentity}
    <Badge variant="success" class="ml-2"><Label label={setting.string.Login} /></Badge>
  {/if}
  {#if isPrimaryIdentity}
    <Badge variant="info" class="ml-2"><Label label={setting.string.Primary} /></Badge>
  {/if}
  {#if canRelease}
    <Button variant="destructive" size="xs" class="ml-1" onclick={askRelease}>
      <Label label={setting.string.Release} />
    </Button>
  {/if}
</div>
