import TurndownService from 'turndown'

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
turndown.addRule('image', {
  filter: 'img',
  replacement: (_content, node) => {
    const alt = node.getAttribute('alt') ?? ''
    return `[image: ${alt === '' ? 'image' : alt}]`
  }
})

export function htmlToMarkdown (html: string): string {
  return turndown.turndown(html).trim()
}
