// Token monitor - lightweight Lennox usage tracking

import { createLogger } from '../../../utils/logger.js'

const logger = createLogger('TOKEN MONITOR')

const sessionUsage = new Map()

const totalUsage = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  audio_input_tokens: 0,
  audio_output_tokens: 0,
  sessions: 0
}

const getUsageFromPayload = usage => {
  const inputTokens = usage?.input_tokens || usage?.prompt_tokens || 0
  const outputTokens = usage?.output_tokens || usage?.completion_tokens || 0
  const totalTokens = usage?.total_tokens || inputTokens + outputTokens
  const audioInputTokens =
    usage?.input_token_details?.audio_tokens || usage?.audio_tokens_input || 0
  const audioOutputTokens =
    usage?.output_token_details?.audio_tokens || usage?.audio_tokens_output || 0

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    audioInputTokens,
    audioOutputTokens
  }
}

export const logUsage = (sessionToken, usage = {}, context = {}) => {
  if (!sessionToken) return

  if (!sessionUsage.has(sessionToken)) {
    sessionUsage.set(sessionToken, {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      audio_input_tokens: 0,
      audio_output_tokens: 0,
      events: 0
    })
    totalUsage.sessions += 1
  }

  const parsed = getUsageFromPayload(usage)
  const session = sessionUsage.get(sessionToken)

  session.input_tokens += parsed.inputTokens
  session.output_tokens += parsed.outputTokens
  session.total_tokens += parsed.totalTokens
  session.audio_input_tokens += parsed.audioInputTokens
  session.audio_output_tokens += parsed.audioOutputTokens
  session.events += 1

  totalUsage.input_tokens += parsed.inputTokens
  totalUsage.output_tokens += parsed.outputTokens
  totalUsage.total_tokens += parsed.totalTokens
  totalUsage.audio_input_tokens += parsed.audioInputTokens
  totalUsage.audio_output_tokens += parsed.audioOutputTokens

  logger.info(
    {
      sessionId: `${String(sessionToken).slice(0, 8)}...`,
      event: session.events,
      context: context?.context || context?.type || 'general',
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      audioInputTokens: parsed.audioInputTokens,
      audioOutputTokens: parsed.audioOutputTokens,
      sessionTotalTokens: session.total_tokens
    },
    'token usage recorded'
  )
}

export const getTotalSummary = () => {
  return {
    ...totalUsage,
    active_sessions: sessionUsage.size
  }
}

export const endSession = sessionToken => {
  if (!sessionToken) return
  const session = sessionUsage.get(sessionToken)
  if (!session) return
  logger.info(
    {
      sessionId: `${String(sessionToken).slice(0, 8)}...`,
      sessionTotalTokens: session.total_tokens
    },
    'session ended'
  )
  sessionUsage.delete(sessionToken)
}
