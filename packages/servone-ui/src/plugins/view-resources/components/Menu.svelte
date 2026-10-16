<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import type { Asset } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { type Action, Menu } from '@hcengineering/ui'
  import type { Action as ViewAction, ViewContextType } from '@hcengineering/view'
  import { getActions, invokeAction } from '../actions'
  import { workflowItemMenuActions } from '../../tracker-resources/components/issues/workflowItem'

  export let object: Doc | Doc[]
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let actions: Action[] = []
  export let excludedActions: string[] = []
  export let includedActions: string[] = []
  export let mode: ViewContextType | undefined = undefined
  export let overrides: Map<Ref<ViewAction>, (object: Doc | Doc[], ev?: Event) => void> = new Map()

  const client = getClient()

  const groupRanks: Record<string, number> = {
    create: 1,
    edit: 2,
    copy: 3,
    associate: 4,
    tools: 5,
    other: 6,
    remove: 7
  }

  let menuActions: Action[] | undefined

  function isActionAllowed (modelAction: ViewAction): boolean {
    if (excludedActions.includes(modelAction._id)) return false
    if (includedActions.length > 0 && !includedActions.includes(modelAction._id)) return false
    const overriddenIds = modelAction.override ?? []
    return !overriddenIds.some((overriddenId) => excludedActions.includes(overriddenId))
  }

  function toMenuAction (modelAction: ViewAction): Action {
    return {
      label: modelAction.label,
      icon: modelAction.icon as Asset,
      inline: modelAction.inline,
      group: modelAction.context.group ?? 'other',
      component: modelAction.actionPopup,
      props: { ...modelAction.actionProps, value: object },
      action: async (_, evt) => {
        const override = overrides.get(modelAction._id)
        if (override !== undefined) {
          override(object, evt)
          return
        }
        void invokeAction(object, evt, modelAction)
      }
    }
  }

  function rankOf (menuAction: Action): number {
    return groupRanks[menuAction.group ?? 'other'] ?? groupRanks.other
  }

  void getActions(client, object, baseMenuClass, mode).then((modelActions) => {
    const convertedActions = workflowItemMenuActions(object, modelActions, client)
      .filter(isActionAllowed)
      .map(toMenuAction)
    menuActions = [...convertedActions, ...actions].sort((first, second) => rankOf(first) - rankOf(second))
  })
</script>

{#if menuActions !== undefined && menuActions.length > 0}
  <Menu actions={menuActions} on:close on:changeContent />
{/if}
