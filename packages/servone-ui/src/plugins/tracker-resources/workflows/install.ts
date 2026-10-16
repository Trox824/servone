import { addLocation, addStringsLoader, getMetadata, loadMetadata, setMetadata, type Metadata } from '@hcengineering/platform'
import type { Project } from '@hcengineering/tracker'
import type { Application, NavigatorModel } from '@hcengineering/workbench'
import { issueAppPath } from './links'
import { extendNavModel } from './nav'
import { en as onboardingEn, onboardingId, vi as onboardingVi } from './onboarding/strings'
import { workflowIcon, workflowId } from './plugin'
import { en, vi } from './strings'

const NAV_EXTENDER = 'servone:metadata:NavModelExtender' as Metadata<(app: Application, model: NavigatorModel | undefined) => NavigatorModel | undefined>

const ISSUE_APP_PATH = 'servone:metadata:IssueAppPath' as Metadata<(project: Project) => [alias: string, special: string] | undefined>

export function installWorkflows (): void {
  addLocation(workflowId, async () => await import(/* webpackChunkName: "servone-workflow" */ './resources'))
  addStringsLoader(workflowId, async (lang: string) => ({ string: lang === 'vi' ? vi : en }))
  addStringsLoader(onboardingId, async (lang: string) => ({ string: lang === 'vi' ? onboardingVi : onboardingEn }))
  const sprite = require('./assets/icons.svg') as string // eslint-disable-line
  loadMetadata({ workflow: workflowIcon }, { workflow: `${sprite}#workflow` })
  const previous = getMetadata(NAV_EXTENDER)
  setMetadata(NAV_EXTENDER, (app, model) => extendNavModel(app, previous?.(app, model) ?? model))
  setMetadata(ISSUE_APP_PATH, issueAppPath)
}

installWorkflows()
