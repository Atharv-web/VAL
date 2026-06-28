/**
 * Validates a session token against the set of valid sessions.
 * @param {string} sessionToken
 * @param {Map|Set|Object} validSessions
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateSessionToken(sessionToken, validSessions) {
  if (
    !sessionToken ||
    typeof sessionToken !== 'string' ||
    sessionToken.trim() === ''
  ) {
    return { isValid: false, error: 'Session token is required' }
  }

  const exists =
    validSessions instanceof Map || validSessions instanceof Set
      ? validSessions.has(sessionToken)
      : Object.prototype.hasOwnProperty.call(validSessions, sessionToken)

  if (!exists) {
    return { isValid: false, error: 'Invalid or expired session token' }
  }

  return { isValid: true }
}

/**
 * Validates a conversation message object.
 * @param {object} message
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return { isValid: false, error: 'Message must be an object' }
  }

  if (!message.role || typeof message.role !== 'string') {
    return { isValid: false, error: 'Message must have a valid role' }
  }

  const validRoles = ['user', 'assistant', 'system']
  if (!validRoles.includes(message.role)) {
    return {
      isValid: false,
      error: `Message role must be one of: ${validRoles.join(', ')}`
    }
  }

  if (message.content === undefined || message.content === null) {
    return { isValid: false, error: 'Message must have content' }
  }

  return { isValid: true }
}

/**
 * Validates strict assistant response shape:
 * {
 *   message: string,
 *   ui_components: array,
 *   tool_calls: Array<{ name: string, arguments: object }>
 * }
 * @param {object} response
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateAssistantResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { isValid: false, error: 'Assistant response must be an object' }
  }

  const requiredKeys = ['message', 'ui_components', 'tool_calls']
  const optionalKeys = ['homeInfo', 'home_info_complete']
  // eslint-disable-next-line no-unused-vars
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(response, key)) {
      return { isValid: false, error: `Missing required key: ${key}` }
    }
  }

  const keys = Object.keys(response)
  // eslint-disable-next-line no-unused-vars
  for (const key of keys) {
    if (!requiredKeys.includes(key) && !optionalKeys.includes(key)) {
      return {
        isValid: false,
        error: `Unexpected key in assistant response: ${key}`
      }
    }
  }

  if (typeof response.message !== 'string') {
    return { isValid: false, error: 'message must be a string' }
  }

  if (!Array.isArray(response.ui_components)) {
    return { isValid: false, error: 'ui_components must be an array' }
  }

  if (!Array.isArray(response.tool_calls)) {
    return { isValid: false, error: 'tool_calls must be an array' }
  }

  // eslint-disable-next-line no-unused-vars
  for (const toolCall of response.tool_calls) {
    if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
      return { isValid: false, error: 'Each tool call must be an object' }
    }
    if (typeof toolCall.name !== 'string' || !toolCall.name.trim()) {
      return {
        isValid: false,
        error: 'tool_calls[].name must be a non-empty string'
      }
    }
    if (
      !Object.prototype.hasOwnProperty.call(toolCall, 'arguments') ||
      !toolCall.arguments ||
      typeof toolCall.arguments !== 'object' ||
      Array.isArray(toolCall.arguments)
    ) {
      return {
        isValid: false,
        error: 'tool_calls[].arguments must be an object'
      }
    }
  }

  return { isValid: true }
}

/**
 * Validate tool call envelope from client.
 * @param {object} payload
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateToolEnvelope(payload) {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Tool payload must be an object' }
  }

  if (!payload.tool_name || typeof payload.tool_name !== 'string') {
    return { isValid: false, error: 'tool_name is required' }
  }

  if (
    payload.tool_args !== undefined &&
    (typeof payload.tool_args !== 'object' ||
      Array.isArray(payload.tool_args) ||
      payload.tool_args === null)
  ) {
    return {
      isValid: false,
      error: 'tool_args must be an object when provided'
    }
  }

  if (!payload.session_token || typeof payload.session_token !== 'string') {
    return { isValid: false, error: 'session_token is required' }
  }

  return { isValid: true }
}
