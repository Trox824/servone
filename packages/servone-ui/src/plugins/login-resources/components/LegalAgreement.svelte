<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import { rememberConsent, termsAccepted } from './termsConsent'

  const TERMS_URL = 'https://servone.app/terms'
  const PRIVACY_URL = 'https://servone.app/privacy'

  const AGREE = 'ui:string:ServoneLoginTermsAgree' as IntlString
  const TERMS = 'ui:string:ServoneLoginTerms' as IntlString
  const AND = 'ui:string:ServoneLoginTermsAnd' as IntlString
  const PRIVACY = 'ui:string:ServoneLoginPrivacy' as IntlString

  function setAccepted (isChecked: boolean): void {
    termsAccepted.set(isChecked)
    if (isChecked) rememberConsent()
  }
</script>

<div class="col-span-2 flex items-start gap-2 text-sm leading-5">
  <Checkbox id="login-terms" class="mt-0.5" checked={$termsAccepted} onCheckedChange={setAccepted} />
  <label for="login-terms" class="text-muted-foreground">
    <Label label={AGREE} />
    <a class="underline underline-offset-2 hover:text-foreground" href={TERMS_URL} target="_blank" rel="noopener noreferrer"
      ><Label label={TERMS} /></a
    >
    <Label label={AND} />
    <a class="underline underline-offset-2 hover:text-foreground" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer"
      ><Label label={PRIVACY} /></a
    >
  </label>
</div>
