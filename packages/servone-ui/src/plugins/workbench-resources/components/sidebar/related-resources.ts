import RelatedPanel from './RelatedPanel.svelte'

export default async (): Promise<{ component: { RelatedPanel: typeof RelatedPanel } }> => ({
  component: { RelatedPanel }
})
