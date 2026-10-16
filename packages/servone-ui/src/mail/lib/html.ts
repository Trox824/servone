export interface PreparedHtml {
  srcdoc: string
  hasRemoteImages: boolean
}

const STRIPPED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base']
const REMOTE_URL = /^\s*(https?:|[\\/]{2})/i
const DANGEROUS_URL = /^\s*(javascript:|data:text\/html)/i
const REMOTE_STYLE_URL = /url\(\s*['"]?\s*(https?:|[\\/]{2})[^)]*\)/gi
const BASE_STYLE = ":root{color-scheme:light} body{margin:0;padding:12px 16px;background:#fff;font:14px/1.5 Inter,system-ui,sans-serif;color:#0f1011;word-break:break-word} img{max-width:100%;height:auto}"

function stripDangerousMarkup (doc: Document): void {
  for (const tag of STRIPPED_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => { el.remove() })
  }
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => { el.remove() })
  doc.querySelectorAll('link[rel=import]').forEach((el) => { el.remove() })

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
    }
    for (const urlAttr of ['href', 'src', 'xlink:href']) {
      const value = el.getAttribute(urlAttr)
      if (value !== null && DANGEROUS_URL.test(value)) el.removeAttribute(urlAttr)
    }
  })
}

function openLinksInNewTab (doc: Document): void {
  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  })
}

function blockRemoteImages (doc: Document): boolean {
  let hasRemoteImages = false

  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src !== null && REMOTE_URL.test(src)) {
      img.setAttribute('data-blocked-src', encodeURIComponent(src))
      img.removeAttribute('src')
      hasRemoteImages = true
    }
    const srcset = img.getAttribute('srcset')
    if (srcset !== null && srcset !== '') {
      img.setAttribute('data-blocked-srcset', encodeURIComponent(srcset))
      img.removeAttribute('srcset')
      hasRemoteImages = true
    }
  })

  doc.querySelectorAll('picture source[srcset]').forEach((source) => {
    const srcset = source.getAttribute('srcset')
    if (srcset !== null && srcset !== '') {
      source.setAttribute('data-blocked-srcset', encodeURIComponent(srcset))
      source.removeAttribute('srcset')
      hasRemoteImages = true
    }
  })

  doc.querySelectorAll('[background]').forEach((el) => {
    const background = el.getAttribute('background') ?? ''
    if (REMOTE_URL.test(background)) {
      el.removeAttribute('background')
      hasRemoteImages = true
    }
  })

  doc.querySelectorAll('style').forEach((el) => {
    const css = el.textContent ?? ''
    const strippedCss = css.replace(REMOTE_STYLE_URL, 'url()')
    if (strippedCss !== css) {
      el.textContent = strippedCss
      hasRemoteImages = true
    }
  })

  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') ?? ''
    const strippedStyle = style.replace(REMOTE_STYLE_URL, 'url()')
    if (strippedStyle !== style) {
      el.setAttribute('style', strippedStyle)
      hasRemoteImages = true
    }
  })

  return hasRemoteImages
}

function addHeadGuards (doc: Document, shouldShowImages: boolean): void {
  const imgSrc = shouldShowImages ? 'data: cid: https: http:' : 'data: cid:'
  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:`)
  doc.head.prepend(csp)

  const style = doc.createElement('style')
  style.textContent = BASE_STYLE
  doc.head.appendChild(style)
}

export function prepareMailHtml (html: string, shouldShowImages: boolean): PreparedHtml {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  stripDangerousMarkup(doc)
  openLinksInNewTab(doc)
  const hasRemoteImages = shouldShowImages ? false : blockRemoteImages(doc)
  addHeadGuards(doc, shouldShowImages)

  return { srcdoc: doc.documentElement.outerHTML, hasRemoteImages }
}
