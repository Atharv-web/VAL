// Conversation store - per-session conversation history backed by Supabase
// Falls back to in-memory storage when Supabase is not configured.

import { getSupabase } from '../../../../config/supabase.js'

const TABLE = 'conversation_messages'

// In-memory fallback (used only when Supabase is not configured)
const memoryConversations = new Map()

const estimateTokens = messages =>
  Math.ceil(
    messages.reduce(
      (sum, msg) =>
        sum + (typeof msg.content === 'string' ? msg.content.length : 0),
      0
    ) / 4
  )

export const addConversationMessage = async (sessionToken, message) => {
  const supabase = getSupabase()
  if (!supabase) {
    if (!memoryConversations.has(sessionToken)) {
      memoryConversations.set(sessionToken, [])
    }
    memoryConversations.get(sessionToken).push(message)
    return true
  }

  const { error } = await supabase
    .from(TABLE)
    .insert({ session_token: sessionToken, message })

  if (error) {
    console.error('[CONVERSATION STORE] Failed to add message:', error.message)
    return false
  }
  return true
}

export const getConversationHistory = async (sessionToken, limit = 20) => {
  const supabase = getSupabase()
  if (!supabase) {
    const history = memoryConversations.get(sessionToken) || []
    return history.slice(-limit)
  }

  // Fetch the most recent `limit` rows (newest first), then restore chronological order.
  const { data, error } = await supabase
    .from(TABLE)
    .select('message')
    .eq('session_token', sessionToken)
    .order('id', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(
      '[CONVERSATION STORE] Failed to fetch history:',
      error.message
    )
    return []
  }
  return (data || []).map(row => row.message).reverse()
}

export const getConversationTokenEstimate = async sessionToken => {
  const supabase = getSupabase()
  if (!supabase) {
    return estimateTokens(memoryConversations.get(sessionToken) || [])
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('message')
    .eq('session_token', sessionToken)
    .order('id', { ascending: true })

  if (error) {
    console.error(
      '[CONVERSATION STORE] Failed to estimate tokens:',
      error.message
    )
    return 0
  }
  return estimateTokens((data || []).map(row => row.message))
}

export const pruneConversationHistory = async (
  sessionToken,
  maxTokens = 4000
) => {
  const supabase = getSupabase()
  if (!supabase) {
    const history = memoryConversations.get(sessionToken) || []
    let pruned = 0
    while (history.length > 4) {
      if (estimateTokens(history) <= maxTokens) break
      history.shift()
      pruned++
    }
    memoryConversations.set(sessionToken, history)
    return pruned
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, message')
    .eq('session_token', sessionToken)
    .order('id', { ascending: true })

  if (error) {
    console.error(
      '[CONVERSATION STORE] Failed to load for prune:',
      error.message
    )
    return 0
  }

  let remaining = data || []
  const idsToDelete = []
  while (
    remaining.length > 4 &&
    estimateTokens(remaining.map(row => row.message)) > maxTokens
  ) {
    idsToDelete.push(remaining[0].id)
    remaining = remaining.slice(1)
  }

  if (idsToDelete.length) {
    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .in('id', idsToDelete)
    if (deleteError) {
      console.error(
        '[CONVERSATION STORE] Failed to prune:',
        deleteError.message
      )
      return 0
    }
  }
  return idsToDelete.length
}
