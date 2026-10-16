import * as checklist from './checklist'
import * as empty from './empty'
import * as login from './login'
import * as setup from './setup'

export const onboardingEn = { ...login.en, ...setup.en, ...checklist.en, ...empty.en }
export const onboardingVi = { ...login.vi, ...setup.vi, ...checklist.vi, ...empty.vi }
