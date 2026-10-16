import Anthropic from '@anthropic-ai/sdk'

import config from '../../config'
import { authenticate as authenticateMember } from '../../webhooks/auth'
import { readBearer } from '../auth'
import type { Report } from '../mcp'
import type { RouteHandler } from '../server'
import { createSessionCache, openSession } from '../session'
import type { AnyTool } from '../tool'
import { ALL_TOOLS } from '../tools'
import { createChatLimiter } from './limiter'
import { type ChatModel, runChat } from './loop'
import { type ChatCaller, createChatRoute, type RunChat } from './route'
import { chatTools } from './tools'

// A 16k-token non-streaming turn with adaptive thinking can pass 60 s.
const MODEL_TIMEOUT_MS = 180_000
// The SDK default of 2 retries triples spend on a stuck call.
const MODEL_MAX_RETRIES = 1

function anthropicModel (apiKey: string): ChatModel {
  const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: MODEL_MAX_RETRIES })
  return { create: async (params, signal) => await client.messages.create(params, { signal }) }
}

function chatRunner (apiKey: string, tools: AnyTool[], report: Report): RunChat {
  const deps = { model: anthropicModel(apiKey), modelId: config.mcp.AiModel, tools, report }
  return async (session, request, signal) => await runChat(deps, session, request, signal)
}

// Same rule as webhook management: a signed-in workspace user (not an API token), role fresh from the account service.
async function authenticate (authorization: string | undefined): Promise<ChatCaller | undefined> {
  const token = readBearer(authorization)
  if (token === undefined) return undefined
  const member = await authenticateMember(authorization, Date.now())
  return member === undefined ? undefined : { ...member, token }
}

export function createStudioChat (report: Report): RouteHandler {
  // Resolved at start so a renamed or write-capable tool stops the deploy instead of the first chat.
  const tools = chatTools(ALL_TOOLS)
  const apiKey = config.mcp.AnthropicApiKey
  return createChatRoute({
    frontUrl: config.FrontUrl,
    authenticate,
    session: createSessionCache<ChatCaller>(openSession, (caller) => caller.token, Date.now),
    runChat: apiKey === undefined ? undefined : chatRunner(apiKey, tools, report),
    limiter: createChatLimiter(),
    now: Date.now,
    report
  })
}
