// Voice Agent Lennox Router

import { Router } from 'express'
import {
  createSession,
  evaluateTextResponse,
  exchangeRealtimeSdp,
  executeTools,
  findDealers,
  getBookingSlots, // [NEW FLOW]
  processVoiceTurn,
  getConversationHistoryHandler,
  getTokenUsage,
  logContextDebug,
  pruneConversationHandler,
  reportUsage,
  storeConversationMessage
} from './voice-agent-lennox.controller.js'
import {
  MAX_SESSION_REQUESTS,
  MAX_TOOL_REQUESTS,
  rateLimiter
} from './voice-agent-lennox.helper.js'

const voiceAgentLennoxRouter = Router()

// Health & Info
voiceAgentLennoxRouter.get('/api/token-usage', getTokenUsage)

// Dealer locator
voiceAgentLennoxRouter.get('/dealers', rateLimiter(100, 'dealers'), findDealers)

// [NEW FLOW] Booking slots for date/time picker
voiceAgentLennoxRouter.get(
  '/booking-slots',
  rateLimiter(200, 'booking'),
  getBookingSlots
)

// WebRTC session & tools
voiceAgentLennoxRouter.post(
  '/session',
  rateLimiter(MAX_SESSION_REQUESTS, 'session'),
  createSession
)
voiceAgentLennoxRouter.post(
  '/realtime',
  rateLimiter(MAX_SESSION_REQUESTS, 'realtime'),
  exchangeRealtimeSdp
)
voiceAgentLennoxRouter.post(
  '/tools',
  rateLimiter(MAX_TOOL_REQUESTS, 'tools'),
  executeTools
)
// [DECOMMISSION-CANDIDATE — Phase 4] Deterministic server orchestrator. No live
// frontend caller (system-integration-map §1.4). Retained until Phase 4 to keep
// Phase 1 zero-risk. Do not wire new callers.
voiceAgentLennoxRouter.post(
  '/',
  rateLimiter(MAX_TOOL_REQUESTS, 'orchestration'),
  processVoiceTurn
)

// Conversation history
// [DECOMMISSION-CANDIDATE — Phase 4] No live frontend caller (system-integration-map §1.4).
voiceAgentLennoxRouter.post(
  '/conversation/message',
  rateLimiter(500, 'conversation'),
  storeConversationMessage
)
voiceAgentLennoxRouter.get(
  '/conversation/history',
  rateLimiter(200, 'conversation'),
  getConversationHistoryHandler
)
voiceAgentLennoxRouter.post(
  '/conversation/prune',
  rateLimiter(100, 'conversation'),
  pruneConversationHandler
)

// Token usage reporting
// [DECOMMISSION-CANDIDATE — Phase 4] No live frontend caller (system-integration-map §1.4).
voiceAgentLennoxRouter.post('/usage', rateLimiter(500, 'usage'), reportUsage)

// Context debug logging
voiceAgentLennoxRouter.post(
  '/context-debug',
  rateLimiter(100, 'debug'),
  logContextDebug
)

// Text-based evaluation
// [DECOMMISSION-CANDIDATE — Phase 4] No live frontend caller (system-integration-map §1.4).
voiceAgentLennoxRouter.post(
  '/evaluate',
  rateLimiter(100, 'evaluate'),
  evaluateTextResponse
)

export default voiceAgentLennoxRouter
