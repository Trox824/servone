<script lang="ts">
  import core, {
    type AccountUuid,
    type Ref,
    type Role,
    type RolesAssignment,
    type SpaceType,
    type TypedSpace,
    type WithLookup
  } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { type IntlString } from '@hcengineering/platform'
  import { Breadcrumb, Header, Label, Scroller } from '@hcengineering/ui'
  import { Shield } from '@lucide/svelte'
  import setting from '../plugin'
  import * as Empty from '../../../lib/components/ui/empty'

  const NO_ROLES = 'setting:string:ServoneNoSpaceRoles' as IntlString
  const NO_ROLES_HINT = 'setting:string:ServoneNoSpaceRolesHint' as IntlString
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const rootSpaceQuery = createQuery()
  const spaceTypeQuery = createQuery()

  let rootSpace: TypedSpace | undefined
  let spaceType: WithLookup<SpaceType> | undefined

  rootSpaceQuery.query(core.class.TypedSpace, { _id: core.space.Space as Ref<TypedSpace> }, (spaces) => {
    rootSpace = spaces[0]
  })

  $: rootSpaceTypeId = rootSpace?.type

  $: if (rootSpaceTypeId !== undefined) {
    spaceTypeQuery.query(
      core.class.SpaceType,
      { _id: core.spaceType.SpacesType },
      (types) => {
        spaceType = types[0]
      },
      { lookup: { _id: { roles: core.class.Role } } }
    )
  }

  $: spaceRoles = spaceType?.$lookup?.roles ?? []
  $: holdersByRole = collectHolders(rootSpace, spaceType, spaceRoles)

  function collectHolders (
    space: TypedSpace | undefined,
    type: WithLookup<SpaceType> | undefined,
    roles: Role[]
  ): Map<Ref<Role>, AccountUuid[]> {
    const holders = new Map<Ref<Role>, AccountUuid[]>()
    if (space === undefined || type?.targetClass === undefined) return holders
    const assignment: RolesAssignment = hierarchy.as(space, type.targetClass)
    for (const role of roles) {
      holders.set(role._id, assignment[role._id] ?? [])
    }
    return holders
  }

  function saveHolders (role: Role, accounts: AccountUuid[]): void {
    if (rootSpace === undefined || spaceType === undefined) return
    void client.updateMixin(rootSpace._id, rootSpace._class, core.space.Space, spaceType.targetClass, {
      [role._id]: accounts
    })
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={setting.icon.Views} label={setting.string.Spaces} size="large" isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col p-6">
      {#if spaceRoles.length === 0}
        <Empty.Root class="border-0 py-16">
          <Empty.Header>
            <Empty.Media variant="icon"><Shield /></Empty.Media>
            <Empty.Title><Label label={NO_ROLES} /></Empty.Title>
            <p class="m-0 text-sm text-muted-foreground"><Label label={NO_ROLES_HINT} /></p>
          </Empty.Header>
        </Empty.Root>
      {:else}
        {#each spaceRoles as role (role._id)}
          <div class="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
            <span class="text-sm font-medium text-foreground">{role.name}</span>
            <AccountArrayEditor
              value={holdersByRole.get(role._id) ?? []}
              label={core.string.Members}
              kind="regular"
              size="large"
              onChange={(accounts) => {
                saveHolders(role, accounts)
              }}
            />
          </div>
        {/each}
      {/if}
    </div>
  </Scroller>
</div>
