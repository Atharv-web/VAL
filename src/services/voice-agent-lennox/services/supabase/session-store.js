// Session store - low-level Supabase persistence for a session row.
// One row per session_token holds both the valid-session metadata and the
// orchestrator/turn state. Returns null on any miss/failure so callers fall
// back to their in-memory Maps.

import { getSupabase } from '../../../../config/supabase.js'

const TABLE = 'voice_sessions'

export const loadSessionRow = async sessionToken => {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select('valid_session, state')
    .eq('session_token', sessionToken)
    .maybeSingle()

  if (error) {
    console.error('[SESSION STORE] Failed to load session:', error.message)
    return null
  }
  return data || null
}

export const saveSessionRow = async (
  sessionToken,
  { validSession, state, expiresAt }
) => {
  const supabase = getSupabase()
  if (!supabase) return false

  const { error } = await supabase.from(TABLE).upsert(
    {
      session_token: sessionToken,
      valid_session: validSession ?? null,
      state: state ?? null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'session_token' }
  )

  if (error) {
    console.error('[SESSION STORE] Failed to save session:', error.message)
    return false
  }
  return true
}

export const deleteExpiredSessionRows = async () => {
  const supabase = getSupabase()
  if (!supabase) return 0

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('session_token')

  if (error) {
    console.error(
      '[SESSION STORE] Failed to delete expired sessions:',
      error.message
    )
    return 0
  }
  return (data || []).length
}
