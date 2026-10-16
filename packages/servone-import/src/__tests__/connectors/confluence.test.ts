import { confluenceConnector } from '../../connectors/confluence'
import type { ApiCall, ApiRequest, Json } from '../../types'

const CLOUD = 'cloud-1'
const SPACES = `/ex/confluence/${CLOUD}/wiki/api/v2/spaces`
const PAGES = `${SPACES}/100/pages`

const RICH = [
  '<h2>Setup</h2>',
  '<p>See <ac:link><ri:page ri:content-title="Runbook" /><ac:plain-text-link-body><![CDATA[the runbook]]></ac:plain-text-link-body></ac:link> and ask <ac:link><ri:user ri:account-id="5b10" /></ac:link></p>',
  '<ac:structured-macro ac:name="toc" ac:schema-version="1" ac:macro-id="m1" />',
  '<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body><p>Heads up</p>',
  '<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">js</ac:parameter><ac:plain-text-body><![CDATA[if (a < b) run()]]></ac:plain-text-body></ac:structured-macro>',
  '</ac:rich-text-body></ac:structured-macro>',
  '<p><ac:image ac:alt="diagram"><ri:attachment ri:filename="arch.png" /></ac:image></p>',
  '<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>Book room</ac:task-body></ac:task></ac:task-list>',
  '<ac:structured-macro ac:name="view-file"><ac:parameter ac:name="name"><ri:attachment ri:filename="plan.pdf" /></ac:parameter></ac:structured-macro>',
  '<p>Due <time datetime="2026-03-01" /></p>'
].join('')

const page = (id: string, title: string, parentId: string | null, position: number, storage = `<p>${title} body</p>`): Json => ({
  id,
  status: 'current',
  title,
  spaceId: '100',
  parentId,
  parentType: parentId === null ? null : 'page',
  position,
  authorId: 'u1',
  createdAt: '2026-01-02T10:00:00.000Z',
  version: { number: 1 },
  body: { storage: { representation: 'storage', value: storage } },
  _links: { webui: `/spaces/ENG/pages/${id}` }
})

function param (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function answer (request: ApiRequest): Json {
  switch (request.path) {
    case '/oauth/token/accessible-resources':
      return [{ id: CLOUD, name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:page:confluence'], avatarUrl: '' }]
    case SPACES:
      return param(request, 'cursor') === undefined
        ? { results: [{ id: '100', key: 'ENG', name: 'Engineering', type: 'global', status: 'current', homepageId: 'p0' }], _links: { next: '/wiki/api/v2/spaces?cursor=s2&limit=250', base: 'https://acme.atlassian.net/wiki' } }
        : { results: [{ id: '200', key: '~ana', name: 'Ana Silva', type: 'personal', status: 'current', homepageId: 'h2' }], _links: { base: 'https://acme.atlassian.net/wiki' } }
    case PAGES:
      expect(param(request, 'body-format')).toBe('storage')
      return param(request, 'cursor') === undefined
        ? { results: [page('p0', 'Home', null, 0), page('p1', 'Guides', 'p0', 2, RICH), page('p2', 'Intro', 'p0', 1)], _links: { next: '/wiki/api/v2/spaces/100/pages?body-format=storage&cursor=c2' } }
        : { results: [page('p3', 'Deploy', 'p1', 0)], _links: {} }
    default:
      throw new Error(`unexpected ${request.path}`)
  }
}

const api: ApiCall = async (request) => ({ status: 200, body: answer(request) })

describe('confluenceConnector', () => {
  it('lists spaces across pages and preselects team spaces', async () => {
    await expect(confluenceConnector.listScopes(api)).resolves.toEqual([
      { id: `${CLOUD}/100`, name: 'Engineering', kind: 'space', parentName: 'acme', isSelected: true },
      { id: `${CLOUD}/200`, name: 'Ana Silva', kind: 'space', parentName: 'acme', isSelected: false }
    ])
  })

  it('builds the page tree and converts storage format', async () => {
    const progress = jest.fn()
    const bundle = await confluenceConnector.fetch(api, [`${CLOUD}/100`], progress, new AbortController().signal)
    expect(progress).toHaveBeenLastCalledWith({ label: 'Engineering', count: 4 })
    expect(bundle.teamspaces).toHaveLength(1)
    const { name, docs } = bundle.teamspaces[0]
    expect(name).toBe('Engineering')
    expect(docs.map((doc) => doc.title)).toEqual(['Home', 'Intro', 'Guides'])
    const guides = docs[2]
    expect(guides.children.map((doc) => doc.title)).toEqual(['Deploy'])
    expect(guides.markdown).toBe([
      '## Setup',
      'See the runbook and ask @user',
      '> Heads up\n> \n> ```js\n> if (a < b) run()\n> ```',
      '[image: diagram]',
      '-   [x] Book room',
      '[file: plan.pdf]',
      'Due 2026-03-01'
    ].join('\n\n'))
    expect(bundle.warnings).toEqual(['2 images and attachments were not imported', 'Confluence macros were left out: toc'])
  })
})
