import { workspaceId } from '@hcengineering/ui'
import { get, writable } from 'svelte/store'
import { AssistantError, canSend, initialAssistant, requestFor, withFailure, withQuestion, withReply } from './assistant'
import { askAssistant } from './assistant-client'

export const assistantChat = writable(initialAssistant())

workspaceId.subscribe(() => {
  assistantChat.set(initialAssistant())
})

export async function sendQuestion (question: string, typeKey: string | undefined): Promise<void> {
  if (!canSend(get(assistantChat), question)) return
  assistantChat.update((current) => withQuestion(current, question))
  try {
    const answer = await askAssistant(requestFor(get(assistantChat), typeKey))
    assistantChat.update((current) => withReply(current, answer))
  } catch (err) {
    if (!(err instanceof AssistantError)) {
      assistantChat.update((current) => withFailure(current, 'failed'))
      throw err
    }
    const code = err.code
    assistantChat.update((current) => withFailure(current, code))
  }
}
