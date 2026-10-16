import { prepareMailHtml } from '../html'

it('strips scripts, handlers and dangerous urls', () => {
  const { srcdoc } = prepareMailHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">', false)
  expect(srcdoc).not.toMatch(/<script|onclick|onerror|javascript:/i)
})

it('strips a javascript: image src and a data:text/html href', () => {
  const { srcdoc } = prepareMailHtml('<img src="javascript:alert(1)"><a href="data:text/html,<script>alert(1)</script>">x</a>', false)
  expect(srcdoc).not.toMatch(/javascript:|data:text\/html/i)
})

it('strips an on* attribute regardless of which element carries it', () => {
  const { srcdoc } = prepareMailHtml('<div onmouseover="steal()">hover</div>', false)
  expect(srcdoc).not.toMatch(/onmouseover/i)
})

it('blocks remote images and tracking pixels until asked', () => {
  const blocked = prepareMailHtml('<img src="https://t.example/p.gif" width="1"><div style="background:url(https://t.example/b.png)">x</div>', false)
  expect(blocked.hasRemoteImages).toBe(true)
  expect(blocked.srcdoc).not.toMatch(/src="https:\/\/t\.example/)
  expect(blocked.srcdoc).not.toMatch(/url\(https:/)
  expect(blocked.srcdoc).toMatch(/img-src data: cid:;/)
  const shown = prepareMailHtml('<img src="https://t.example/p.gif">', true)
  expect(shown.srcdoc).toMatch(/src="https:\/\/t\.example\/p\.gif"/)
  expect(shown.srcdoc).toMatch(/img-src data: cid: https: http:/)
})

it('keeps cid and inline data images even when remote images are blocked', () => {
  const { srcdoc, hasRemoteImages } = prepareMailHtml('<img src="cid:logo@x"><img src="data:image/png;base64,AAA">', false)
  expect(hasRemoteImages).toBe(false)
  expect(srcdoc).toMatch(/src="cid:logo@x"/)
  expect(srcdoc).toMatch(/src="data:image\/png;base64,AAA"/)
})

it('blocks a picture source srcset as a remote image', () => {
  const { srcdoc, hasRemoteImages } = prepareMailHtml('<picture><source srcset="https://t.example/hi.png"><img src="https://t.example/lo.png"></picture>', false)
  expect(hasRemoteImages).toBe(true)
  expect(srcdoc).not.toMatch(/srcset="https:\/\/t\.example/)
})

it('opens links outside the app and drops base and refresh', () => {
  const { srcdoc } = prepareMailHtml('<base href="https://evil/"><meta http-equiv="refresh" content="0;url=https://evil"><a href="https://acme.vn">x</a>', false)
  expect(srcdoc).toMatch(/<a href="https:\/\/acme\.vn" target="_blank" rel="noopener noreferrer">/)
  expect(srcdoc).not.toMatch(/<base|http-equiv="refresh"/)
})

it('blocks a protocol-relative image as remote', () => {
  const { srcdoc, hasRemoteImages } = prepareMailHtml('<img src="//t.example/p.gif"><img src="\\\\t.example/q.gif"><td background="//t.example/bg.png"></td>', false)
  expect(hasRemoteImages).toBe(true)
  expect(srcdoc).not.toMatch(/src="\/\/t\.example|src="\\\\t\.example|background=/)
})

it('blocks protocol-relative and remote url() in style attributes and style blocks', () => {
  const { srcdoc, hasRemoteImages } = prepareMailHtml('<style>.x{background:url(//t.example/a.png)}</style><div style="background:url(\'//t.example/b.png\')">x</div>', false)
  expect(hasRemoteImages).toBe(true)
  expect(srcdoc).not.toMatch(/t\.example/)
})

it('strips a javascript: xlink:href from svg', () => {
  const { srcdoc } = prepareMailHtml('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', false)
  expect(srcdoc).not.toMatch(/javascript:/i)
})

it('blocks remote url() on every styled element, not only the first', () => {
  const { srcdoc } = prepareMailHtml('<div style="background:url(//a.test/1.gif)">a</div><div style="background:url(//b.test/2.gif)">b</div>', false)
  expect(srcdoc).not.toMatch(/a\.test|b\.test/)
})
