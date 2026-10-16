// servone: full reindex of a workspace; needed once on an existing workspace (fulltext only consumes new txs).
//   node dev/servone-fulltext-reindex.mjs <workspaceUrl> <email> <password>
const [workspaceUrl, email, password] = process.argv.slice(2)
if (password === undefined) {
  console.error('usage: node dev/servone-fulltext-reindex.mjs <workspaceUrl> <email> <password>')
  process.exit(1)
}
const ACCOUNT = process.env.DEV_ACCOUNT_URL ?? 'http://localhost:3001'
const FULLTEXT = process.env.FULLTEXT_URL ?? 'http://localhost:4702'

async function rpc (method, params, token) {
  const res = await fetch(ACCOUNT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ method, params })
  })
  const json = await res.json()
  if (json.error != null) throw new Error(`${method}: ${JSON.stringify(json.error)}`)
  return json.result
}

const { token } = await rpc('login', { email, password })
const { token: wsToken } = await rpc('selectWorkspace', { workspaceUrl, kind: 'external' }, token)
const res = await fetch(`${FULLTEXT}/api/v1/reindex`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wsToken}` },
  body: JSON.stringify({ token: wsToken })
})
console.log(`reindex ${workspaceUrl}: HTTP ${res.status}`)
