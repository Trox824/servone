import Lich from './components/Lich.svelte'
import NeedsYouSwitcher from '../../workbench-resources/components/sidebar/NeedsYouSwitcher.svelte'

export default async (): Promise<{ component: { Lich: typeof Lich, NeedsYouSwitcher: typeof NeedsYouSwitcher } }> => ({
  component: { Lich, NeedsYouSwitcher }
})
