<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type Issue, type Milestone, type Project } from '@hcengineering/tracker'
  import { Breadcrumbs, Button, Header, Label, Loading, Scroller, SelectPopup, deviceOptionsStore as deviceInfo, showPopup, type SelectPopupValueType } from '@hcengineering/ui'
  import { moveIssues, statusOfKind, toPlanIssue, updateIssues } from '../data'
  import { canAddToSprint } from '../lib/lifecycle'
  import { isBacklogRow } from '../lib/totals'
  import { triageReasons, type TriageReason } from '../lib/triage'
  import { isOpen } from '../lib/types'
  import { icon, str } from '../plugin'
  import { projectSettings, toSprint } from '../schema'
  import { isEpic, isScrumProject, issueTypeOf } from '../setup'
  import { byRank } from '../ui'
  import IssueRow from './IssueRow.svelte'
  import SetupPanel from './SetupPanel.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  let project: Project | undefined
  let issues: Issue[] = []
  let milestones: Milestone[] = []
  let loaded = false

  const projectQuery = createQuery()
  const issueQuery = createQuery()
  const milestoneQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => {
    issues = res
    loaded = true
  })
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (res) => (milestones = res))

  $: settings = projectSettings(project)
  $: epics = issues.filter(isEpic).sort(byRank)
  $: epicIds = new Set<string>(epics.map((e) => e._id))
  $: epicById = new Map(epics.map((e) => [e._id as string, e]))
  $: rows = issues
    .filter((it) => it.milestone == null)
    .map((it) => ({ it, plan: toPlanIssue(client, it) }))
    .filter(({ plan }) => isBacklogRow(plan, epicIds) && isOpen(plan.status))
    .map(({ it, plan }) => ({
      it,
      reasons: triageReasons(
        { points: plan.points, hasEpic: epicIds.has(it.attachedTo), isBug: issueTypeOf(it) === 'bug' },
        settings.scale,
        epics.length > 0
      )
    }))
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => byRank(a.it, b.it))
  $: targets = milestones
    .map((m) => ({ doc: m, sprint: toSprint(m) }))
    .filter((s) => canAddToSprint(s.sprint))
    .sort((a, b) => (a.sprint.state === 'active' ? -1 : 0) - (b.sprint.state === 'active' ? -1 : 0) || a.sprint.targetDate - b.sprint.targetDate)

  const REASON: Record<TriageReason, typeof str.NeedsPoints> = { points: str.NeedsPoints, epic: str.NeedsEpic }

  function moveToSprint (e: MouseEvent, issue: Issue): void {
    const value: SelectPopupValueType[] = targets.map((s) => ({ id: s.doc._id, text: s.doc.label, icon: icon.sprint }))
    showPopup(SelectPopup, { value }, e.currentTarget as HTMLElement, async (to: Ref<Milestone> | undefined) => {
      if (to != null) await moveIssues(client, [issue], to)
    })
  }

  async function cancel (issue: Issue): Promise<void> {
    if (project === undefined) return
    const status = statusOfKind(client, project, 'canceled')
    if (status !== undefined) await updateIssues(client, [issue], { status })
  }
</script>

<Header adaptive={'disabled'}>
  <Breadcrumbs items={[{ icon: icon.triage, label: str.Triage }]} />
</Header>

{#if project === undefined || !loaded}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else if rows.length === 0}
  <div class="mx-auto flex max-w-md flex-col items-center gap-1 p-10 text-center text-sm">
    <div class="font-semibold"><Label label={str.Triage} /></div>
    <p class="text-muted-foreground"><Label label={str.TriageEmpty} /></p>
  </div>
{:else}
  <p class="border-b px-4 py-2 text-xs text-muted-foreground"><Label label={str.TriageHint} /></p>
  <Scroller>
    <div class="shrink-0 p-4">
      <div class="overflow-hidden rounded-lg border bg-background">
        {#each rows as { it, reasons } (it._id)}
          <IssueRow issue={it} epic={epicById.get(it.attachedTo)} {epics} scale={settings.scale} readonly={false}>
            <div class="flex shrink-0 items-center gap-1">
              {#each reasons as r}
                <span class="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <Label label={REASON[r]} />
                </span>
              {/each}
            </div>
            <div class="flex shrink-0 items-center gap-1 {$deviceInfo.isMobile ? 'basis-full flex-col items-stretch gap-3 pt-1' : ''}">
              {#if targets.length > 0}
                <Button
                  kind={$deviceInfo.isMobile ? 'regular' : 'ghost'}
                  size={$deviceInfo.isMobile ? 'large' : 'small'}
                  width={$deviceInfo.isMobile ? '100%' : undefined}
                  label={str.MoveToSprint}
                  on:click={(e) => moveToSprint(e, it)}
                />
              {/if}
              {#if $deviceInfo.isMobile}
                <button type="button" class="h-10 w-full rounded-md text-sm text-destructive hover:bg-destructive/10" on:click={() => cancel(it)}>
                  <Label label={str.CancelIssue} />
                </button>
              {:else}
                <Button kind={'ghost'} size={'small'} label={str.CancelIssue} on:click={() => cancel(it)} />
              {/if}
            </div>
          </IssueRow>
        {/each}
      </div>
    </div>
  </Scroller>
{/if}
