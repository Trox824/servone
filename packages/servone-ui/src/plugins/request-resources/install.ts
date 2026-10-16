import { addLocation, addStringsLoader, type Plugin } from '@hcengineering/platform'
import { approvalId, en, vi, waitingApprovalMessage } from './strings'
import * as route from './route-strings'

const servoneId = 'servone' as Plugin

export function installApprovals (): void {
  addLocation(approvalId, async () => await import(/* webpackChunkName: "servone-approval" */ './resources'))
  addStringsLoader(approvalId, async (lang: string) => ({ string: lang === 'vi' ? vi : en }))
  addStringsLoader(route.routeStringsId, async (lang: string) => ({ string: lang === 'vi' ? route.vi : route.en }))
  addStringsLoader(servoneId, async (lang: string) => ({
    status: { WaitingApproval: lang === 'vi' ? waitingApprovalMessage.vi : waitingApprovalMessage.en }
  }))
}

installApprovals()
