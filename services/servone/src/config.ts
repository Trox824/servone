import { APPROVAL_SERVICE_ID } from '@servone/approvals'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

// The port the deployed servone-mcp Railway service already routes its public domain to.
const DEFAULT_PORT = 4073

function required (name: string): string {
  const envValue = process.env[name]
  if (envValue === undefined || envValue === '') throw new Error(`Missing env variable: ${name}`)
  return envValue
}

function optional (name: string): string | undefined {
  const envValue = process.env[name]
  return envValue === undefined || envValue === '' ? undefined : envValue
}

// Stored without a trailing slash so paths can be appended with `/`.
function url (text: string): string {
  return text.replace(/\/+$/, '')
}

function readPort (): number {
  const text = optional('PORT')
  if (text === undefined) return DEFAULT_PORT
  const port = Number(text)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${text}`)
  return port
}

export type ServiceRole = 'all' | 'mail'

// 'mail' is the servone-mail Railway service: the mail module alone, so IMAP sync restarts and scales apart from MCP.
function readRole (): ServiceRole {
  const text = optional('SERVONE_ROLE')
  if (text === undefined) return 'all'
  if (text === 'mail') return text
  throw new Error(`Invalid SERVONE_ROLE: ${text}`)
}

function oauthClient (prefix: string): { clientId: string, clientSecret: string } | undefined {
  const clientId = optional(`${prefix}_CLIENT_ID`)
  const clientSecret = optional(`${prefix}_CLIENT_SECRET`)
  if (clientId === undefined && clientSecret === undefined) return undefined
  if (clientId === undefined || clientSecret === undefined) throw new Error(`Set both ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET`)
  return { clientId, clientSecret }
}

function discordBot (): { clientId: string, clientSecret: string, botToken: string } | undefined {
  const client = oauthClient('IMPORT_DISCORD')
  const botToken = optional('IMPORT_DISCORD_BOT_TOKEN')
  if (client === undefined && botToken === undefined) return undefined
  if (client === undefined || botToken === undefined) throw new Error('Set IMPORT_DISCORD_CLIENT_ID, IMPORT_DISCORD_CLIENT_SECRET and IMPORT_DISCORD_BOT_TOKEN together')
  return { ...client, botToken }
}

// Planning from a fixed operation vocabulary does not need Opus; Sonnet costs less.
const DEFAULT_AI_MODEL = 'claude-sonnet-5'

const queueRegion = process.env.QUEUE_REGION ?? ''
// Same value as the transactor's MAIL_AUTH_TOKEN, which it sends as a bearer token to mail and web push.
const mailAuthToken = optional('MAIL_AUTH_TOKEN')
const mailServiceUrl = optional('MAIL_SERVICE_URL')
// The stock web push service (hardcoreeng/notification); the transactor's WEB_PUSH_URL points at this service instead.
const notificationUrl = url(required('NOTIFICATION_URL'))

// Module ServiceIds keep the old service names: the dept-channels consumer group and module tokens carry them.
const config = {
  Role: readRole(),
  Port: readPort(),
  Secret: required('SECRET'),
  AccountsUrl: required('ACCOUNTS_URL'),
  KvsUrl: url(required('HULYKVS_URL')),
  // Exact browser origin allowed by CORS on the webhook management API; links in emails and pushes point here too.
  FrontUrl: url(required('FRONT_URL')),
  // Public origin of this service: OAuth issuer, MCP resource id, hook URLs and unsubscribe links derive from it.
  PublicUrl: url(required('PUBLIC_URL')),
  ServiceId: 'servone',
  sentry: {
    Dsn: optional('SENTRY_DSN'),
    Release: optional('RAILWAY_GIT_COMMIT_SHA'),
    Environment: optional('RAILWAY_ENVIRONMENT_NAME')
  },
  mcp: {
    CollaboratorUrl: url(required('COLLABORATOR_URL')),
    // Unset keeps the service running; the Studio assistant then answers not_configured.
    AnthropicApiKey: optional('ANTHROPIC_API_KEY'),
    AiModel: DEFAULT_AI_MODEL,
    ServiceId: 'servone-mcp'
  },
  webhooks: {
    ServiceId: 'servone-webhooks'
  },
  // Seal keys are shared with tracker hooks (TRACKER_HOOKS_KEYS); unset turns app commands off too.
  chatCommands: {
    ServiceId: 'servone-chat-commands'
  },
  forms: {
    ServiceId: 'servone-forms'
  },
  issuesApi: {
    ServiceId: 'servone-issues-api'
  },
  trackerHooks: {
    ServiceId: 'servone-tracker-hooks',
    QueueRegion: queueRegion,
    // Unset turns the module off: no consumer, and the API answers not_configured.
    SealKeys: optional('TRACKER_HOOKS_KEYS')
  },
  chatHooks: {
    ServiceId: 'servone-chat-hooks',
    QueueRegion: queueRegion
  },
  scheduler: {
    MailUrl: url(required('MAIL_URL')),
    MailAuthToken: mailAuthToken,
    // The gate forwards any push without a matching inbox notification, the summary included, so skip the hop.
    WebPushUrl: notificationUrl,
    ServiceId: 'servone-notify-scheduler'
  },
  bugReport: {
    To: required('BUG_REPORT_TO'),
    ResendApiKey: required('RESEND_API_KEY')
  },
  lifecycle: {
    ServiceId: 'servone-lifecycle'
  },
  pushGate: {
    NotificationUrl: notificationUrl,
    AuthToken: mailAuthToken,
    ServiceId: 'servone-push-gate'
  },
  // QUEUE_CONFIG is read by @hcengineering/kafka itself.
  deptChannels: {
    QueueRegion: queueRegion,
    ServiceId: 'servone-dept-channels'
  },
  mail: {
    // Only one replica may sync: kvs has no compare-and-set to build a per-mailbox lease on.
    IsEnabled: optional('MAIL_SYNC_ENABLED') === 'true',
    VaultKeys: optional('MAIL_VAULT_KEYS'),
    // Google "web" OAuth client JSON, the same one the calendar service uses.
    GoogleCredentials: optional('MAIL_GOOGLE_CREDENTIALS'),
    QueueRegion: queueRegion,
    ServiceId: 'servone-mail',
    // Set when mail runs as its own service: this process then forwards /mail/* there instead of syncing.
    ServiceUrl: mailServiceUrl === undefined ? undefined : url(mailServiceUrl)
  },
  issueDates: {
    QueueRegion: queueRegion,
    ServiceId: 'servone-issue-dates'
  },
  handoff: {
    QueueRegion: queueRegion,
    ServiceId: 'servone-handoff'
  },
  rsvp: {
    QueueRegion: queueRegion,
    ServiceId: 'servone-rsvp'
  },
  approvals: {
    QueueRegion: queueRegion,
    ServiceId: APPROVAL_SERVICE_ID
  },
  starter: {
    QueueRegion: queueRegion,
    ServiceId: 'servone-starter',
    CalendarUrl: url(required('CALENDAR_URL'))
  },
  posthog: {
    Key: required('POSTHOG_KEY'),
    Host: 'https://eu.i.posthog.com'
  },
  importConnect: {
    Linear: oauthClient('IMPORT_LINEAR'),
    ClickUp: oauthClient('IMPORT_CLICKUP'),
    Atlassian: oauthClient('IMPORT_ATLASSIAN'),
    Asana: oauthClient('IMPORT_ASANA'),
    Monday: oauthClient('IMPORT_MONDAY'),
    Slack: oauthClient('IMPORT_SLACK'),
    Microsoft: oauthClient('IMPORT_MICROSOFT'),
    Notion: oauthClient('IMPORT_NOTION'),
    TrelloApiKey: optional('IMPORT_TRELLO_API_KEY'),
    Discord: discordBot()
  }
}

// Two processes syncing one mailbox would both write its cards and fight over IMAP flags.
if (config.mail.IsEnabled && config.mail.ServiceUrl !== undefined) throw new Error('Set MAIL_SYNC_ENABLED or MAIL_SERVICE_URL, not both')
if (config.Role === 'mail' && !config.mail.IsEnabled) throw new Error('SERVONE_ROLE=mail needs MAIL_SYNC_ENABLED=true')

export default config
