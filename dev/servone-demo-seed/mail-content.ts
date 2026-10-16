export const ADMIN_MAIL = 'admin@acmestudio.co'

export type MailFolderKey = 'inbox' | 'important' | 'sent' | 'archive' | 'spam' | 'trash' | 'drafts'

export interface MailFolderSpec {
  key: MailFolderKey
  path: string
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'other'
}

export const MAIL_FOLDERS: MailFolderSpec[] = [
  { key: 'inbox', path: 'INBOX', role: 'inbox' },
  { key: 'sent', path: 'Sent', role: 'sent' },
  { key: 'drafts', path: 'Drafts', role: 'drafts' },
  { key: 'archive', path: 'Archive', role: 'archive' },
  { key: 'spam', path: 'Spam', role: 'spam' },
  { key: 'trash', path: 'Trash', role: 'trash' },
  { key: 'important', path: 'Important', role: 'other' }
]

export interface MailAttachmentSpec {
  name: string
  title: string
  lines: string[]
}

export interface MailSpec {
  from: string
  to: string[]
  cc?: string[]
  ago: number
  at: string
  body: string[]
  isRead?: boolean
  attachment?: MailAttachmentSpec
}

export interface MailThreadSpec {
  key: string
  subject: string
  folders: MailFolderKey[]
  isStarred?: boolean
  messages: MailSpec[]
}

const LINH = 'Linh Tran <linh@acmestudio.co>'
const MINH = 'Minh Nguyen <minh@acmestudio.co>'
const THAO = 'Thao Bui <thao@acmestudio.co>'
const KHOA = 'Khoa Dang <khoa@acmestudio.co>'
const TEAM = 'Acme Studio team <team@acmestudio.co>'
const HOA = 'Hoa Nguyen <hoa.nguyen@lotuslogistics.test>'
const BAO = 'Bao Tran <baotran.dev@mailbox.test>'
const VY = 'Vy Ngo <vy.ngo.design@mailbox.test>'

export const MAIL_THREADS: MailThreadSpec[] = [
  {
    key: 'lotus-agenda',
    subject: 'Agenda for Thursday\'s pilot check-in',
    folders: ['inbox', 'important'],
    isStarred: true,
    messages: [
      {
        from: HOA,
        to: ['admin'],
        cc: [LINH],
        ago: 1,
        at: '16:05',
        isRead: true,
        body: [
          'Hi,',
          'Ahead of next Thursday, here is what our side would like to cover in the hour:',
          '1. Saved views for the dispatch team. Two of our leads asked for it again this week.',
          '2. Onboarding feedback from the warehouse staff, mostly about the first-day checklist.',
          '3. A realistic date for rolling out to the second depot.',
          'Three of us will join: me, our ops manager and someone from IT.',
          'Best,\nHoa'
        ]
      },
      {
        from: 'admin',
        to: [HOA],
        cc: [LINH],
        ago: 1,
        at: '16:40',
        body: [
          'Thanks Hoa, that works. We have booked the client room at our office, and Linh will bring a preview of saved views.',
          'For the rollout date, we will come with a plan for the second depot, not just a date.'
        ]
      },
      {
        from: HOA,
        to: ['admin'],
        cc: [LINH],
        ago: 0,
        at: '09:12',
        isRead: false,
        body: [
          'Perfect. One more thing: could you send the onboarding checklist you mentioned before the call? Our IT lead wants to check the account setup steps.',
          'Hoa'
        ]
      }
    ]
  },
  {
    key: 'bao-offer',
    subject: 'Re: Offer - Senior Backend Engineer',
    folders: ['inbox', 'important'],
    messages: [
      {
        from: BAO,
        to: ['admin'],
        cc: [MINH],
        ago: 0,
        at: '08:31',
        isRead: false,
        body: [
          'Hi,',
          'Thank you again for the offer. I have signed it and attached a copy.',
          'My notice period ends on 30 October, so I can start on Monday 2 November. Please let me know what I need to bring on the first day.',
          'Looking forward to working with the team,\nBao'
        ],
        attachment: {
          name: 'Offer letter - Bao Tran (signed).pdf',
          title: 'Offer letter - Bao Tran',
          lines: ['Position: Senior Backend Engineer', 'Start date: Monday 2 November 2026', 'Signed by the candidate on 7 October 2026']
        }
      }
    ]
  },
  {
    key: 'headsets-quote',
    subject: 'Quote: noise-cancelling headsets x6',
    folders: ['inbox'],
    messages: [
      {
        from: KHOA,
        to: ['admin'],
        ago: 2,
        at: '10:05',
        isRead: false,
        body: [
          'Hi, I got two quotes for the six headsets. The cheaper one has a two-week lead time, the other ships Friday.',
          'Both are in the Office purchasing request. It needs your approval before I can order.'
        ]
      }
    ]
  },
  {
    key: 'desks-quote',
    subject: 'Quotation for 4 standing desks (second floor)',
    folders: ['inbox'],
    messages: [
      {
        from: 'Quan Le <sales@bamboofurniture.test>',
        to: ['admin'],
        cc: [THAO],
        ago: 1,
        at: '14:20',
        isRead: true,
        body: [
          'Dear Acme Studio team,',
          'Please find attached our quotation for four electric standing desks, 140 x 70 cm, with delivery and assembly on the second floor.',
          'The quote is valid for 14 days. We can deliver within 5 working days of confirmation.',
          'Kind regards,\nQuan Le, Bamboo Furniture'
        ],
        attachment: {
          name: 'Quotation BF-2026-1043.pdf',
          title: 'Quotation BF-2026-1043',
          lines: ['4 x electric standing desk, 140 x 70 cm', 'Delivery and assembly, floor 2', 'Valid for 14 days']
        }
      }
    ]
  },
  {
    key: 'vy-application',
    subject: 'Application: Product Designer',
    folders: ['inbox'],
    messages: [
      {
        from: VY,
        to: ['admin'],
        ago: 1,
        at: '11:48',
        isRead: false,
        body: [
          'Hello,',
          'I would like to apply for the Product Designer role. I have spent four years designing internal tools for logistics and retail teams.',
          'My portfolio is attached, with two case studies on onboarding flows.',
          'Thank you for your time,\nVy Ngo'
        ],
        attachment: {
          name: 'Vy Ngo - Portfolio 2026.pdf',
          title: 'Vy Ngo - Portfolio',
          lines: ['Case study 1: Warehouse onboarding', 'Case study 2: Field sales app', 'Contact: vy.ngo.design@mailbox.test']
        }
      }
    ]
  },
  {
    key: 'status-page',
    subject: 'Lotus pilot: status page link',
    folders: ['inbox'],
    messages: [
      {
        from: LINH,
        to: ['admin'],
        ago: 1,
        at: '17:20',
        isRead: true,
        body: [
          'Here is the status page I promised for both pilots. It updates from the release checklist, so nobody has to maintain it by hand.',
          'Can you forward it to Hoa before Thursday?'
        ]
      }
    ]
  },
  {
    key: 'thao-leave',
    subject: 'Leave next week: handover notes',
    folders: ['inbox'],
    messages: [
      {
        from: THAO,
        to: ['admin'],
        ago: 2,
        at: '15:30',
        isRead: true,
        body: [
          'I sent a leave request for next week in Calendar. Handover notes:',
          'The headset and desk orders are with Khoa. The printer contract renewal is in Drive under Finance. Nothing else is waiting on me.'
        ]
      }
    ]
  },
  {
    key: 'power-maintenance',
    subject: 'Floor 2 power maintenance this Saturday',
    folders: ['inbox'],
    messages: [
      {
        from: 'Building Management <office@riversidetower.test>',
        to: ['admin'],
        ago: 1,
        at: '09:05',
        isRead: true,
        body: [
          'Dear tenants of floor 2,',
          'Power will be off on Saturday from 08:00 to 14:00 for scheduled maintenance. Please shut down any equipment that stays on over the weekend.',
          'Riverside Tower management office'
        ]
      },
      {
        from: 'admin',
        to: [TEAM],
        ago: 1,
        at: '17:00',
        body: ['Heads up: the office has no power on Saturday 08:00 to 14:00. Please shut down your desktops before you leave on Friday.']
      }
    ]
  },
  {
    key: 'invoices',
    subject: 'September invoices ready for review',
    folders: ['inbox', 'important'],
    messages: [
      {
        from: 'Ngoc Anh <ngocanh@brightledger.test>',
        to: ['admin'],
        ago: 3,
        at: '10:12',
        isRead: true,
        body: [
          'Hi,',
          'The September invoice summary is attached. Two supplier invoices are missing a tax code, highlighted in yellow.',
          'Could you confirm them by Friday so we can close the month?',
          'Ngoc Anh, Bright Ledger Accounting'
        ],
        attachment: {
          name: 'September 2026 invoice summary.pdf',
          title: 'September 2026 invoice summary',
          lines: ['18 supplier invoices', '2 missing tax codes', 'Due for review by Friday']
        }
      }
    ]
  },
  {
    key: 'kite-feedback',
    subject: 'Onboarding feedback from our store managers',
    folders: ['inbox'],
    messages: [
      {
        from: 'Phuong Do <phuong.do@kitepharmacy.test>',
        to: ['admin'],
        cc: [LINH],
        ago: 5,
        at: '13:40',
        isRead: true,
        body: [
          'Hello Acme team,',
          'We collected feedback from our six store managers after the first two weeks. The short version: the task list is easy, the approval step for stock orders is the favourite, and two managers want the mobile view to load faster.',
          'Full notes below. Happy to talk through them on our next call.',
          'Phuong'
        ]
      }
    ]
  },
  {
    key: 'fiber',
    subject: 'Scheduled maintenance on your office fiber line',
    folders: ['inbox'],
    messages: [
      {
        from: 'Saigon Fiber Support <support@saigonfiber.test>',
        to: ['admin'],
        ago: 4,
        at: '08:15',
        isRead: true,
        body: ['We will upgrade equipment in your area on 14 October between 01:00 and 03:00. Your connection may drop for up to 15 minutes.']
      }
    ]
  },
  {
    key: 'insurance',
    subject: 'Team health insurance renewal for 2027',
    folders: ['inbox'],
    messages: [
      {
        from: 'Linh Chi <renewals@careplus-insurance.test>',
        to: ['admin'],
        ago: 6,
        at: '09:30',
        isRead: true,
        body: ['Your group policy renews on 1 January. Please send the updated headcount by 31 October so we can prepare the 2027 quote.']
      }
    ]
  },
  {
    key: 'licence-receipt',
    subject: 'Receipt for your annual design tool licence',
    folders: ['archive'],
    messages: [
      {
        from: 'Plume Billing <billing@plume.test>',
        to: ['admin'],
        ago: 16,
        at: '07:55',
        isRead: true,
        body: ['Thanks for renewing. Your annual licence for 3 seats is active until October 2027. This receipt is for your records.']
      }
    ]
  },
  {
    key: 'hieu-welcome',
    subject: 'Welcome aboard, Hieu',
    folders: ['archive'],
    messages: [
      {
        from: 'admin',
        to: [TEAM],
        ago: 20,
        at: '09:00',
        body: ['Please welcome Hieu Pham, who joins Engineering as a frontend engineer today. Say hi in #general.']
      }
    ]
  },
  {
    key: 'q3-budget',
    subject: 'Q3 budget sign-off',
    folders: ['archive'],
    messages: [
      {
        from: MINH,
        to: ['admin'],
        ago: 22,
        at: '16:10',
        isRead: true,
        body: ['Engineering is within budget for Q3. The only overrun is the second staging server, about 4% over plan.']
      }
    ]
  },
  {
    key: 'spam-seo',
    subject: 'Rank #1 on Google in 7 days, guaranteed',
    folders: ['spam'],
    messages: [
      {
        from: 'Growth Team <hello@rankfast.test>',
        to: ['admin'],
        ago: 2,
        at: '03:12',
        isRead: false,
        body: ['We noticed your website is not on the first page. Reply YES for a free audit.']
      }
    ]
  },
  {
    key: 'spam-domain',
    subject: 'Final notice: domain listing renewal',
    folders: ['spam'],
    messages: [
      {
        from: 'Domain Listing Services <notice@domain-listing.test>',
        to: ['admin'],
        ago: 4,
        at: '02:40',
        isRead: false,
        body: ['Your listing for acmestudio.co expires soon. Pay the renewal fee to keep it active.']
      }
    ]
  }
]
