// Servone additions to webpack.config.js, kept here so the upstream file stays merge-friendly.
const fs = require('fs')
const path = require('path')
const { ContextReplacementPlugin, NormalModuleReplacementPlugin } = require('webpack')

const pluginsRoot = path.resolve(__dirname, '../../plugins')
const skinnedPlugins = path.resolve(__dirname, '../../packages/servone-ui/src/plugins')

const servonePlugins = (prod) => [
  // The emojibase-data context pulls all 56 locales (~40 MiB JSON) per dev build; dev keeps `en`
  // (fetchEmojis falls back to 'en' when a locale import rejects).
  ...(prod
    ? []
    : [new ContextReplacementPlugin(/[\\/]emojibase-data$/, /^\.\/en\/(data|compact|messages|shortcodes\/[^/]+)\.json$/)]),
  // Resolve a plugin shadow's (servone-ui/src/plugins/<pkg>/<rel>) imports as if it lived at
  // plugins/<pkg>/src/<rel>: bare specifiers from that plugin's node_modules (pnpm strict), siblings from upstream.
  new NormalModuleReplacementPlugin(/./, (resource) => {
    const issuer = resource.contextInfo?.issuer ?? ''
    if (!issuer.startsWith(skinnedPlugins + path.sep)) return
    const req = resource.request
    // Loader-generated requests and real siblings of the shadow already resolve correctly.
    if (req.includes('!') || path.isAbsolute(req)) return
    if (req.startsWith('.')) {
      const abs = path.resolve(resource.context, req)
      // Files only: `from '..'` (login-resources) would match the shadow's index-less parent dir and fail.
      const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile()
      if (['', '.ts', '.js', '.svelte', '.json', '/index.ts'].some((ext) => isFile(abs + ext))) return
    }
    const [pkg, ...rest] = path.relative(skinnedPlugins, path.dirname(issuer)).split(path.sep)
    if (!req.startsWith('.')) {
      // Only deps of the upstream plugin; extras the shadow adds (e.g. @hcengineering/theme) come from @servone/ui.
      const segs = req.split('/')
      const name = req.startsWith('@') ? segs.slice(0, 2).join('/') : segs[0]
      if (!fs.existsSync(path.join(pluginsRoot, pkg, 'node_modules', name))) return
    }
    resource.context = path.join(pluginsRoot, pkg, 'src', ...rest)
  }),
  // Upstream ui components import siblings by relative path, bypassing the `@hcengineering/ui$` alias, so swap
  // in the skinned file of the same name. packages/ui/src/index.ts and servone-ui are exempt so wrappers reach originals.
  new NormalModuleReplacementPlugin(/\.svelte$/, (resource) => {
    const upstream = path.resolve(__dirname, '../../packages/ui/src/components')
    const skinned = path.resolve(__dirname, '../../packages/servone-ui/src/components')
    const servoneUi = path.resolve(__dirname, '../../packages/servone-ui')
    const issuer = resource.contextInfo?.issuer ?? ''
    if (issuer.startsWith(servoneUi) || issuer === path.resolve(upstream, '../index.ts')) return
    const target = path.resolve(resource.context, resource.request)
    if (target.startsWith(upstream + path.sep)) {
      const candidate = path.join(skinned, path.relative(upstream, target))
      if (fs.existsSync(candidate)) resource.request = candidate
      return
    }
    if (target.startsWith(pluginsRoot + path.sep)) {
      const rel = path.relative(pluginsRoot, target)
      const [pkg, src, ...rest] = rel.split(path.sep)
      if (src !== 'src' || rest.length === 0) return
      const candidate = path.join(skinnedPlugins, pkg, ...rest)
      if (fs.existsSync(candidate)) resource.request = candidate
    }
  })
]

// SERVONE_LOCALHOST_CONFIG=1 serves config.json with huly.local -> localhost (no /etc/hosts entry);
// SERVONE_CONFIG_OVERRIDES=<json file> merges keys on top to target a remote backend (dev/servone-front.sh).
const servoneSetupMiddlewares = (middlewares, devServerInstance) => {
  const overridesFile = process.env.SERVONE_CONFIG_OVERRIDES
  if (process.env.SERVONE_LOCALHOST_CONFIG === '1' || overridesFile !== undefined) {
    devServerInstance.app.get('/config.json', (req, res) => {
      let raw = fs.readFileSync(path.resolve(__dirname, 'public/config.json'), 'utf8')
      if (process.env.SERVONE_LOCALHOST_CONFIG === '1') raw = raw.replace(/huly\.local/g, 'localhost')
      let config = JSON.parse(raw)
      if (overridesFile !== undefined) {
        config = { ...config, ...JSON.parse(fs.readFileSync(overridesFile, 'utf8')) }
      }
      res.type('application/json').send(JSON.stringify(config))
    })
  }
  // The front image writes this file in prod (dev/railway/front-image); locally the service runs on :4073.
  if (process.env.SERVONE_LOCALHOST_CONFIG === '1' && overridesFile === undefined) {
    devServerInstance.app.get('/servone-config.json', (req, res) => {
      res.json({ SERVONE_WEBHOOKS_URL: 'http://localhost:4073', SERVONE_MCP_URL: 'http://localhost:4073' })
    })
  }
  // Branding is looked up by Host; localhost:8080 reuses huly.local:8080 so the upstream file needs no extra entry.
  devServerInstance.app.get('/branding.json', (req, res) => {
    const branding = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'public/branding.json'), 'utf8'))
    branding['localhost:8080'] = branding['huly.local:8080']
    res.type('application/json').send(JSON.stringify(branding))
  })
  return middlewares
}

module.exports = { servonePlugins, servoneSetupMiddlewares }
