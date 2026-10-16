import Directory from './Directory.svelte'
import OrgChart from './OrgChart.svelte'

export default async (): Promise<{ component: { OrgChart: typeof OrgChart, Directory: typeof Directory } }> => ({
  component: { OrgChart, Directory }
})
