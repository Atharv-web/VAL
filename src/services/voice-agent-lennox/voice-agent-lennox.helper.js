// Voice Agent Helper - Utility functions for rate limiting, session management, and security

import { endSession as endTokenSession } from './services/token-monitor.js'
import {
  peekSessionState,
  setRawSessionState,
  serializeSessionState,
  deserializeSessionState
} from './core/helpers/session-state.js'
import {
  loadSessionRow,
  saveSessionRow,
  deleteExpiredSessionRows
} from './services/supabase/session-store.js'

// Allowed origins for CORS
export const ALLOWED_ORIGINS = [
  'https://nudge.goswirl.ai',
  'https://denza-uae.ae',
  'http://localhost:9018',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://192.168.31.168:9000'
]

// Rate limiting configuration
export const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
export const MAX_SESSION_REQUESTS = 100 // Max 100 session requests per minute per IP (POC)
export const MAX_TOOL_REQUESTS = 300 // Max 300 tool requests per minute per IP (POC)

// Session configuration
export const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Session tokens: track valid sessions (in-process working copy, persisted to Supabase)
export const validSessions = new Map()

// Rate limiting: track requests per IP
const rateLimitMap = new Map()

// ── Supabase-backed session persistence ──────────────────────────────
// The in-process Maps stay the working copy; Supabase is the durable source
// of truth so session/valid-session state survives restarts and serverless
// cold starts. The Set field is serialized to/from an array for jsonb storage.
// NOTE: cross-instance concurrent writes to the same session are last-write-wins;
// distributed locking is out of scope for this phase.

const serializeValidSession = validSession => {
  if (!validSession) return null
  return {
    ...validSession,
    bookedProductIds: [...(validSession.bookedProductIds || [])]
  }
}

const deserializeValidSession = stored => {
  if (!stored) return null
  return {
    ...stored,
    bookedProductIds: new Set(stored.bookedProductIds || [])
  }
}

// Load a session into the in-process Maps from Supabase if not already warm.
export const hydrateSession = async sessionToken => {
  if (!sessionToken || validSessions.has(sessionToken)) return

  const row = await loadSessionRow(sessionToken)
  if (!row) return

  if (row.valid_session) {
    validSessions.set(sessionToken, deserializeValidSession(row.valid_session))
  }
  const state = deserializeSessionState(row.state)
  if (state) setRawSessionState(sessionToken, state)
}

// Write the current in-process session + orchestrator state back to Supabase.
export const persistSession = async sessionToken => {
  if (!sessionToken) return

  const validSession = validSessions.get(sessionToken)
  const state = peekSessionState(sessionToken)
  if (!validSession && !state) return

  const baseTime = validSession?.createdAt || Date.now()

  await saveSessionRow(sessionToken, {
    validSession: serializeValidSession(validSession),
    state: serializeSessionState(state),
    expiresAt: baseTime + SESSION_TTL_MS
  })
}

// Start session cleanup interval - cleans up expired sessions every 5 minutes
export const startSessionCleanup = () => {
  setInterval(() => {
    const now = Date.now()

    // Cleanup expired sessions
    // eslint-disable-next-line no-unused-vars
    for (const [sessionId, sessionData] of validSessions.entries()) {
      if (now - sessionData.createdAt > SESSION_TTL_MS) {
        endTokenSession(sessionId)
        validSessions.delete(sessionId)
      }
    }

    // Cleanup rate limit entries
    // eslint-disable-next-line no-unused-vars
    for (const [ip, limitData] of rateLimitMap.entries()) {
      if (now - limitData.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.delete(ip)
      }
    }

    // Best-effort cleanup of expired session rows in Supabase
    void deleteExpiredSessionRows()
  }, 5 * 60 * 1000)
}

// Rate limiter middleware factory
export const rateLimiter = (maxRequests, keyPrefix = 'general') => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown'
    const key = `${keyPrefix}:${ip}`
    const now = Date.now()

    let record = rateLimitMap.get(key)

    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      record = { windowStart: now, count: 0 }
    }

    record.count++
    rateLimitMap.set(key, record)

    if (record.count > maxRequests) {
      console.warn(
        `[VOICE AGENT HELPER] Rate limit exceeded for ${ip} on ${keyPrefix}`
      )
      return res.status(429).json({
        error: 'Too many requests. Please try again later.'
      })
    }

    next()
  }
}

// CORS options for Express
export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true)
    }

    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(
        `[VOICE AGENT HELPER] Blocked request from origin: ${origin}`
      )
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}
