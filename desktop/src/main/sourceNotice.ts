import { app } from 'electron'

const SOURCE_REPO_URL = 'https://github.com/servone/huly-epl'

export function setSourceNotice (): void {
  app.setAboutPanelOptions({
    credits: `Built on Huly by Hardcore Engineering Inc., licensed under the Eclipse Public License 2.0. Source code: ${SOURCE_REPO_URL}`,
    website: SOURCE_REPO_URL
  })
}
