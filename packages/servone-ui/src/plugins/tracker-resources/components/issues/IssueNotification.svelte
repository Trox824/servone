<script lang="ts">
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, createQuery } from '@hcengineering/presentation'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import { type Issue, type IssueStatus } from '@hcengineering/tracker'
  import { Button, type Notification, NotificationToast, navigate, parseLocation } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { statusStore } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import IssuePresenter from './IssuePresenter.svelte'
  import IssueStatusIcon from './IssueStatusIcon.svelte'
  import { str } from '../../sprints/plugin'
  import { isWorkflowKind } from './workflowItem'

  export let notification: Notification
  export let onRemove: () => void

  const subTitle = notification.subTitle
  const params = notification.params

  let createdIssue: Issue | undefined
  let lastKnownStatus: IssueStatus | undefined

  const issueQuery = createQuery()
  issueQuery.query(
    tracker.class.Issue,
    { _id: params?.issueId },
    (foundIssues) => {
      createdIssue = foundIssues[0]
    },
    { limit: 1 }
  )

  $: if (createdIssue?.status !== undefined) {
    lastKnownStatus = $statusStore.byId.get(createdIssue.status)
  }

  $: isWorkflowItem = createdIssue !== undefined && isWorkflowKind(createdIssue.kind, $taskTypeStore)

  function openCreatedIssue (): void {
    if (params?.issueUrl) {
      const issueLink = new URL(params.issueUrl)
      const frontOrigin = getMetadata(presentation.metadata.FrontUrl) || window.location.origin
      if (issueLink.origin === frontOrigin) {
        navigate(parseLocation(issueLink))
      }
    }
    onRemove()
  }

  function copyIssueLink (): void {
    if (createdIssue !== undefined) {
      void copyTextToClipboard(params?.issueUrl)
    }
  }
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="content">
    <div class="flex-row-center flex-wrap gap-2">
      {#if createdIssue !== undefined && lastKnownStatus === undefined}
        <IssueStatusIcon
          value={lastKnownStatus}
          taskType={createdIssue.kind}
          space={createdIssue.space}
          size="small"
        />
      {/if}
      {#if createdIssue !== undefined}
        <IssuePresenter value={createdIssue} />
      {/if}
      <span class="min-w-0 truncate">{subTitle}</span>
      <span class="text-muted-foreground">{params?.subTitlePostfix}</span>
    </div>
  </svelte:fragment>
  <svelte:fragment slot="buttons">
    <Button
      label={isWorkflowItem ? str.ViewItem : tracker.string.ViewIssue}
      on:click={openCreatedIssue}
    />
    <Button
      icon={view.icon.CopyLink}
      label={isWorkflowItem ? str.CopyItemLink : tracker.string.CopyIssueUrl}
      on:click={copyIssueLink}
    />
  </svelte:fragment>
</NotificationToast>
