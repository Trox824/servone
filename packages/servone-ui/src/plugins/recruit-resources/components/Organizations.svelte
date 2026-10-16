<script lang="ts">
  import type { Organization } from '@hcengineering/contact'
  import core, { type Doc, type DocumentQuery, type Ref, type WithLookup } from '@hcengineering/core'
  import { ExportButton } from '@hcengineering/export-resources'
  import { createQuery } from '@hcengineering/presentation'
  import type { Vacancy } from '@hcengineering/recruit'
  import { Breadcrumb, Button, Component, Header, IconAdd, Loading, SearchInput, showPopup } from '@hcengineering/ui'
  import view, {
    type BuildModelKey,
    type ViewOptions,
    type Viewlet,
    type ViewletPreference
  } from '@hcengineering/view'
  import { FilterBar, FilterButton, ViewletSelector, ViewletSettingButton } from '@hcengineering/view-resources'
  import recruit from '../plugin'
  import CreateOrganization from './CreateOrganization.svelte'
  import IconCompany from './icons/Company.svelte'
  import VacancyListApplicationsPopup from './organizations/VacancyListApplicationsPopup.svelte'
  import VacancyListCountPresenter from './organizations/VacancyListCountPresenter.svelte'
  import VacancyPopup from './organizations/VacancyPopup.svelte'

  interface CompanyStat {
    count: number
    modifiedOn: number
    vacancies: Ref<Vacancy>[]
  }

  type CompanyStats = Map<Ref<Organization>, CompanyStat>

  const EXPORT_CONFIG = {
    skipAttributes: ['_class', 'docUpdateMessages', 'space', 'notification:mixin:Collaborators', 'recruit:mixin:VacancyList'],
    attributeKeyMap: { city: 'location' },
    attributeTransforms: {
      channels: {
        operations: [
          { type: 'group_by', config: { keyField: 'data.provider', valueField: 'data.value' } },
          { type: 'join', config: { delimiter: ', ' } }
        ]
      }
    }
  }

  let searchText = ''
  let resultQuery: DocumentQuery<Doc> = {}
  let loading = true
  let viewlet: WithLookup<Viewlet> | undefined
  let preference: ViewletPreference | undefined
  let viewOptions: ViewOptions | undefined
  let openVacancies: Vacancy[] = []
  let applications: Array<{ _id: Ref<Doc>, modifiedOn: number, space: Ref<Vacancy> }> = []

  $: searchQuery = searchText === '' ? {} : { $search: searchText }

  const vacancyQuery = createQuery()
  $: vacancyQuery.query(recruit.class.Vacancy, { company: { $exists: true }, archived: false }, (found) => {
    openVacancies = found
  })

  const applicationQuery = createQuery()
  $: applicationQuery.query(
    recruit.class.Applicant,
    {},
    (found) => {
      applications = found
    },
    { projection: { _id: 1, modifiedOn: 1, space: 1 } }
  )

  $: vacancyById = new Map(openVacancies.map((vacancy) => [vacancy._id, vacancy]))

  $: vacancyStats = collectVacancyStats(openVacancies)
  $: applicationStats = collectApplicationStats(applications, vacancyById)

  function collectVacancyStats (vacancies: Vacancy[]): CompanyStats {
    const stats: CompanyStats = new Map()
    for (const vacancy of vacancies) {
      if (vacancy.company === undefined) continue
      const previous = stats.get(vacancy.company)
      stats.set(vacancy.company, {
        count: (previous?.count ?? 0) + 1,
        modifiedOn: Math.max(previous?.modifiedOn ?? 0, vacancy.modifiedOn),
        vacancies: [...(previous?.vacancies ?? []), vacancy._id]
      })
    }
    return stats
  }

  function collectApplicationStats (
    found: Array<{ modifiedOn: number, space: Ref<Vacancy> }>,
    vacancies: Map<Ref<Vacancy>, Vacancy>
  ): CompanyStats {
    const stats: CompanyStats = new Map()
    for (const application of found) {
      const company = vacancies.get(application.space)?.company
      if (company === undefined) continue
      const previous = stats.get(company)
      const knownVacancies = previous?.vacancies ?? []
      stats.set(company, {
        count: (previous?.count ?? 0) + 1,
        modifiedOn: Math.max(previous?.modifiedOn ?? 0, application.modifiedOn),
        vacancies: knownVacancies.includes(application.space) ? knownVacancies : [...knownVacancies, application.space]
      })
    }
    return stats
  }

  function buildColumn (
    entry: string | BuildModelKey,
    vacancies: CompanyStats,
    applicationsByCompany: CompanyStats
  ): string | BuildModelKey {
    const key = typeof entry === 'string' ? entry : entry.key
    const countOf = (stats: CompanyStats, doc: Doc): number => stats.get(doc._id as Ref<Organization>)?.count ?? 0
    if (key === '@vacancies') {
      return {
        key: '',
        presenter: VacancyListCountPresenter,
        label: recruit.string.Vacancies,
        props: {
          values: vacancies,
          label: recruit.string.Vacancies,
          icon: recruit.icon.Vacancy,
          component: VacancyPopup
        },
        sortingKey: '@vacancies',
        sortingFunction: (a: Doc, b: Doc) => countOf(vacancies, b) - countOf(vacancies, a)
      }
    }
    if (key === '@applications') {
      return {
        key: '',
        presenter: VacancyListCountPresenter,
        label: recruit.string.Applications,
        props: {
          values: applicationsByCompany,
          label: recruit.string.Applications,
          component: VacancyListApplicationsPopup,
          icon: recruit.icon.Application,
          resultQuery: {}
        },
        sortingKey: '@applications',
        sortingFunction: (a: Doc, b: Doc) => countOf(applicationsByCompany, b) - countOf(applicationsByCompany, a)
      }
    }
    if (key === '@applications.modifiedOn') {
      const latest = (doc: Doc): number =>
        applicationsByCompany.get(doc._id as Ref<Organization>)?.modifiedOn ?? doc.modifiedOn
      return {
        key: '',
        presenter: recruit.component.VacancyModifiedPresenter,
        label: core.string.ModifiedDate,
        props: { applications: applicationsByCompany },
        sortingKey: 'modifiedOn',
        sortingFunction: (a: Doc, b: Doc) => latest(b) - latest(a)
      }
    }
    return entry
  }

  $: columns = (preference?.config ?? viewlet?.config ?? []).map((entry) =>
    buildColumn(entry, vacancyStats, applicationStats)
  )
</script>

<Header adaptive={'freezeActions'} hideActions={false}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      ignoreFragment
      bind:loading
      bind:viewlet
      bind:preference
      viewletQuery={{
        attachTo: recruit.mixin.VacancyList,
        descriptor: { $in: [view.viewlet.Table, view.viewlet.List] }
      }}
    />
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>

  <Breadcrumb icon={IconCompany} label={recruit.string.Organizations} size={'large'} isCurrent />

  <svelte:fragment slot="search">
    <SearchInput bind:value={searchText} collapsed on:change={(event) => (searchText = event.detail)} />
    <FilterButton _class={recruit.mixin.VacancyList} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    <ExportButton _class={recruit.mixin.VacancyList} query={resultQuery} visible config={EXPORT_CONFIG} />
    <Button
      icon={IconAdd}
      label={recruit.string.CompanyCreateLabel}
      kind={'primary'}
      size={'small'}
      on:click={() => {
        showPopup(CreateOrganization, {}, 'top')
      }}
    />
  </svelte:fragment>
</Header>

<FilterBar
  _class={recruit.mixin.VacancyList}
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
      _class: recruit.mixin.VacancyList,
      options: viewlet.options,
      config: columns,
      viewlet,
      viewOptions,
      viewOptionsConfig: viewlet.viewOptions?.other,
      query: { ...resultQuery },
      totalQuery: {}
    }}
  />
{/if}
