import { getCurrentLocation, navigate } from '@hcengineering/ui'
import { describe, type ChangeRecord } from '@servone/config'
import { mount, unmount } from 'svelte'
import DiffDialog from './components/DiffDialog.svelte'
import type { StudioContext } from './extensions'
import { cardViewPath } from './graph/routes'
import { archivePhrase } from './header'
import { showPending, showUndoToast, studioSession, typeDoc } from './huly'
import type { StudioRoute } from './routes'
import { createStudioContext } from './studio-context'

export function pageStudio (): StudioContext {
  const session = studioSession()

  async function confirm (change: ChangeRecord, phrase: string | undefined): Promise<boolean> {
    const archiveName = phrase === undefined ? archivePhrase(change, await describe(session)) : undefined
    return await new Promise<boolean>((resolve) => {
      const dialog = mount(DiffDialog, {
        target: document.body,
        props: {
          request: { change, phrase: phrase ?? archiveName, resolve },
          onDone: () => {
            void unmount(dialog)
          }
        }
      })
    })
  }

  function open (route: StudioRoute): void {
    const tag = route.kind === 'type' ? typeDoc(route.typeKey) : undefined
    const loc = getCurrentLocation()
    loc.path = cardViewPath(loc.path, tag === undefined ? { kind: 'relations' } : { kind: 'canvas', tagId: tag._id, nodeId: undefined })
    navigate(loc)
  }

  const studio = createStudioContext({
    session,
    ui: {
      confirm,
      applied: (change) => {
        showUndoToast(change, () => {
          void studio.undo(change.id)
        })
      },
      pending: showPending
    },
    reload: async () => {},
    open
  })
  return studio
}
