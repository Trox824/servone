import { fileURLToPath } from 'node:url'

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'
const RESEND_API = 'https://api.resend.com/emails'
const SENDER = 'Servone Alerts <no-reply@servone.app>'
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const HTTP_TIMEOUT_MS = 10_000
const BAD_DEPLOY_STATUSES = new Set(['FAILED', 'CRASHED'])
const GOOD_DEPLOY_STATUSES = new Set(['SUCCESS', 'SLEEPING'])
const HULYLAKE_DB_SQL_URL = 'http://hulylake-db.railway.internal:8080/api/v2/sql/'
const BACKUP_MAX_AGE = '26 hours'
const BACKUP_SQL = `SELECT now() - max(finished) < INTERVAL '${BACKUP_MAX_AGE}' AS fresh FROM crdb_internal.jobs WHERE job_type = 'BACKUP' AND status = 'succeeded'`

const SERVICES_QUERY = `query ($projectId: String!) { project(id: $projectId) { services { edges { node { name
  serviceInstances { edges { node { environmentId healthcheckPath latestDeployment { id status }
    domains { serviceDomains { domain } customDomains { domain } } } } } } } } } }`

function requiredEnv (name) {
  const envValue = process.env[name]
  if (envValue === undefined || envValue === '') throw new Error(`Missing env variable: ${name}`)
  return envValue
}

async function postJson (url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return await response.json()
}

async function railwayInstances (config) {
  const reply = await postJson(
    RAILWAY_API,
    { query: SERVICES_QUERY, variables: { projectId: config.projectId } },
    { 'Project-Access-Token': config.railwayToken }
  )
  if (reply.errors !== undefined) throw new Error(`Railway API: ${reply.errors.map((error) => error.message).join('; ')}`)
  return reply.data.project.services.edges
    .flatMap(({ node }) => node.serviceInstances.edges.map((edge) => ({ name: node.name, ...edge.node })))
    .filter((instance) => instance.environmentId === config.environmentId)
}

async function unreachableReason (url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    await response.body?.cancel()
    return response.status >= 500 ? `HTTP ${response.status}` : undefined
  } catch (error) {
    return error.message
  }
}

function publicHealthUrl (instance) {
  const domain = instance.domains.customDomains[0]?.domain ?? instance.domains.serviceDomains[0]?.domain
  return domain === undefined ? undefined : `https://${domain}${instance.healthcheckPath ?? '/'}`
}

async function instanceResults (instance) {
  const deployment = instance.latestDeployment
  if (deployment === null) return []
  const results = []
  const isBadDeploy = BAD_DEPLOY_STATUSES.has(deployment.status)
  if (isBadDeploy || GOOD_DEPLOY_STATUSES.has(deployment.status)) {
    results.push({
      key: `${instance.name} deploy`,
      problem: isBadDeploy ? `${deployment.status} ${deployment.id}` : undefined,
      detail: `latest deployment ${deployment.id} is ${deployment.status}`
    })
  }
  const url = publicHealthUrl(instance)
  if (url !== undefined && deployment.status !== 'REMOVED') {
    const reason = await unreachableReason(url)
    results.push({ key: `${instance.name} health`, problem: reason === undefined ? undefined : 'unreachable', detail: `${url}: ${reason ?? 'ok'}` })
  }
  return results
}

async function backupResult () {
  const reply = await postJson(HULYLAKE_DB_SQL_URL, { database: 'defaultdb', execute: true, statements: [{ sql: BACKUP_SQL }] })
  const isFresh = reply.execution?.txn_results?.[0]?.rows?.[0]?.fresh === true
  return {
    key: 'hulylake-db backup',
    problem: isFresh ? undefined : 'stale',
    detail: isFresh ? 'ok' : `no succeeded BACKUP job in the last ${BACKUP_MAX_AGE}`
  }
}

async function guarded (key, check) {
  try {
    return await check()
  } catch (error) {
    return { key, problem: 'check failed', detail: error.message }
  }
}

async function railwayResults (config) {
  const instances = await railwayInstances(config)
  const nested = await Promise.all(instances.map(async (instance) => await instanceResults(instance)))
  return [{ key: 'railway api', problem: undefined, detail: 'ok' }, ...nested.flat()]
}

async function runChecks (config) {
  const nested = await Promise.all([
    guarded('railway api', async () => await railwayResults(config)),
    guarded('hulylake-db backup', backupResult)
  ])
  return nested.flat()
}

export function changedResults (lastProblems, results) {
  return results.filter((result) => (lastProblems.get(result.key) ?? 'ok') !== (result.problem ?? 'ok'))
}

export function alertEmail (changes) {
  const problems = changes.filter((change) => change.problem !== undefined)
  const recoveries = changes.length - problems.length
  const subject = problems.length > 0
    ? `[Servone] ${problems.map((change) => change.key).join(', ')}: ${problems[0].problem}${recoveries > 0 ? `, ${recoveries} recovered` : ''}`
    : `[Servone] recovered: ${changes.map((change) => change.key).join(', ')}`
  const text = changes
    .map((change) => `${change.problem === undefined ? 'RECOVERED' : 'PROBLEM'}  ${change.key}: ${change.problem ?? 'ok'}\n  ${change.detail}`)
    .join('\n\n')
  return { subject, text }
}

async function sendEmail (config, changes) {
  const { subject, text } = alertEmail(changes)
  await postJson(RESEND_API, { from: SENDER, to: [config.alertEmail], subject, text }, { Authorization: `Bearer ${config.resendKey}` })
}

async function tick (config, lastProblems) {
  const results = await runChecks(config)
  const changes = changedResults(lastProblems, results)
  if (changes.length > 0) await sendEmail(config, changes)
  for (const result of results) lastProblems.set(result.key, result.problem)
  console.log(`checked ${results.length}, changed ${changes.length}`)
}

function start () {
  const config = {
    railwayToken: requiredEnv('WATCH_RAILWAY_TOKEN'),
    projectId: requiredEnv('RAILWAY_PROJECT_ID'),
    environmentId: requiredEnv('RAILWAY_ENVIRONMENT_ID'),
    resendKey: requiredEnv('RESEND_API_KEY'),
    alertEmail: requiredEnv('ALERT_EMAIL')
  }
  const lastProblems = new Map()
  const loop = () => {
    tick(config, lastProblems)
      .catch((error) => { console.error('watch run failed, state kept for the next run', error) })
      .finally(() => setTimeout(loop, CHECK_INTERVAL_MS))
  }
  loop()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start()
