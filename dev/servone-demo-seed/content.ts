//
// Demo company content for the apps the tracker seed does not cover. Pure data; times are resolved in ./scenario.ts.
// Everything is fictional: Acme Studio, its people and its customers.
//

export type PersonKey = 'admin' | 'linh' | 'minh' | 'an' | 'huy' | 'mai' | 'khoa' | 'thao' | 'duc'

export const COMPANY = 'Acme Studio'

/** Stamped on every space the seed creates (and on drive and workflow descriptions) so --wipe finds only them. */
export const MARKER = 'Demo data from dev/servone-demo-seed. Remove with --wipe.'

/** Prefix of every doc id the seed chooses itself, so --wipe can filter on it. */
export const ID_PREFIX = 'acme-'

export interface DepartmentSpec {
  key: string
  name: string
  description: string
  lead: PersonKey
  members: PersonKey[]
}

export const DEPARTMENTS: DepartmentSpec[] = [
  { key: 'eng', name: 'Engineering', description: 'Builds and runs the Acme Studio product', lead: 'minh', members: ['minh', 'an', 'huy', 'mai'] },
  { key: 'product', name: 'Product', description: 'Roadmap, customers and delivery', lead: 'linh', members: ['linh'] },
  { key: 'design', name: 'Design', description: 'Product and brand design', lead: 'duc', members: ['duc'] },
  { key: 'ops', name: 'Operations', description: 'Office, IT, purchasing and releases', lead: 'admin', members: ['thao', 'khoa'] }
]

export interface ReplySpec {
  by: PersonKey
  text: string
  /** Minutes after the parent message. */
  after: number
}

export interface MessageSpec {
  by: PersonKey
  /** Whole days before today, and the wall clock in Vietnam (UTC+7). */
  ago: number
  at: string
  /** `@key` becomes a mention of that person. */
  text: string
  replies?: ReplySpec[]
  isPinned?: boolean
}

export interface ChannelSpec {
  key: string
  name: string
  topic: string
  isPrivate: boolean
  /** An existing channel is posted into, not created. */
  isExisting: boolean
  messages: MessageSpec[]
}

export const CHANNELS: ChannelSpec[] = [
  {
    key: 'general',
    name: 'general',
    topic: 'Company news and anything everyone should see',
    isPrivate: false,
    isExisting: true,
    messages: [
      { by: 'admin', ago: 13, at: '09:02', text: 'Welcome to the Acme Studio workspace. Keep announcements here, project talk in the team channels.', isPinned: true },
      { by: 'linh', ago: 13, at: '09:40', text: 'Sprint 7 kicks off on Monday. Planning is at 10:00 in the big room, the board is already groomed.' },
      { by: 'duc', ago: 12, at: '11:15', text: 'New brand color tokens are in the Design folder in Drive. Please use them in anything customer facing.' },
      { by: 'thao', ago: 11, at: '14:20', text: 'The office printer is fixed. If it jams again, file an IT Helpdesk request instead of pinging me directly.' },
      {
        by: 'admin',
        ago: 10,
        at: '10:05',
        text: 'Team lunch next Friday at 12:00, my treat. @linh can you collect dietary requirements?',
        replies: [
          { by: 'linh', text: 'On it. I will post a poll by tomorrow.', after: 12 },
          { by: 'mai', text: 'Vegetarian for me please.', after: 35 },
          { by: 'huy', text: 'Same as last time, no peanuts.', after: 52 }
        ]
      },
      { by: 'khoa', ago: 8, at: '16:30', text: 'Heads up: the VPN certificate renews tonight. You may be asked to sign in again tomorrow morning.' },
      { by: 'minh', ago: 7, at: '09:15', text: 'Release 0.9 is out. Thanks everyone, especially @thao for the late regression pass.' },
      { by: 'thao', ago: 7, at: '09:21', text: 'Happy to help. Two minor issues are logged for the next sprint.' },
      { by: 'admin', ago: 4, at: '13:45', text: 'Reminder: expense reports for September are due Friday. The policy is in Drive under Finance.' },
      { by: 'an', ago: 2, at: '10:30', text: 'Does anyone have a spare USB-C dock? Mine died this morning.' },
      { by: 'khoa', ago: 2, at: '10:42', text: 'I have one in the IT cupboard, come by the ops desk.' },
      { by: 'linh', ago: 1, at: '17:10', text: 'Customer demo went well. Notes are in the #releases thread, thank you all.' }
    ]
  },
  {
    key: 'engineering',
    name: 'engineering',
    topic: 'Builds, bugs and technical decisions',
    isPrivate: false,
    isExisting: false,
    messages: [
      { by: 'minh', ago: 13, at: '09:50', text: 'Standup notes: API rate limiting is merged, search indexing is next. Blockers go in this channel.' },
      { by: 'an', ago: 12, at: '10:25', text: 'The new sign-in flow is behind a flag in staging. @thao could you run through it today?' },
      {
        by: 'thao',
        ago: 12,
        at: '15:05',
        text: 'Found two issues with the magic link on Safari. Logged both in the tracker.',
        replies: [
          { by: 'an', text: 'Thanks, reproduced. It is the cookie SameSite setting, fix coming this afternoon.', after: 18 },
          { by: 'minh', text: 'Add a regression test for it please.', after: 24 }
        ]
      },
      { by: 'huy', ago: 10, at: '11:00', text: 'Proposal: move the notification queue to its own worker. It would cut p95 latency on the inbox by roughly a third.' },
      {
        by: 'minh',
        ago: 10,
        at: '11:35',
        text: '@huy sounds good. Please write it up as a short design note and we will review it on Thursday.',
        replies: [{ by: 'huy', text: 'Will do, draft by Wednesday.', after: 9 }]
      },
      { by: 'mai', ago: 8, at: '14:10', text: 'CI is back to green after the flaky upload test was quarantined.' },
      { by: 'khoa', ago: 7, at: '08:55', text: 'Deploy window for 0.9 is 14:00 today. Please do not merge to main after 13:30.' },
      { by: 'minh', ago: 7, at: '15:20', text: '0.9 is live. Error rate is flat, dashboards look healthy.' },
      { by: 'an', ago: 5, at: '10:10', text: 'Who is on call this week? The rota in the wiki still shows last month.' },
      { by: 'khoa', ago: 5, at: '10:14', text: 'I am. I will update the rota page now.' },
      { by: 'mai', ago: 3, at: '16:40', text: 'Upgraded the build image to Node 22. Local builds should be about 20% faster, please pull and rebuild.' },
      { by: 'minh', ago: 1, at: '09:30', text: 'Reminder: code freeze for sprint 7 is Thursday noon.' }
    ]
  },
  {
    key: 'design',
    name: 'design',
    topic: 'Design reviews, assets and feedback',
    isPrivate: false,
    isExisting: false,
    messages: [
      { by: 'duc', ago: 12, at: '10:00', text: 'Uploaded the first pass of the new onboarding screens. Feedback welcome until Wednesday.' },
      { by: 'linh', ago: 12, at: '10:40', text: 'Looks clean. Can we shorten step 2? Customers drop off there.' },
      {
        by: 'duc',
        ago: 11,
        at: '09:20',
        text: 'Good point. I cut the form to three fields, @linh please check the new version.',
        replies: [
          { by: 'linh', text: 'Much better. Ship it to @an for build.', after: 25 },
          { by: 'an', text: 'Picking it up today.', after: 31 }
        ]
      },
      { by: 'mai', ago: 9, at: '13:15', text: 'The empty state on the inbox still shows the old illustration.' },
      { by: 'duc', ago: 9, at: '13:50', text: 'Thanks, swapping it now.' },
      { by: 'thao', ago: 6, at: '11:25', text: 'Contrast on the grey helper text fails accessibility checks in dark mode.' },
      { by: 'duc', ago: 6, at: '11:50', text: 'Noted. I am bumping the helper text two steps lighter in the token file.' },
      { by: 'duc', ago: 3, at: '15:00', text: 'Design review this Wednesday at 14:00 in the small room. Bring questions on the settings pages.' },
      { by: 'linh', ago: 2, at: '09:45', text: 'I will bring the customer feedback summary for the settings pages.' }
    ]
  },
  {
    key: 'releases',
    name: 'releases',
    topic: 'Release notes and go/no-go decisions',
    isPrivate: false,
    isExisting: false,
    messages: [
      { by: 'linh', ago: 13, at: '16:00', text: 'Release 0.9 scope is frozen: sign-in options, inbox filters and the new onboarding.' },
      { by: 'minh', ago: 9, at: '10:30', text: 'Release candidate is on staging. Test plan is attached to the sprint board.' },
      { by: 'thao', ago: 8, at: '17:45', text: 'Regression pass complete. No blockers, two minor issues logged.' },
      {
        by: 'linh',
        ago: 8,
        at: '18:10',
        text: 'Go for tomorrow, @minh please confirm the deploy window with @khoa.',
        replies: [
          { by: 'minh', text: 'Confirmed, 14:00.', after: 6 },
          { by: 'khoa', text: 'Rollback plan is ready if we need it.', after: 14 }
        ]
      },
      { by: 'minh', ago: 7, at: '15:25', text: 'Release 0.9 is live.' },
      { by: 'linh', ago: 7, at: '15:40', text: 'Release notes are published. Highlights: sign in with Google, inbox filters, simpler onboarding.', isPinned: true },
      { by: 'thao', ago: 4, at: '10:05', text: 'One customer reported slow inbox loading on 0.9. Reproduced on a large account, tracked.' },
      { by: 'khoa', ago: 3, at: '14:30', text: 'Hotfix 0.9.1 is staged with an index for the inbox query.' },
      { by: 'minh', ago: 2, at: '11:00', text: 'Hotfix 0.9.1 is live, inbox load time is back under a second.' },
      { by: 'linh', ago: 1, at: '17:05', text: 'Customer demo notes: they liked the filters, asked for saved views. Added to the backlog.' }
    ]
  },
  {
    key: 'random',
    name: 'random',
    topic: 'Everything that is not work',
    isPrivate: false,
    isExisting: true,
    messages: [
      { by: 'mai', ago: 12, at: '12:20', text: 'Anyone tried the new noodle place near the office?' },
      { by: 'huy', ago: 12, at: '12:25', text: 'Yes, the beef pho is excellent. Go before 12:30 or there is a queue.' },
      { by: 'duc', ago: 9, at: '18:05', text: 'Sketching on the train again. Highly recommend it.' },
      {
        by: 'an',
        ago: 6,
        at: '12:40',
        text: 'Board game night on Friday after work? I can bring a couple of games.',
        replies: [
          { by: 'thao', text: 'Count me in.', after: 4 },
          { by: 'khoa', text: 'I will join after the deploy window.', after: 11 }
        ]
      },
      { by: 'thao', ago: 4, at: '09:05', text: 'Coffee machine on the second floor is fixed, in case you were wondering.' },
      { by: 'huy', ago: 2, at: '12:15', text: 'Photos from the last offsite are in the shared album.' },
      { by: 'mai', ago: 1, at: '13:00', text: 'The plant by the window needs a name. Suggestions?' }
    ]
  },
  {
    key: 'leadership',
    name: 'leadership',
    topic: 'Private: planning, budget and hiring',
    isPrivate: true,
    isExisting: false,
    messages: [
      { by: 'admin', ago: 13, at: '08:30', text: 'Q4 priorities: ship saved views, close the two pilot customers, hire one backend engineer.' },
      { by: 'linh', ago: 12, at: '16:15', text: 'Pilot customers are both on track. I will share a status page link this week.' },
      {
        by: 'minh',
        ago: 10,
        at: '17:00',
        text: 'Hiring update: two candidates in interviews for the backend role. I would like to make an offer by the end of next week.',
        replies: [
          { by: 'admin', text: 'Fine with me, send me the approval request when you are ready.', after: 20 },
          { by: 'minh', text: 'Will do.', after: 26 }
        ]
      },
      { by: 'admin', ago: 8, at: '09:10', text: 'Budget check: we are about 6% under plan for the quarter, mostly on travel.' },
      { by: 'duc', ago: 6, at: '14:00', text: 'I would like to book a design workshop for the settings redesign, half a day, maybe in the client room.' },
      { by: 'linh', ago: 6, at: '14:20', text: 'Support it. It fits before the customer call next week.' },
      { by: 'admin', ago: 3, at: '11:45', text: 'Approved. Please keep the workshop under four hours.' },
      { by: 'linh', ago: 1, at: '09:00', text: 'Reminder: monthly 1:1s this week. Please send me your talking points beforehand.' }
    ]
  }
]

export type ResourceKind = 'room' | 'equipment'

export interface ResourceSpec {
  key: string
  name: string
  type: ResourceKind
  capacity?: number
  needsApproval: boolean
  /** Person who approves bookings; only set with needsApproval. */
  approver?: PersonKey
}

export const RESOURCES: ResourceSpec[] = [
  { key: 'big', name: 'Big room', type: 'room', capacity: 12, needsApproval: false },
  { key: 'small', name: 'Small room', type: 'room', capacity: 4, needsApproval: false },
  { key: 'client', name: 'Client room', type: 'room', capacity: 6, needsApproval: true, approver: 'linh' },
  { key: 'projector', name: 'Projector', type: 'equipment', needsApproval: false }
]

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR'

export interface EventSpec {
  key: string
  title: string
  description: string
  /** Wall clock in Vietnam. */
  at: string
  minutes: number
  /** First occurrence: a weekday and how many weeks from this week's (negative = past). */
  day: Weekday
  week: number
  /** Repeat every `every` weeks; absent for a one-off. */
  every?: number
  guests: PersonKey[]
  externalGuests?: string[]
  location?: string
  /** The resource the event books; an event holds one resource. */
  resource?: string
}

export const EVENTS: EventSpec[] = [
  {
    key: 'sync',
    title: 'Team sync',
    description: 'Weekly status across product, design and engineering.',
    at: '09:30',
    minutes: 30,
    day: 'MO',
    week: -3,
    every: 1,
    guests: ['linh', 'minh', 'an', 'huy', 'mai', 'khoa', 'thao', 'duc'],
    resource: 'big'
  },
  {
    key: 'planning',
    title: 'Sprint planning',
    description: 'Commit to the next two weeks of work.',
    at: '10:00',
    minutes: 90,
    day: 'MO',
    week: -2,
    every: 2,
    guests: ['linh', 'minh', 'an', 'huy', 'mai', 'khoa', 'thao', 'duc'],
    resource: 'big'
  },
  {
    key: 'design-review',
    title: 'Design review',
    description: 'Walk through work in progress and decide what ships.',
    at: '14:00',
    minutes: 60,
    day: 'WE',
    week: -2,
    every: 1,
    guests: ['duc', 'linh', 'mai', 'thao'],
    resource: 'small'
  },
  {
    key: 'one-on-one-linh',
    title: '1:1 Linh and Admin',
    description: 'Weekly check-in on priorities and blockers.',
    at: '11:00',
    minutes: 30,
    day: 'TH',
    week: -2,
    every: 1,
    guests: ['linh']
  },
  {
    key: 'one-on-one-minh',
    title: '1:1 Minh and Admin',
    description: 'Engineering health, hiring and roadmap.',
    at: '15:00',
    minutes: 30,
    day: 'TU',
    week: -1,
    every: 2,
    guests: ['minh']
  },
  {
    key: 'customer-call',
    title: 'Customer call: Lotus Logistics',
    description: 'Pilot check-in. Agenda: saved views, onboarding feedback, timeline for the rollout.',
    at: '15:00',
    minutes: 60,
    day: 'TH',
    week: 1,
    guests: ['linh', 'minh', 'duc'],
    externalGuests: ['procurement@lotus.demo.servone.local'],
    resource: 'client'
  },
  {
    key: 'lunch',
    title: 'Team lunch',
    description: 'Lunch together, no agenda.',
    at: '12:00',
    minutes: 90,
    day: 'FR',
    week: 1,
    guests: ['linh', 'minh', 'an', 'huy', 'mai', 'khoa', 'thao', 'duc'],
    location: 'Banh mi 25, 25 Le Loi'
  },
  {
    key: 'go-no-go',
    title: 'Release 1.0 go/no-go',
    description: 'Decide whether the 1.0 candidate ships next week.',
    at: '16:00',
    minutes: 45,
    day: 'FR',
    week: 0,
    guests: ['linh', 'minh', 'thao', 'khoa'],
    resource: 'small'
  },
  {
    key: 'demo-prep',
    title: 'Demo dry run',
    description: 'Rehearse the customer demo with the projector.',
    at: '14:00',
    minutes: 60,
    day: 'TU',
    week: 0,
    guests: ['linh', 'duc', 'minh'],
    resource: 'projector'
  },
  {
    key: 'workshop',
    title: 'Settings redesign workshop',
    description: 'Half-day design workshop on the settings pages.',
    at: '09:00',
    minutes: 180,
    day: 'TU',
    week: 1,
    guests: ['duc', 'linh', 'mai', 'an'],
    resource: 'client'
  }
]

export interface LeaveSpec {
  person: PersonKey
  /** Offsets in days from today for the first and last day off. */
  from: number
  to: number
  state: 'approved' | 'pending'
  note: string
}

export const LEAVES: LeaveSpec[] = [
  { person: 'mai', from: -9, to: -7, state: 'approved', note: 'Family trip to Da Lat' },
  { person: 'thao', from: 8, to: 10, state: 'pending', note: 'Moving apartments' }
]

export interface ItemSpec {
  title: string
  status: string
  by: PersonKey
  /** Days ago the item was filed. */
  ago: number
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent'
  /** Index into the template's task types; default the first. */
  type?: number
}

export interface ApprovalSpec {
  key: string
  template: 'tuyen-dung' | 'mua-hang' | 'it-helpdesk'
  name: string
  department: string
  items: ItemSpec[]
}

export const APPROVALS: ApprovalSpec[] = [
  {
    key: 'hiring',
    template: 'tuyen-dung',
    name: 'Engineering hiring',
    department: 'eng',
    items: [
      { title: 'Bao Tran - Senior Backend Engineer', status: 'Offer', by: 'minh', ago: 12, priority: 'high' },
      { title: 'Quynh Le - Senior Backend Engineer', status: 'Interview', by: 'an', ago: 11, priority: 'high' },
      { title: 'Tuan Vu - Backend Engineer', status: 'Screening', by: 'huy', ago: 6, priority: 'medium' },
      { title: 'Lan Anh Do - QA Engineer', status: 'Screening', by: 'minh', ago: 4, priority: 'medium' },
      { title: 'Hieu Pham - Frontend Engineer', status: 'Hired', by: 'minh', ago: 20, priority: 'medium' },
      { title: 'Nam Truong - Backend Engineer', status: 'Not continued', by: 'an', ago: 15, priority: 'low' },
      { title: 'Vy Ngo - Product Designer', status: 'New', by: 'minh', ago: 1, priority: 'low' }
    ]
  },
  {
    key: 'purchasing',
    template: 'mua-hang',
    name: 'Office purchasing',
    department: 'ops',
    items: [
      { title: '4 standing desks for the second floor', status: 'Awaiting approval', by: 'thao', ago: 3, priority: 'medium' },
      { title: 'Noise-cancelling headsets x6', status: 'Awaiting approval', by: 'khoa', ago: 2, priority: 'low' },
      { title: 'Replacement monitors x3', status: 'Quoting', by: 'khoa', ago: 5, priority: 'medium' },
      { title: 'Whiteboard for the small room', status: 'Requested', by: 'thao', ago: 1, priority: 'low' },
      { title: 'Annual licence for the design tool', status: 'Purchased', by: 'thao', ago: 17, priority: 'high' },
      { title: 'Ergonomic chairs x2', status: 'Purchased', by: 'khoa', ago: 13, priority: 'medium' },
      { title: 'Espresso machine upgrade', status: 'Canceled', by: 'thao', ago: 9, priority: 'low' }
    ]
  },
  {
    key: 'helpdesk',
    template: 'it-helpdesk',
    name: 'IT helpdesk',
    department: 'ops',
    items: [
      { title: 'Cannot connect to office Wi-Fi after the update', status: 'New', by: 'duc', ago: 0.2, priority: 'high' },
      { title: 'Request access to the staging dashboard', status: 'Assigned', by: 'huy', ago: 1, priority: 'medium', type: 1 },
      { title: 'Laptop battery drains in two hours', status: 'In Progress', by: 'mai', ago: 3, priority: 'medium' },
      { title: 'Shared drive is slow on the VPN', status: 'In Progress', by: 'linh', ago: 4, priority: 'high', type: 2 },
      { title: 'Need a second monitor at my desk', status: 'Waiting on requester', by: 'an', ago: 6, priority: 'low', type: 1 },
      { title: 'Printer on floor 2 jams on double-sided jobs', status: 'Resolved', by: 'thao', ago: 8, priority: 'low' },
      { title: 'Password reset for the shared tablet', status: 'Closed', by: 'duc', ago: 12, priority: 'low', type: 1 }
    ]
  }
]

export interface DriveFileSpec {
  name: string
  kind: 'markdown' | 'pdf' | 'png'
  title: string
  lines: string[]
}

export interface DriveFolderSpec {
  name: string
  files: DriveFileSpec[]
}

export const DRIVE_NAME = 'Company'

export const DRIVE_FOLDERS: DriveFolderSpec[] = [
  {
    name: 'Policies',
    files: [
      {
        name: 'Code of conduct.md',
        kind: 'markdown',
        title: 'Code of conduct',
        lines: [
          'Acme Studio is a place where people do their best work. We expect everyone to:',
          '- Treat colleagues, customers and partners with respect.',
          '- Say so early when a deadline or a decision is at risk.',
          '- Keep customer information private and share it only with the people who need it.',
          '- Speak up if something feels wrong. Talk to your lead or to Operations.'
        ]
      },
      {
        name: 'Remote work policy.md',
        kind: 'markdown',
        title: 'Remote work policy',
        lines: [
          'Most roles can work remotely up to two days a week.',
          '- Tell your team in the team channel which days you work from home.',
          '- Be reachable on chat during core hours, 10:00 to 16:00.',
          '- Use the VPN for anything that touches internal systems.'
        ]
      }
    ]
  },
  {
    name: 'Design',
    files: [
      {
        name: 'Brand colors.png',
        kind: 'png',
        title: 'Brand colors',
        lines: []
      },
      {
        name: 'Design principles.md',
        kind: 'markdown',
        title: 'Design principles',
        lines: [
          '1. Make the next step obvious.',
          '2. Show the least that gets the job done.',
          '3. Use the same pattern for the same problem.',
          '4. Accessible by default: contrast, focus and keyboard first.'
        ]
      }
    ]
  },
  {
    name: 'Finance',
    files: [
      {
        name: 'Expense policy.pdf',
        kind: 'pdf',
        title: 'Expense policy',
        lines: [
          'Submit expense reports by the 5th of the following month.',
          'Attach a receipt for every claim over 200,000 VND.',
          'Travel is booked through Operations in advance.',
          'Purchases over 10,000,000 VND need approval first (Approvals, Purchase).'
        ]
      },
      {
        name: 'Q3 budget overview.md',
        kind: 'markdown',
        title: 'Q3 budget overview',
        lines: [
          'Illustrative figures for the demo, in million VND.',
          '- Salaries: 2,400 planned, 2,380 actual.',
          '- Tools and licences: 180 planned, 171 actual.',
          '- Travel: 120 planned, 54 actual.',
          '- Office: 90 planned, 96 actual.'
        ]
      }
    ]
  },
  {
    name: 'Onboarding',
    files: [
      {
        name: 'Welcome to Acme Studio.pdf',
        kind: 'pdf',
        title: 'Welcome to Acme Studio',
        lines: [
          'We are glad you are here.',
          'Day 1: laptop, accounts, and a walk through the workspace.',
          'Week 1: meet your team, ship a small change, join the weekly sync.',
          'Questions? Ask in #general or message Operations.'
        ]
      },
      {
        name: 'First week checklist.md',
        kind: 'markdown',
        title: 'First week checklist',
        lines: [
          '- [ ] Laptop and accounts set up',
          '- [ ] Read the code of conduct and the remote work policy',
          '- [ ] Meet your lead for a first 1:1',
          '- [ ] Join #general and your team channel',
          '- [ ] Book your first week in the calendar'
        ]
      }
    ]
  }
]

export interface DirectSpec {
  /** The other person in the conversation; the admin is always the first member. */
  with: PersonKey
  messages: MessageSpec[]
}

export const DIRECTS: DirectSpec[] = [
  {
    with: 'linh',
    messages: [
      { by: 'linh', ago: 5, at: '10:12', text: 'Do you have 10 minutes today to look at the Lotus Logistics proposal?' },
      { by: 'admin', ago: 5, at: '10:20', text: 'Yes, after lunch works. Send me the draft first.' },
      { by: 'linh', ago: 5, at: '10:24', text: 'Sent to your inbox. The pricing page is the part I am least sure about.' },
      { by: 'admin', ago: 4, at: '09:05', text: 'Read it. Pricing is fine, I would just add the onboarding support to the first tier.' },
      { by: 'linh', ago: 4, at: '09:12', text: 'Agreed, updating it now.' },
      { by: 'admin', ago: 1, at: '17:30', text: 'Great demo today, thank you.' }
    ]
  },
  {
    with: 'minh',
    messages: [
      { by: 'minh', ago: 9, at: '16:45', text: 'Offer for Bao Tran is ready for your review. I will submit the approval tomorrow morning.' },
      { by: 'admin', ago: 9, at: '17:02', text: 'Thanks. Is the salary inside the band we agreed?' },
      { by: 'minh', ago: 9, at: '17:06', text: 'Yes, upper end of the band. She also has a competing offer.' },
      { by: 'admin', ago: 8, at: '08:50', text: 'Understood. Send it over and I will approve it today.' },
      { by: 'minh', ago: 3, at: '14:15', text: 'Quick one: can I take Friday afternoon off? Dentist appointment.' },
      { by: 'admin', ago: 3, at: '14:20', text: 'Of course, just mark it in the calendar.' }
    ]
  },
  {
    with: 'duc',
    messages: [
      { by: 'duc', ago: 6, at: '14:30', text: 'I would like to run a half-day workshop on the settings pages. Can I book the client room?' },
      { by: 'admin', ago: 6, at: '14:40', text: 'Sounds useful. Book it, Linh approves the client room.' },
      { by: 'duc', ago: 6, at: '14:42', text: 'Will do. I will send the agenda beforehand.' },
      { by: 'duc', ago: 2, at: '11:10', text: 'The new brand colors are in Drive under Design if you want to see them.' },
      { by: 'admin', ago: 2, at: '11:25', text: 'Just looked, they look good.' }
    ]
  }
]

export const PEOPLE_KEYS: PersonKey[] = ['admin', 'linh', 'minh', 'an', 'huy', 'mai', 'khoa', 'thao', 'duc']
