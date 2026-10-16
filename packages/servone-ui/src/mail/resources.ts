import type { Resources } from '@hcengineering/platform'
import MailApp from './components/MailApp.svelte'

export default async (): Promise<Resources> => ({
  component: { MailApp }
})
