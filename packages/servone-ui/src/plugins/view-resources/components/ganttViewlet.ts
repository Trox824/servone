import type { Class, Doc, Ref, WithLookup } from '@hcengineering/core'
import type { Viewlet, ViewletDescriptor } from '@hcengineering/view'

const ISSUE = 'tracker:class:Issue' as Ref<Class<Doc>>
const GANTT_DESCRIPTOR = 'tracker:viewlet:Gantt' as Ref<ViewletDescriptor>
const ISSUE_LIST = 'tracker:viewlet:IssueList'
const TIMELINE_VIEW = 'servone-tracker:component:TimelineView'
export const ISSUE_GANTT = 'tracker:viewlet:IssueGantt' as Ref<Viewlet>

const descriptor = {
  _id: GANTT_DESCRIPTOR,
  _class: 'view:class:ViewletDescriptor',
  space: 'core:space:Model',
  modifiedOn: 0,
  modifiedBy: 'core:account:System',
  label: 'tracker:string:Gantt',
  icon: 'tracker:icon:Gantt',
  component: 'tracker:component:GanttView'
} as unknown as ViewletDescriptor

const gantt = {
  _id: ISSUE_GANTT,
  _class: 'view:class:Viewlet',
  space: 'core:space:Model',
  modifiedOn: 0,
  modifiedBy: 'core:account:System',
  attachTo: ISSUE,
  descriptor: GANTT_DESCRIPTOR,
  viewOptions: {
    groupBy: [],
    orderBy: [
      ['startDate', 1],
      ['rank', 1],
      ['dueDate', 1]
    ],
    other: []
  },
  configOptions: { strict: true, hiddenKeys: ['title'] },
  config: [
    {
      key: '',
      presenter: 'tracker:component:PriorityEditor',
      label: 'tracker:string:Priority',
      props: { kind: 'list', size: 'small' }
    },
    { key: '', presenter: 'tracker:component:IssuePresenter', label: 'tracker:string:Issue' }
  ],
  $lookup: { descriptor }
} as unknown as WithLookup<Viewlet>

function asTimeline (v: WithLookup<Viewlet>): WithLookup<Viewlet> {
  if (v.descriptor !== GANTT_DESCRIPTOR) return v
  const d = v.$lookup?.descriptor ?? descriptor
  return { ...v, $lookup: { ...v.$lookup, descriptor: { ...d, component: TIMELINE_VIEW } } } as unknown as WithLookup<Viewlet>
}

export function withGantt (list: Array<WithLookup<Viewlet>>, isGanttAllowed: boolean): Array<WithLookup<Viewlet>> {
  if (!list.some((v) => v._id === ISSUE_LIST)) return list
  return (isGanttAllowed ? withStandIn(list) : list).map(asTimeline)
}

function withStandIn (list: Array<WithLookup<Viewlet>>): Array<WithLookup<Viewlet>> {
  if (list.some((v) => v.descriptor === GANTT_DESCRIPTOR)) return list
  return [...list, gantt]
}
