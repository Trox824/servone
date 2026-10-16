import ELK from 'elkjs/lib/elk-api'
import type { RunLayout } from './layout'

let elk: InstanceType<typeof ELK> | undefined

export const runLayout: RunLayout = async (graph) => {
  elk ??= new ELK({ workerFactory: () => new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)) })
  return await elk.layout(graph)
}
