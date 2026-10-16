import { buildSocialIdString, SocialIdType, type PersonId } from '@hcengineering/core'

const DECLINED_KEY = 'servone:mail:gmail-prompt-declined'

export function hasGoogleLogin (socialIds: PersonId[]): boolean {
  return socialIds.some((id) => id.startsWith(buildSocialIdString({ type: SocialIdType.GOOGLE, value: '' })))
}

export function isGmailPromptDeclined (): boolean {
  try {
    return localStorage.getItem(DECLINED_KEY) !== null
  } catch {
    return false
  }
}

export function declineGmailPrompt (): void {
  try {
    localStorage.setItem(DECLINED_KEY, '1')
  } catch {
    return
  }
}
