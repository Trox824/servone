//
// Seed content: the people, epics and issue titles of a believable product team. Pure data.
//

export type Role = 'pm' | 'dev' | 'qa' | 'design'

export interface PersonSpec {
  key: string
  first: string
  last: string
  role: Role
  /** Share of a full-time developer's sprint capacity (0 for people who don't take dev work). */
  capacity: number
}

/** Demo teammates. They exist as workspace people only (no login); the domain marks them for --wipe. */
export const DEMO_DOMAIN = 'demo.servone.local'

export const PEOPLE: PersonSpec[] = [
  { key: 'linh', first: 'Linh', last: 'Tran', role: 'pm', capacity: 0 },
  { key: 'minh', first: 'Minh', last: 'Nguyen', role: 'dev', capacity: 1 },
  { key: 'an', first: 'An', last: 'Pham', role: 'dev', capacity: 1 },
  { key: 'huy', first: 'Huy', last: 'Le', role: 'dev', capacity: 1 },
  { key: 'mai', first: 'Mai', last: 'Vo', role: 'dev', capacity: 0.9 },
  { key: 'khoa', first: 'Khoa', last: 'Dang', role: 'dev', capacity: 0.8 },
  { key: 'thao', first: 'Thao', last: 'Bui', role: 'qa', capacity: 0 },
  { key: 'duc', first: 'Duc', last: 'Hoang', role: 'design', capacity: 0.4 }
]

export interface EpicSpec {
  key: string
  title: string
  /** Sprints the epic is planned into (1-based, inclusive). Beyond the future sprints = backlog only. */
  from: number
  to: number
  stories: string[]
  tasks: string[]
  bugs: string[]
}

export const EPICS: EpicSpec[] = [
  {
    key: 'sso',
    title: 'Sign-in & SSO',
    from: 1,
    to: 3,
    stories: [
      'Sign in with Google Workspace',
      'Sign in with Microsoft Entra ID',
      'Magic link sign-in by email',
      'Remember this device for 30 days',
      'Force SSO for a workspace',
      'Session list with "sign out everywhere"'
    ],
    tasks: [
      'OIDC discovery and token refresh',
      'Rate-limit the sign-in endpoint',
      'Audit log entry for every sign-in',
      'Migrate password hashes to argon2id'
    ],
    bugs: [
      'Magic link expires after 2 minutes instead of 15',
      'Microsoft sign-in loops when the tenant blocks consent',
      'Sign-out leaves the websocket connected'
    ]
  },
  {
    key: 'onboarding',
    title: 'Workspace onboarding',
    from: 1,
    to: 4,
    stories: [
      'Create a workspace in three steps',
      'Invite teammates by email or link',
      'Import members from a CSV file',
      'Pick modules during setup',
      'Sample project for new workspaces',
      'Welcome checklist on the home screen'
    ],
    tasks: [
      'Workspace name and URL validation',
      'Invite email template in Vietnamese and English',
      'Track onboarding funnel events'
    ],
    bugs: [
      'Invite link works after the invite is revoked',
      'CSV import fails on names with diacritics',
      'Checklist progress resets after reload'
    ]
  },
  {
    key: 'billing',
    title: 'Billing & plans',
    from: 3,
    to: 6,
    stories: [
      'Plan picker with monthly and yearly prices',
      'Pay by card through Stripe Checkout',
      'Pay by bank transfer with VietQR',
      'Download invoices as PDF',
      'Seat-based pricing with proration',
      'Upgrade prompt when a limit is reached',
      'Cancel plan and keep data read-only'
    ],
    tasks: [
      'Stripe webhook handler with idempotency keys',
      'VAT (e-invoice) fields on the billing profile',
      'Nightly job to reconcile subscriptions',
      'Billing admin role and permissions'
    ],
    bugs: [
      'Proration charges a full month for mid-cycle seats',
      'Invoice PDF shows the wrong currency symbol for VND',
      'Webhook retries create duplicate invoices'
    ]
  },
  {
    key: 'notifications',
    title: 'Notifications',
    from: 4,
    to: 7,
    stories: [
      'Inbox with unread, mentions and assigned tabs',
      'Email digest of unread notifications',
      'Per-project notification settings',
      'Snooze a notification until tomorrow',
      'Desktop push notifications',
      'Mark all as read'
    ],
    tasks: [
      'Batch notification writes in one transaction',
      'Unsubscribe link in every email',
      'Move digest sending to a queue worker'
    ],
    bugs: [
      'Mentions in edited comments do not notify',
      'Digest email sent twice on Mondays',
      'Unread badge stays at 1 after reading everything'
    ]
  },
  {
    key: 'search',
    title: 'Global search',
    from: 5,
    to: 8,
    stories: [
      'Search issues, docs and messages from Cmd-K',
      'Filter search results by type and project',
      'Vietnamese search without diacritics',
      'Recent searches and suggestions',
      'Search inside attached PDFs'
    ],
    tasks: [
      'Reindex job for existing workspaces',
      'Highlight matched words in results',
      'Search latency dashboard'
    ],
    bugs: [
      'Search returns archived projects',
      'Typing fast shows results for an older query',
      '"Nguyễn" does not match "Nguyen"'
    ]
  },
  {
    key: 'chat',
    title: 'Chat reliability',
    from: 2,
    to: 7,
    stories: ['Show "sending…" and retry for failed messages', 'Offline queue for messages', 'Edit history for messages'],
    tasks: [
      'Reconnect the websocket with backoff',
      'Load older messages in pages of 50',
      'Measure message delivery time'
    ],
    bugs: [
      'Messages arrive out of order after reconnect',
      'Scroll jumps to the top when an image loads',
      'Thread reply count is off by one',
      'Emoji picker covers the input on small screens'
    ]
  },
  {
    key: 'perf',
    title: 'Performance',
    from: 6,
    to: 9,
    stories: ['Issue list opens in under one second for 5k issues', 'Keep the app responsive during large imports'],
    tasks: [
      'Split the main bundle by module',
      'Virtualize long issue lists',
      'Cache the workspace model in IndexedDB',
      'Profile and fix slow Mongo queries',
      'Lazy-load the calendar module'
    ],
    bugs: ['Memory grows on every project switch', 'Kanban drag stutters with 300 cards']
  },
  {
    key: 'calendar',
    title: 'Calendar sync',
    from: 7,
    to: 9,
    stories: [
      'Two-way sync with Google Calendar',
      'Show teammates’ busy time when scheduling',
      'Meeting links added to events automatically',
      'Working hours and time zone per person'
    ],
    tasks: ['Google Calendar push channel renewal', 'Recurring event exceptions', 'Sync status in settings'],
    bugs: ['All-day events shift by one day in UTC+7', 'Deleted Google events stay in Servone']
  },
  {
    key: 'admin',
    title: 'Admin console',
    from: 8,
    to: 10,
    stories: [
      'List and deactivate members',
      'Workspace usage and storage report',
      'Export the whole workspace',
      'Role templates for new members'
    ],
    tasks: ['Admin API with audit trail', 'Storage quota enforcement'],
    bugs: []
  },
  {
    key: 'github',
    title: 'GitHub integration',
    from: 10,
    to: 12,
    stories: [
      'Link pull requests to issues by key',
      'Move issue to In Review when a PR opens',
      'Close issue when the PR merges',
      'Show CI status on the issue'
    ],
    tasks: ['GitHub App installation flow', 'Webhook signature check'],
    bugs: []
  },
  {
    key: 'reports',
    title: 'Reporting dashboards',
    from: 11,
    to: 13,
    stories: ['Cycle time chart per project', 'Workload by person', 'Export any report as CSV'],
    tasks: ['Daily snapshot job for issue counts'],
    bugs: []
  }
]

export const SPRINT_GOALS: string[] = [
  'Ship Google and Microsoft sign-in',
  'Teams can onboard without help',
  'Close out onboarding; start billing',
  'Take the first payment',
  'Billing live; notifications inbox',
  'Search MVP in Cmd-K',
  'Notifications done; calendar sync beta',
  'Search in Vietnamese; admin console basics',
  'Performance pass before launch'
]

/** Bugs QA files outside any epic plan, drawn from as sprints go. */
export const LOOSE_BUGS: string[] = [
  'Tooltip text cut off in the sidebar',
  'Date picker opens behind the dialog',
  'Dark mode: unreadable text on warning banners',
  'Avatar upload rejects PNG files over 2 MB',
  'Wrong week start in Vietnamese locale',
  'Copy link button copies the old URL',
  'Settings page flickers on first load',
  'Keyboard focus lost after closing a popup',
  'Long project names overflow the header',
  'Attachment preview fails for HEIC photos',
  'Status dropdown shows statuses of another project',
  'Paste from Excel inserts an image instead of text'
]

export const COMMENTS = {
  start: ['Picking this up.', 'Starting on this today.', 'On it — will post a draft PR by tomorrow.'],
  review: [
    'PR is up, can someone take a look?',
    'Ready for review. Screenshots in the PR.',
    'Done on my side — needs a review.',
    'Pushed the fix, please review.'
  ],
  verified: ['Verified on staging ✅', 'Checked on staging, works as expected.', 'Looks good, closing.'],
  reopen: [
    'Found an edge case: the empty state is not handled. Sending back.',
    'Fails on Safari — reopening.',
    'Works, but the error message is still in English. Reopening.'
  ],
  question: [
    'Can we split this? It feels bigger than the estimate.',
    'Do we need this before the demo on Friday?',
    'Is there a design for the error state?',
    'Blocked on the API change, waiting for review.'
  ],
  answer: ['Yes, let’s split it after this sprint.', 'Not blocking the demo, next sprint is fine.', 'Added the design to the Figma file.'],
  rollover: ['Moving to the next sprint, we ran out of time.', 'Carrying over — review took longer than planned.']
}
