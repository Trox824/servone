import calendar, { getAllEvents, type Event } from '@hcengineering/calendar'
import { getCurrentEmployee, type Person } from '@hcengineering/contact'
import { getCurrentAccount, type AttachedDoc, type Class, type Ref } from '@hcengineering/core'
import { createQuery, getClient } from '@hcengineering/presentation'
import tracker, { type Issue, type IssueStatus } from '@hcengineering/tracker'
import { readable } from 'svelte/store'
import { isMessageReminder } from '../../../lib/remind/reminder-event'
import { statusKindOf } from '../../tracker-resources/sprints/data'
import { isWorkflowType } from '../../tracker-resources/workflows/nav'
import { calendarStore } from '../utils'
import { needsYou, type Need } from './lib/needs'
import { myAnswer } from './lib/rsvp'
import { addDays, startOfDay } from './lib/time'

export interface WaitingRequest extends AttachedDoc {
  requested: Array<Ref<Person>>
  status: string
}
const REQUEST_CLASS = 'request:class:Request' as Ref<Class<WaitingRequest>>
const ACTIVE_STATUS = 'Active' // RequestStatus.Active

const CLOCK_TICK_MS = 60 * 1000
const INVITE_DAYS = 7

export type MyNeed = Need<WaitingRequest, Issue, Event>

export interface NeedsState {
  isLoaded: boolean
  needs: MyNeed[]
  approvalTitles: Map<string, string>
}

export const needsStore = readable<NeedsState>({ isLoaded: false, needs: [], approvalTitles: new Map() }, (set) => {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const account = getCurrentAccount()
  const me = getCurrentEmployee()
  const mySocial = new Set<string>(account.socialIds)
  const isMine = (socialId: string): boolean => mySocial.has(socialId)

  let requests: WaitingRequest[] | undefined
  let issues: Issue[] | undefined
  let workflowSpaces: Set<string> | undefined
  let stored: Event[] | undefined
  let approvalTitles = new Map<string, string>()

  function publish (): void {
    if (requests === undefined || issues === undefined || workflowSpaces === undefined || stored === undefined) return
    const now = Date.now()
    const today = startOfDay(now)
    const events = stored
    const invites = getAllEvents(events, today, addDays(today, INVITE_DAYS))
      .filter((e) => e.dueDate > now && !isMessageReminder(hierarchy, e) && myAnswer(e, events, isMine) === 'pending')
    set({ isLoaded: true, needs: needsYou({ requests, issues, invites, workflowSpaces, now }), approvalTitles })
  }

  const openStatuses = client.getModel().findAllSync(tracker.class.IssueStatus, {})
    .filter((status) => !['done', 'canceled'].includes(statusKindOf(client, status._id)))
    .map((status): Ref<IssueStatus> => status._id)

  const titlesQuery = createQuery(true)
  const requestsQuery = createQuery(true)
  requestsQuery.query(REQUEST_CLASS, { requested: me, status: ACTIVE_STATUS }, (found) => {
    requests = found
    const gated = found.filter((r) => hierarchy.isDerived(r.attachedToClass, tracker.class.Issue)).map((r) => r.attachedTo as Ref<Issue>)
    titlesQuery.query(tracker.class.Issue, { _id: { $in: gated } }, (titled) => {
      approvalTitles = new Map(titled.map((issue) => [issue._id, issue.title]))
      publish()
    }, { projection: { _id: 1, title: 1 } })
    publish()
  })

  const issuesQuery = createQuery(true)
  issuesQuery.query(tracker.class.Issue, { assignee: me, status: { $in: openStatuses } }, (found) => {
    issues = found
    publish()
  })

  const projectsQuery = createQuery(true)
  projectsQuery.query(tracker.class.Project, { members: account.uuid }, (found) => {
    workflowSpaces = new Set(found.filter((project) => isWorkflowType(project.type)).map((project) => project._id))
    publish()
  }, { projection: { _id: 1, type: 1 } })

  const eventsQuery = createQuery(true)
  const unsubscribeCalendars = calendarStore.subscribe((calendars) => {
    const mine = calendars.filter((c) => isMine(c.user) && !c.hidden).map((c) => c._id)
    eventsQuery.query(calendar.class.Event, { calendar: { $in: mine } }, (found) => {
      stored = found
      publish()
    })
  })

  const timer = setInterval(publish, CLOCK_TICK_MS)
  return () => {
    clearInterval(timer)
    unsubscribeCalendars()
    for (const query of [titlesQuery, requestsQuery, issuesQuery, projectsQuery, eventsQuery]) query.unsubscribe()
  }
})
