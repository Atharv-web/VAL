// PostHog logger - lightweight Lennox event logging

const sessionContext = new Map()

const safePreview = value => {
  try {
    if (value === undefined) return undefined
    const json = JSON.stringify(value)
    return json.length > 600 ? `${json.slice(0, 600)}...` : json
  } catch (_err) {
    return '[unserializable]'
  }
}

const logEvent = (eventName, sessionToken, payload = {}) => {
  const context = sessionContext.get(sessionToken) || {}
  console.log(`[POSTHOG][LENNOX] ${eventName}`, {
    session: sessionToken
      ? `${String(sessionToken).slice(0, 8)}...`
      : 'unknown',
    modelId: context.modelId || null,
    modelName: context.modelName || null,
    payload: safePreview(payload)
  })
}

export const registerSession = (sessionToken, context = {}) => {
  if (!sessionToken) return
  sessionContext.set(sessionToken, {
    modelId: context.modelId || null,
    modelName: context.modelName || null,
    ip: context.ip || null,
    createdAt: Date.now()
  })
  logEvent('session_registered', sessionToken, context)
}

export const logSessionCreated = (sessionToken, data = {}) => {
  logEvent('session_created', sessionToken, data)
}

export const logSessionConfig = (sessionToken, config = {}) => {
  logEvent('session_config', sessionToken, {
    voice: config.voice,
    tools: Array.isArray(config.tools)
      ? config.tools.map(tool => tool.name)
      : []
  })
}

export const logTokenUsage = (sessionToken, data = {}) => {
  logEvent('tokens_used', sessionToken, data)
}

export const logConversationMessage = (sessionToken, data = {}) => {
  logEvent('conversation_message_stored', sessionToken, data)
}

export const logToolExecutionError = (sessionToken, data = {}) => {
  logEvent('tool_execution_error', sessionToken, data)
}

export const logSecurityEvent = (sessionToken, data = {}) => {
  logEvent('security_event', sessionToken, data)
}

export const logError = (sessionToken, data = {}) => {
  logEvent('backend_error', sessionToken, data)
}
