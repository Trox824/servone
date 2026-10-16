import { strToU8, zipSync } from 'fflate'
import { parseNotion } from '../notion'

const ID = '0123456789abcdef0123456789abcdef'
const UUID = '01234567-89ab-cdef-0123-456789abcdef'

function zip (files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, body]) => [path, typeof body === 'string' ? strToU8(body) : body])))
}

describe('parseNotion', () => {
  it('builds a page tree with databases from nested export zips', () => {
    const part = zip({
      [`Roadmap ${ID}.md`]: `# Roadmap\n\nIntro ![Untitled](Roadmap%20${ID}/Untitled.png) and [Specs](Roadmap%20${ID}/Specs%20${ID}.md)\n`,
      [`Roadmap ${ID}/Untitled.png`]: new Uint8Array([1, 2, 3]),
      [`Roadmap ${ID}/Specs ${ID}.md`]: '# Different heading\n\nBody',
      [`Roadmap ${ID}/Tasks ${ID}.csv`]: 'Name,Status\nShip,Done\n',
      [`Roadmap ${ID}/Tasks ${ID}_all.csv`]: 'Name,Status\nShip,Done\n"Plan, | review",Todo\n',
      [`Roadmap ${ID}/Tasks ${ID}/Ship ${ID}.md`]: '# Ship\n\nStatus: Done\n\n![](diagram%20one.png)',
      [`Wiki${UUID}.md`]: '# Wiki\nHome',
      [`Wiki${UUID}/assets/logo.svg`]: '<svg/>'
    })
    const bytes = zip({ [`Export-${UUID}-Part-1.zip`]: part })
    const bundle = parseNotion({ name: 'notion.zip', bytes })

    expect(bundle.projects).toEqual([])
    expect(bundle.channels).toEqual([])
    expect(bundle.warnings).toEqual(['2 images and attachments were not imported'])
    expect(bundle.teamspaces).toHaveLength(1)
    const [teamspace] = bundle.teamspaces
    expect(teamspace.name).toBe('Notion')
    expect(teamspace.docs.map((doc) => doc.title)).toEqual(['Roadmap', 'Wiki'])

    const [roadmap, wiki] = teamspace.docs
    expect(roadmap.markdown).toBe(`Intro [image: Untitled] and [Specs](Roadmap%20${ID}/Specs%20${ID}.md)\n`)
    expect(wiki.markdown).toBe('Home')
    expect(wiki.children).toEqual([])
    expect(roadmap.children.map((doc) => doc.title)).toEqual(['Specs', 'Tasks'])

    const [specs, tasks] = roadmap.children
    expect(specs.markdown).toBe('# Different heading\n\nBody')
    expect(tasks.markdown).toBe('| Name | Status |\n| --- | --- |\n| Ship | Done |\n| Plan, \\| review | Todo |')
    expect(tasks.children).toEqual([{ title: 'Ship', markdown: 'Status: Done\n\n[image: diagram one.png]', children: [] }])
  })

  it('returns no teamspace for an export without pages', () => {
    const bundle = parseNotion({ name: 'notion.zip', bytes: zip({ 'readme.txt': 'hi' }) })
    expect(bundle.teamspaces).toEqual([])
  })
})
