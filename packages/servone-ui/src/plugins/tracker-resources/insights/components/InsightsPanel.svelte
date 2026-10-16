<!-- Docked beside an issue list (components/issues/IssuesView.svelte); counts what the list's own query shows. -->
<script lang="ts">
  import type { DocumentQuery, WithLookup } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Issue } from '@hcengineering/tracker'
  import { deviceOptionsStore as deviceInfo, getPlatformColorDef, Label, themeStore } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet } from '@hcengineering/view'
  import { getResultQuery } from '@hcengineering/view-resources'
  import { Download, TriangleAlert, X } from '@lucide/svelte'
  import { createEventDispatcher, onDestroy, tick } from 'svelte'
  import * as Alert from '../../../../lib/components/ui/alert'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../../lib/components/ui/dropdown-menu'
  import { Label as FieldLabel } from '../../../../lib/components/ui/label'
  import { ScrollArea } from '../../../../lib/components/ui/scroll-area'
  import * as Select from '../../../../lib/components/ui/select'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import DatePicker from '../../../calendar-resources/lich/components/fields/DatePicker.svelte'
  import { loadFormText, type FormText } from '../../forms/text'
  import CycleTimeChart from '../../sprints/components/CycleTimeChart.svelte'
  import { percentile } from '../../sprints/lib/flow'
  import { DAY } from '../../sprints/lib/types'
  import { str } from '../../sprints/plugin'
  import type { StringKey } from '../../sprints/strings'
  import {
    completedQuery,
    INSIGHTS_ISSUE_CAP,
    insightOptions,
    insightSourceClass,
    loadLookups,
    missingDatesQuery,
    NO_LOOKUPS,
    openQuery,
    statusColors,
    toInsightIssue,
    type InsightSource,
    type Lookups,
    type NameField
  } from '../data'
  import { insightBars, median, OTHER_KEY, panelIssues, statusTable, summaryRows, totalStats } from '../lib/aggregate'
  import { csvFileName, issuesCsv, summaryCsv } from '../lib/csv'
  import { rangeBounds } from '../lib/range'
  import { DIMENSIONS, isTimeMeasure, MEASURES, RANGE_PRESETS, type DateRange, type Dimension, type Measure } from '../lib/types'
  import { readQuery, writeQuery } from '../storage'
  import InsightsBars from './InsightsBars.svelte'
  import InsightsTable from './InsightsTable.svelte'

  export let query: DocumentQuery<Issue>
  export let viewlet: WithLookup<Viewlet> | undefined
  export let viewOptions: ViewOptions | undefined
  /** The view's name, for the header and the CSV file names. */
  export let label: string
  export let viewPath: string

  const LOOKUP_DEBOUNCE_MS = 300
  const P85 = 85
  const SKELETON_ROWS = 4
  const NO_SEGMENT = 'none'
  const CUSTOM = 'custom'

  const MEASURE_TEXT: Record<Measure, StringKey> = {
    count: 'InsightsCount',
    points: 'InsightsPoints',
    cycleTime: 'InsightsCycleTime',
    leadTime: 'InsightsLeadTime'
  }
  const DIMENSION_TEXT: Record<Dimension, StringKey> = {
    assignee: 'InsightsAssignee',
    status: 'InsightsStatus',
    label: 'InsightsLabel',
    epic: 'InsightsEpic',
    sprint: 'InsightsSprint'
  }
  const PRESET_TEXT: Record<DateRange['preset'], StringKey> = {
    thisWeek: 'InsightsThisWeek',
    last2Weeks: 'InsightsLast2Weeks',
    thisMonth: 'InsightsThisMonth',
    last30Days: 'InsightsLast30Days',
    custom: 'InsightsCustom'
  }
  const NONE_TEXT: Record<NameField, StringKey> = {
    assignee: 'InsightsUnassigned',
    status: 'InsightsStatus',
    label: 'InsightsNoLabel',
    epic: 'InsightsNoEpic',
    sprint: 'InsightsNoSprint',
    project: 'InsightsProject'
  }
  const SUMMARY_HEADERS: StringKey[] = [
    'InsightsCsvSlice',
    'InsightsCsvSegment',
    'InsightsCsvIssues',
    'InsightsPoints',
    'InsightsCsvUnestimated',
    'InsightsCsvMedianCycle',
    'InsightsCsvMedianLead',
    'InsightsCsvNeverStarted'
  ]
  const ISSUE_HEADERS: StringKey[] = [
    'InsightsCsvId',
    'InsightsCsvTitle',
    'InsightsProject',
    'InsightsAssignee',
    'InsightsStatus',
    'InsightsPoints',
    'InsightsEpic',
    'InsightsSprint',
    'InsightsLabels',
    'InsightsCsvCreated',
    'InsightsCsvStarted',
    'InsightsCompleted',
    'InsightsCsvCycle',
    'InsightsCsvLead'
  ]
  const TEXT_KEYS: StringKey[] = [
    ...new Set([
      ...Object.values(MEASURE_TEXT),
      ...Object.values(DIMENSION_TEXT),
      ...Object.values(PRESET_TEXT),
      ...Object.values(NONE_TEXT),
      ...SUMMARY_HEADERS,
      ...ISSUE_HEADERS,
      'InsightsMeasure',
      'InsightsSliceBy',
      'InsightsSegmentBy',
      'InsightsNoSegment',
      'InsightsCompleted',
      'InsightsFrom',
      'InsightsTo',
      'InsightsOther',
      'InsightsTotal',
      'InsightsExport',
      'InsightsSummaryCsv',
      'InsightsIssuesCsv',
      'InsightsClose'
    ])
  ]

  const dispatch = createEventDispatcher<{ close: undefined }>()
  const client = getClient()
  const colors = statusColors(client)

  let t: FormText = (key) => key
  $: void loadFormText(TEXT_KEYS, $themeStore.language).then((loaded) => (t = loaded))
  $: lang = $themeStore.language === 'vi' ? ('vi' as const) : ('en' as const)

  let insightsQuery = readQuery(viewPath)
  $: writeQuery(viewPath, insightsQuery)
  $: bounds = rangeBounds(insightsQuery.range, Date.now())
  $: isTime = isTimeMeasure(insightsQuery.measure)

  let loadError: string | undefined

  let base: DocumentQuery<InsightSource> | undefined
  let baseRequest = 0
  $: void resolveBase(query, viewlet, viewOptions)
  async function resolveBase (viewQuery: DocumentQuery<Issue>, current: Viewlet | undefined, options: ViewOptions | undefined): Promise<void> {
    const request = ++baseRequest
    try {
      const resolved = await getResultQuery(client.getHierarchy(), viewQuery, current?.viewOptions?.other, options)
      if (request === baseRequest) base = resolved
    } catch (err) {
      if (request === baseRequest) loadError = err instanceof Error ? err.message : String(err)
    }
  }

  const completedLive = createQuery()
  const openLive = createQuery()
  const missingLive = createQuery()
  let completedDocs: InsightSource[] | undefined
  let openDocs: InsightSource[] | undefined
  let completedTotal = 0
  let openTotal = 0
  let missingCount = 0
  $: if (base !== undefined) {
    completedLive.query(
      insightSourceClass,
      completedQuery(base, bounds),
      (found) => {
        completedDocs = found
        completedTotal = found.total
      },
      insightOptions()
    )
  }
  $: if (base !== undefined) {
    openLive.query(
      insightSourceClass,
      openQuery(client, base),
      (found) => {
        openDocs = found
        openTotal = found.total
      },
      insightOptions()
    )
  }
  $: if (base !== undefined) {
    missingLive.query(insightSourceClass, missingDatesQuery(client, base), (found) => (missingCount = found.total), { limit: 1, total: true })
  }

  let lookups: Lookups = NO_LOOKUPS
  let lookupsKey: string | undefined
  let lookupTimer: ReturnType<typeof setTimeout> | undefined
  let lookupRequest = 0
  $: sources = [...(openDocs ?? []), ...(completedDocs ?? [])]
  $: sourcesKey = openDocs === undefined || completedDocs === undefined ? undefined : sources.map((doc) => doc._id).sort().join()
  $: scheduleLookups(sourcesKey)
  function scheduleLookups (key: string | undefined): void {
    if (key === undefined || key === lookupsKey) return
    clearTimeout(lookupTimer)
    if (lookupsKey === undefined) void refreshLookups(key)
    else lookupTimer = setTimeout(() => void refreshLookups(key), LOOKUP_DEBOUNCE_MS)
  }
  async function refreshLookups (key: string): Promise<void> {
    const request = ++lookupRequest
    try {
      const loaded = await loadLookups(client, sources)
      if (request !== lookupRequest) return
      lookups = loaded
      lookupsKey = key
      loadError = undefined
    } catch (err) {
      if (request === lookupRequest) loadError = err instanceof Error ? err.message : String(err)
    }
  }
  onDestroy(() => {
    clearTimeout(lookupTimer)
  })

  $: isLoading = lookupsKey === undefined
  $: completed = (completedDocs ?? []).map((doc) => toInsightIssue(client, doc, lookups))
  $: open = (openDocs ?? []).map((doc) => toInsightIssue(client, doc, lookups))
  $: bars = insightBars(completed, insightsQuery)
  $: total = totalStats(completed)
  $: table = statusTable(open, completed)
  $: isEmpty = total.issues === 0
  $: isCapped = completedTotal > INSIGHTS_ISSUE_CAP || openTotal > INSIGHTS_ISSUE_CAP
  $: hasLabels = insightsQuery.slice === 'label' || insightsQuery.segment === 'label'

  $: timeDays = (insightsQuery.measure === 'cycleTime' ? total.cycleMs : total.leadMs).map((ms) => ms / DAY)
  $: scatter = panelIssues([], completed).flatMap((issue) => {
    const start = insightsQuery.measure === 'cycleTime' ? issue.startedOn : issue.createdOn
    if (start === null || issue.completedOn === null || start > issue.completedOn) return []
    const days = (issue.completedOn - start) / DAY
    return [{ _id: issue._id, startedAt: start, doneAt: issue.completedOn, days, label: `${issue.identifier} ${issue.title}` }]
  })

  const roundTenth = (amount: number): number => Math.round(amount * 10) / 10
  const oneDecimal = (amount: number): string => String(roundTenth(amount))

  $: nameOf = (field: NameField, key: string): string => {
    if (key === OTHER_KEY) return t('InsightsOther')
    if (key === '') return t(NONE_TEXT[field])
    if (field === 'status') return key
    return lookups.names.get(field)?.get(key) ?? key
  }
  $: segmentColor = (key: string): string | undefined => {
    const color = insightsQuery.segment === 'status' ? colors.get(key) : undefined
    return color === undefined ? undefined : getPlatformColorDef(color, $themeStore.dark).color
  }

  function setMeasure (picked: string): void {
    const measure = MEASURES.find((candidate) => candidate === picked)
    if (measure === undefined) return
    insightsQuery = { ...insightsQuery, measure, segment: isTimeMeasure(measure) ? null : insightsQuery.segment }
  }
  function setSlice (picked: string): void {
    const slice = DIMENSIONS.find((candidate) => candidate === picked)
    if (slice === undefined) return
    insightsQuery = { ...insightsQuery, slice, segment: insightsQuery.segment === slice ? null : insightsQuery.segment }
  }
  function setSegment (picked: string): void {
    insightsQuery = { ...insightsQuery, segment: DIMENSIONS.find((candidate) => candidate === picked) ?? null }
  }
  function setPreset (picked: string): void {
    if (picked === CUSTOM) {
      insightsQuery = { ...insightsQuery, range: { preset: 'custom', from: bounds.from, to: bounds.to } }
      return
    }
    const preset = RANGE_PRESETS.find((candidate) => candidate === picked)
    if (preset !== undefined) insightsQuery = { ...insightsQuery, range: { preset } }
  }
  function dayAfter (day: number): number {
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  function lastDay (to: number): number {
    const day = new Date(to - 1)
    day.setHours(0, 0, 0, 0)
    return day.getTime()
  }
  function setFrom (day: number): void {
    insightsQuery = { ...insightsQuery, range: { preset: 'custom', from: day, to: Math.max(bounds.to, dayAfter(day)) } }
  }
  function setTo (day: number): void {
    insightsQuery = { ...insightsQuery, range: { preset: 'custom', from: Math.min(bounds.from, day), to: dayAfter(day) } }
  }

  let rangeTrigger: HTMLButtonElement | null = null
  $: if (!isLoading && isEmpty) void tick().then(() => rangeTrigger?.focus())

  function exportCsv (kind: 'summary' | 'issues'): void {
    const text =
      kind === 'summary'
        ? summaryCsv(
          summaryRows(completed, insightsQuery.slice, insightsQuery.segment),
          total,
          insightsQuery,
          nameOf,
          SUMMARY_HEADERS.map((key) => t(key)),
          t('InsightsTotal')
        )
        : issuesCsv(panelIssues(open, completed), nameOf, ISSUE_HEADERS.map((key) => t(key)))
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = csvFileName(label, bounds, kind)
    link.click()
    URL.revokeObjectURL(url)
  }
</script>

<aside class="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
  <header class="flex items-center gap-2 border-b border-border px-4 py-2">
    <div class="min-w-0 flex-1">
      <h2 class="m-0 text-sm font-semibold"><Label label={str.Insights} /></h2>
      <p class="m-0 truncate text-xs text-muted-foreground">{label}</p>
    </div>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'sm' })} disabled={isLoading}>
        <Download />{t('InsightsExport')}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={() => { exportCsv('summary') }}>{t('InsightsSummaryCsv')}</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => { exportCsv('issues') }}>{t('InsightsIssuesCsv')}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <Button variant="ghost" size="icon-sm" aria-label={t('InsightsClose')} onclick={() => { dispatch('close') }}><X /></Button>
  </header>

  <ScrollArea class="min-h-0 flex-1">
    <div class="flex flex-col gap-4 px-4 py-3">
      <div class="grid grid-cols-2 gap-x-3 gap-y-2">
        <div class="grid gap-1">
          <FieldLabel for="insights-measure" class="text-xs font-normal text-muted-foreground">{t('InsightsMeasure')}</FieldLabel>
          <Select.Root type="single" value={insightsQuery.measure} onValueChange={setMeasure}>
            <Select.Trigger id="insights-measure" size="sm" class="w-full">{t(MEASURE_TEXT[insightsQuery.measure])}</Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each MEASURES as measure (measure)}
                <Select.Item value={measure} label={t(MEASURE_TEXT[measure])} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-1">
          <FieldLabel for="insights-range" class="text-xs font-normal text-muted-foreground">{t('InsightsCompleted')}</FieldLabel>
          <Select.Root type="single" value={insightsQuery.range.preset} onValueChange={setPreset}>
            <Select.Trigger id="insights-range" size="sm" class="w-full" bind:ref={rangeTrigger}>{t(PRESET_TEXT[insightsQuery.range.preset])}</Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each RANGE_PRESETS as preset (preset)}
                <Select.Item value={preset} label={t(PRESET_TEXT[preset])} />
              {/each}
              <Select.Item value={CUSTOM} label={t('InsightsCustom')} />
            </Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-1">
          <FieldLabel for="insights-slice" class="text-xs font-normal text-muted-foreground">{t('InsightsSliceBy')}</FieldLabel>
          <Select.Root type="single" value={insightsQuery.slice} onValueChange={setSlice}>
            <Select.Trigger id="insights-slice" size="sm" class="w-full">{t(DIMENSION_TEXT[insightsQuery.slice])}</Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each DIMENSIONS as dimension (dimension)}
                <Select.Item value={dimension} label={t(DIMENSION_TEXT[dimension])} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-1">
          <FieldLabel for="insights-segment" class="text-xs font-normal text-muted-foreground">{t('InsightsSegmentBy')}</FieldLabel>
          <Select.Root type="single" value={insightsQuery.segment ?? NO_SEGMENT} onValueChange={setSegment}>
            <Select.Trigger id="insights-segment" size="sm" class="w-full" disabled={isTime}>
              {insightsQuery.segment === null ? t('InsightsNoSegment') : t(DIMENSION_TEXT[insightsQuery.segment])}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              <Select.Item value={NO_SEGMENT} label={t('InsightsNoSegment')} />
              {#each DIMENSIONS.filter((dimension) => dimension !== insightsQuery.slice) as dimension (dimension)}
                <Select.Item value={dimension} label={t(DIMENSION_TEXT[dimension])} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if insightsQuery.range.preset === 'custom'}
          <div class="grid gap-1">
            <FieldLabel for="insights-from" class="text-xs font-normal text-muted-foreground">{t('InsightsFrom')}</FieldLabel>
            <DatePicker id="insights-from" value={bounds.from} {lang} firstDayOfWeek={$deviceInfo.firstDayOfWeek} on:change={(e) => { setFrom(e.detail) }} />
          </div>
          <div class="grid gap-1">
            <FieldLabel for="insights-to" class="text-xs font-normal text-muted-foreground">{t('InsightsTo')}</FieldLabel>
            <DatePicker id="insights-to" value={lastDay(bounds.to)} min={bounds.from} {lang} firstDayOfWeek={$deviceInfo.firstDayOfWeek} on:change={(e) => { setTo(e.detail) }} />
          </div>
        {/if}
      </div>

      {#if loadError !== undefined}
        <Alert.Root variant="destructive">
          <TriangleAlert />
          <Alert.Title><Label label={str.InsightsLoadFailed} /></Alert.Title>
          <Alert.Description>{loadError}</Alert.Description>
        </Alert.Root>
      {:else if isLoading}
        <div class="flex flex-col gap-2">
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-32 w-full" />
          {#each Array.from({ length: SKELETON_ROWS }, (_, row) => row) as row (row)}
            <Skeleton class="h-6 w-full" />
          {/each}
        </div>
      {:else}
        {#if missingCount > 0}
          <Alert.Root>
            <TriangleAlert />
            <Alert.Description><Label label={str.InsightsMissingDates} params={{ count: missingCount }} /></Alert.Description>
          </Alert.Root>
        {/if}
        {#if isCapped}
          <Alert.Root>
            <TriangleAlert />
            <Alert.Description><Label label={str.InsightsCapped} params={{ cap: INSIGHTS_ISSUE_CAP.toLocaleString() }} /></Alert.Description>
          </Alert.Root>
        {/if}

        {#if isEmpty}
          <p class="m-0 py-6 text-center text-sm text-muted-foreground"><Label label={str.InsightsEmpty} /></p>
        {:else}
          <p class="m-0 flex flex-wrap gap-x-1.5 text-sm tabular-nums">
            {#if isTime}
              <span><Label label={str.InsightsMedian} params={{ days: oneDecimal(median(timeDays) ?? 0) }} /></span>
              <span class="text-muted-foreground">·</span>
              <span><Label label={str.InsightsP85} params={{ days: oneDecimal(percentile(timeDays, P85) ?? 0) }} /></span>
              {#if insightsQuery.measure === 'cycleTime' && total.neverStarted > 0}
                <span class="text-muted-foreground">·</span>
                <span class="text-muted-foreground"><Label label={str.InsightsNeverStarted} params={{ count: total.neverStarted }} /></span>
              {/if}
            {:else}
              <span><Label label={str.InsightsIssues} params={{ count: total.issues }} /></span>
              <span class="text-muted-foreground">·</span>
              <span><Label label={str.InsightsPointsTotal} params={{ count: roundTenth(total.points) }} /></span>
              {#if total.unestimated > 0}
                <span class="text-muted-foreground">·</span>
                <span class="text-muted-foreground"><Label label={str.InsightsUnestimated} params={{ count: total.unestimated }} /></span>
              {/if}
            {/if}
          </p>

          <InsightsBars
            {bars}
            barName={(key) => nameOf(insightsQuery.slice, key)}
            segmentName={(key) => (insightsQuery.segment === null ? key : nameOf(insightsQuery.segment, key))}
            {segmentColor}
            format={oneDecimal}
          />
          {#if hasLabels}
            <p class="m-0 text-xs text-muted-foreground"><Label label={str.InsightsLabelFootnote} /></p>
          {/if}
          {#if isTime}
            <CycleTimeChart
              items={scatter}
              median={median(timeDays) ?? 0}
              p85={percentile(timeDays, P85) ?? 0}
              from={bounds.from}
              to={bounds.to}
            />
          {/if}
        {/if}

        <section class="flex flex-col gap-2">
          <h3 class="m-0 text-xs font-medium text-muted-foreground"><Label label={str.InsightsTableTitle} /></h3>
          <InsightsTable {table} />
        </section>
      {/if}
    </div>
  </ScrollArea>
</aside>
