<script lang="ts">
  import { SocialIdType } from '@hcengineering/core'
  import type { LoginInfo } from '@hcengineering/login'
  import { OK, Severity, Status, type IntlString } from '@hcengineering/platform'
  import { Label, getCurrentLocation, navigate } from '@hcengineering/ui'
  import { workbenchId } from '@hcengineering/workbench'
  import { onMount } from 'svelte'
  import { rememberPendingSetup } from '../../../onboarding/bring-team/pending-setup'
  import { suggestWorkspaceName } from '../../../onboarding/bring-team/workspace-name'
  import type { TeamFocus } from '../../../onboarding/team-focus'
  import login from '../plugin'
  import type { Field } from '../types'
  import { createWorkspace, getAccount, getAccountClient, getAccountDisplayName, getRegionInfo, goTo, setLoginInfo } from '../utils'
  import Form from './Form.svelte'

  interface FocusOption {
    focus: TeamFocus
    title: IntlString
    hint: IntlString
  }

  interface ContentOption {
    hasSampleContent: boolean
    title: IntlString
    hint: IntlString
  }

  const focusOptions: FocusOption[] = [
    {
      focus: 'projects',
      title: 'ui:string:ServoneSetupFocusProjects' as IntlString,
      hint: 'ui:string:ServoneSetupFocusProjectsHint' as IntlString
    },
    {
      focus: 'operations',
      title: 'ui:string:ServoneSetupFocusOperations' as IntlString,
      hint: 'ui:string:ServoneSetupFocusOperationsHint' as IntlString
    },
    {
      focus: 'both',
      title: 'ui:string:ServoneSetupFocusBoth' as IntlString,
      hint: 'ui:string:ServoneSetupFocusBothHint' as IntlString
    }
  ]
  const contentOptions: ContentOption[] = [
    {
      hasSampleContent: true,
      title: 'ui:string:ServoneSetupContentSample' as IntlString,
      hint: 'ui:string:ServoneSetupContentSampleHint' as IntlString
    },
    {
      hasSampleContent: false,
      title: 'ui:string:ServoneSetupContentEmpty' as IntlString,
      hint: 'ui:string:ServoneSetupContentEmptyHint' as IntlString
    }
  ]
  const fields: Field[] = [
    {
      id: 'organization',
      name: 'workspace',
      i18n: 'ui:string:ServoneSetupWorkspaceName' as IntlString,
      rules: []
    }
  ]

  let object = { workspace: '' }
  let teamFocus: TeamFocus = 'both'
  let hasSampleContent = true
  let status: Status = OK
  let loginInfo: LoginInfo | null | undefined

  async function prefillWorkspaceName (): Promise<void> {
    const socialIds = await getAccountClient().getSocialIds()
    const email = socialIds.find((socialId) => socialId.type === SocialIdType.EMAIL)?.value
    if (email !== undefined && object.workspace === '') object = { workspace: suggestWorkspaceName(email) }
  }

  onMount(async () => {
    loginInfo = await getAccount()
    if (loginInfo?.token == null) {
      const loc = getCurrentLocation()
      loc.path[1] = 'confirmationSend'
      loc.path.length = 2
      navigate(loc)
      return
    }
    await prefillWorkspaceName()
  })

  const action = {
    i18n: login.string.CreateWorkspace,
    func: async () => {
      status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
      const region = (await getRegionInfo())?.[0]?.region ?? ''
      const [createStatus, workspaceLogin] = await createWorkspace(object.workspace, region)
      status = createStatus
      if (workspaceLogin === null) return
      setLoginInfo(workspaceLogin)
      rememberPendingSetup(workspaceLogin.workspaceUrl, { focus: teamFocus, hasSampleContent })
      navigate({ path: [workbenchId, workspaceLogin.workspaceUrl] })
    }
  }
  const label_ServoneSetupNameTitle = 'ui:string:ServoneSetupNameTitle' as IntlString
  const label_ServoneSetupFocusQuestion = 'ui:string:ServoneSetupFocusQuestion' as IntlString
  const label_ServoneSetupContentQuestion = 'ui:string:ServoneSetupContentQuestion' as IntlString
</script>

<Form
  caption={label_ServoneSetupNameTitle}
  {status}
  {fields}
  {object}
  {action}
  subtitle={getAccountDisplayName(loginInfo)}
  bottomActions={[
    {
      caption: login.string.HaveWorkspace,
      i18n: login.string.SelectWorkspace,
      page: 'selectWorkspace',
      func: () => {
        goTo('selectWorkspace')
      }
    }
  ]}
>
  <svelte:fragment slot="extra-fields">
    <fieldset class="col-span-2 m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend class="mb-2 p-0 text-sm font-medium">
        <Label label={label_ServoneSetupFocusQuestion} />
      </legend>
      {#each focusOptions as option (option.focus)}
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary"
        >
          <input type="radio" name="team-focus" class="mt-1 accent-primary" value={option.focus} bind:group={teamFocus} />
          <span class="flex flex-col gap-0.5">
            <span class="text-sm font-medium"><Label label={option.title} /></span>
            <span class="text-xs text-muted-foreground"><Label label={option.hint} /></span>
          </span>
        </label>
      {/each}
    </fieldset>
    <fieldset class="col-span-2 m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend class="mb-2 p-0 text-sm font-medium">
        <Label label={label_ServoneSetupContentQuestion} />
      </legend>
      {#each contentOptions as option (option.hasSampleContent)}
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary"
        >
          <input type="radio" name="starter-content" class="mt-1 accent-primary" value={option.hasSampleContent} bind:group={hasSampleContent} />
          <span class="flex flex-col gap-0.5">
            <span class="text-sm font-medium"><Label label={option.title} /></span>
            <span class="text-xs text-muted-foreground"><Label label={option.hint} /></span>
          </span>
        </label>
      {/each}
    </fieldset>
  </svelte:fragment>
</Form>
