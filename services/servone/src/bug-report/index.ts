import { SocialIdType } from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'

import config from '../config'
import type { RequestHandler } from '../router'
import { authenticate } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { createBugReportHandler } from './http'
import type { ReportMail, Reporter } from './report'

const REPORTS_PER_HOUR = 5
const SECONDS_PER_HOUR = 3600
const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const REPORT_FROM = 'Servone <no-reply@servone.app>'

async function reporterOf (token: string, workspaceUuid: string): Promise<Reporter> {
  const accounts = getAccountClient(token)
  const [person, socialIds, workspace] = await Promise.all([accounts.getPerson(), accounts.getSocialIds(), accounts.getWorkspaceInfo(false)])
  const email = socialIds.find((socialId) => socialId.type === SocialIdType.EMAIL && socialId.isDeleted !== true)
  return { name: `${person.firstName} ${person.lastName}`.trim(), email: email?.value, workspaceName: workspace.name, workspaceUuid }
}

async function sendMail (mail: ReportMail): Promise<boolean> {
  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.bugReport.ResendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REPORT_FROM, to: mail.to, subject: mail.subject, text: mail.text, reply_to: mail.replyTo, attachments: mail.attachments })
    })
    return response.ok
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

export function createBugReport (): RequestHandler {
  return createBugReportHandler({
    frontUrl: config.FrontUrl,
    to: config.bugReport.To,
    buckets: new TokenBuckets(REPORTS_PER_HOUR, REPORTS_PER_HOUR / SECONDS_PER_HOUR),
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    reporterOf: async (token, caller) => await reporterOf(token, caller.workspace),
    sendMail
  })
}
