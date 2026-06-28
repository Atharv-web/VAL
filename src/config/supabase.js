// Supabase client - shared server-side client (service role key, bypasses RLS)

import { createClient } from '@supabase/supabase-js'
import config from './index.js'

let client = null
let warned = false

// Lazily build a singleton client. Returns null when Supabase env vars are not
// configured so callers can degrade gracefully to in-memory behaviour.
export const getSupabase = () => {
  if (client) return client

  const url = config.SUPABASE_URL
  const key = config.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    if (!warned) {
      warned = true
      console.warn(
        '[SUPABASE] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — persistence disabled, using in-memory fallback'
      )
    }
    return null
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  console.log('[SUPABASE] Client initialized')
  return client
}

export const isSupabaseEnabled = () => !!getSupabase()
