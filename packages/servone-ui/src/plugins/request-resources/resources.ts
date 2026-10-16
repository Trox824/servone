import ApprovalActivity from './components/ApprovalActivity.svelte'

export default async (): Promise<{ component: { ApprovalActivity: typeof ApprovalActivity } }> => ({
  component: { ApprovalActivity }
})
