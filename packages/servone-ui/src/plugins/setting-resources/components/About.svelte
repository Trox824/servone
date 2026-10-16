<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Breadcrumb, Header, IconInfo, Label, Scroller } from '@hcengineering/ui'

  const SOURCE_REPO_URL = 'https://github.com/hcengineering/platform'
  const EPL_URL = 'https://www.eclipse.org/legal/epl-2.0/'
  const NOTICES_URL = 'https://www.servone.app/ma-nguon'

  const TITLE = 'setting:string:ServoneAboutTitle' as IntlString
  const HULY_NOTICE = 'setting:string:ServoneAboutHulyNotice' as IntlString
  const OWN_CODE_NOTICE = 'setting:string:ServoneAboutOwnCode' as IntlString

  const links = [
    { href: SOURCE_REPO_URL, label: 'setting:string:ServoneAboutSourceLink' as IntlString },
    { href: EPL_URL, label: 'setting:string:ServoneAboutLicenseLink' as IntlString },
    { href: NOTICES_URL, label: 'setting:string:ServoneAboutThirdPartyLink' as IntlString }
  ]
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={IconInfo} label={TITLE} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6 text-sm text-foreground">
      <p><Label label={HULY_NOTICE} /></p>
      <p class="text-muted-foreground"><Label label={OWN_CODE_NOTICE} /></p>
      <ul class="flex flex-col gap-2 border-t border-border pt-4">
        {#each links as link (link.href)}
          <li>
            <a class="underline underline-offset-2" href={link.href} target="_blank" rel="noopener noreferrer">
              <Label label={link.label} />
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </Scroller>
</div>
