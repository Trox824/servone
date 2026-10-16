<script lang="ts">
  import core, {
    AccountRole,
    getCurrentAccount,
    hasAccountRole,
    type Doc,
    type DocumentQuery,
    type Ref,
    type WithLookup
  } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import type { Applicant, Vacancy } from '@hcengineering/recruit'
  import {
    Breadcrumb,
    Button,
    Component,
    Header,
    IconAdd,
    Loading,
    SearchInput,
    showPopup,
    tableToCSV
  } from '@hcengineering/ui'
  import view, {
    type BuildModelKey,
    type ViewOptions,
    type Viewlet,
    type ViewletPreference
  } from '@hcengineering/view'
  import { FilterBar, FilterButton, ViewletSelector, ViewletSettingButton } from '@hcengineering/view-resources'
  import recruit from '../plugin'
  import CreateVacancy from './CreateVacancy.svelte'
  import IconVacancy from './icons/Vacancy.svelte'

  interface ApplicationStat {
    count: number
    modifiedOn: number
  }

  const TABLE_ID = 'vacanciesData'
  const CSV_BOM = '%EF%BB%BF'
  const CSV_PREFIX = 'data:text/csv;charset=utf-8,'

  let searchText = ''
  let resultQuery: DocumentQuery<Vacancy> = {}
  let loading = true
  let viewlet: WithLookup<Viewlet> | undefined
  let preference: ViewletPreference | undefined
  let viewOptions: ViewOptions | undefined
  let applicationStats = new Map<Ref<Vacancy>, ApplicationStat>()

  $: searchQuery = searchText === '' ? {} : { $search: searchText }

  const applicationQuery = createQuery()
  $: applicationQuery.query(
    recruit.class.Applicant,
    {},
    (applications) => {
      const stats = new Map<Ref<Vacancy>, ApplicationStat>()
      for (const application of applications) {
        const previous = stats.get(application.space)
        stats.set(application.space, {
          count: (previous?.count ?? 0) + 1,
          modifiedOn: Math.max(previous?.modifiedOn ?? 0, application.modifiedOn)
        })
      }
      applicationStats = stats
    },
    { showArchived: true, projection: { _id: 1, modifiedOn: 1, space: 1 } }
  )

  function buildColumn (
    entry: string | BuildModelKey,
    stats: Map<Ref<Vacancy>, ApplicationStat>
  ): string | BuildModelKey {
    const key = typeof entry === 'string' ? entry : entry.key
    const countOf = (doc: Doc): number => stats.get(doc._id as Ref<Vacancy>)?.count ?? 0
    const latestOf = (doc: Doc): number => stats.get(doc._id as Ref<Vacancy>)?.modifiedOn ?? doc.modifiedOn
    if (key === '@applications') {
      return {
        key: '',
        presenter: recruit.component.VacancyCountPresenter,
        label: recruit.string.Applications,
        props: { applications: stats },
        sortingKey: '@applications',
        sortingFunction: (a: Doc, b: Doc) => countOf(b) - countOf(a)
      }
    }
    if (key === '@applications.modifiedOn') {
      return {
        key: '',
        presenter: recruit.component.VacancyModifiedPresenter,
        label: core.string.ModifiedDate,
        props: { applications: stats },
        sortingKey: 'modifiedOn',
        sortingFunction: (a: Doc, b: Doc) => latestOf(b) - latestOf(a)
      }
    }
    return entry
  }

  $: columns = (preference?.config ?? viewlet?.config ?? []).map((entry) => buildColumn(entry, applicationStats))

  function downloadCsv (): void {
    const content = CSV_PREFIX + CSV_BOM + encodeURIComponent(tableToCSV(TABLE_ID))
    const link = document.createElement('a')
    link.style.display = 'none'
    link.target = '_blank'
    link.href = content
    link.download = 'vacancies' + new Date().toLocaleDateString() + '.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  $: canCreate = hasAccountRole(getCurrentAccount(), AccountRole.User)
  $: isTable = viewlet?.descriptor === view.viewlet.Table
  $: hideActions = !isTable && !canCreate
</script>

<Header adaptive={'freezeActions'} {hideActions}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      ignoreFragment
      bind:loading
      bind:viewlet
      bind:preference
      viewletQuery={{ attachTo: recruit.class.Vacancy, descriptor: { $in: [view.viewlet.Table, view.viewlet.List] } }}
    />
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>

  <Breadcrumb icon={IconVacancy} label={recruit.string.Vacancies} size={'large'} isCurrent />

  <svelte:fragment slot="search">
    <SearchInput bind:value={searchText} collapsed on:change={(event) => (searchText = event.detail)} />
    <FilterButton _class={recruit.class.Vacancy} {viewOptions} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    {#if isTable}
      <Button label={recruit.string.Export} on:click={downloadCsv} />
    {/if}
    {#if canCreate}
      <Button
        icon={IconAdd}
        label={recruit.string.VacancyCreateLabel}
        kind={'primary'}
        size={'small'}
        on:click={() => {
          showPopup(CreateVacancy, {}, 'top')
        }}
      />
    {/if}
  </svelte:fragment>
</Header>

<FilterBar
  _class={recruit.class.Vacancy}
  space={undefined}
  {viewOptions}
  query={searchQuery}
  on:change={(event) => (resultQuery = event.detail)}
/>

{#if loading}
  <Loading />
{:else if viewlet?.$lookup?.descriptor?.component}
  <Component
    is={viewlet.$lookup.descriptor.component}
    props={{
      _class: recruit.class.Vacancy,
      options: viewlet.options,
      config: columns,
      viewlet,
      viewOptions,
      viewOptionsConfig: viewlet.viewOptions?.other,
      query: resultQuery,
      totalQuery: {},
      tableId: TABLE_ID
    }}
  />
{/if}
