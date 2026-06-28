// Session state helpers - in-memory tracking for nudge/interest signals

const sessionState = new Map()

const USER_FIELDS = ['name', 'phone', 'address', 'email']

const createDefaultOrchestratorSession = () => ({
  homeInfo: {
    mode: null,
    location: null,
    size: null
  },
  selectedSKU: null,
  userInfo: {
    name: { value: null, confirmed: false },
    phone: { value: null, confirmed: false },
    address: { value: null, confirmed: false },
    email: { value: null, confirmed: false }
  },
  scheduledTime: null
})

const PHASES = Object.freeze({
  QUALIFICATION: 'qualification',
  RECOMMENDATION: 'recommendation',
  DETAIL: 'detail',
  BOOKING: 'booking'
})

// ── Per-session mutex to prevent concurrent state transitions ──────
const sessionLocks = new Map()

export async function withSessionLock(sessionToken, fn) {
  while (sessionLocks.get(sessionToken)) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  sessionLocks.set(sessionToken, true)
  try {
    return await fn()
  } finally {
    sessionLocks.delete(sessionToken)
  }
}

const createDefaultState = () => ({
  exchangeCount: 0,
  modelFocus: null,
  interestSignals: [],
  orchestrator: createDefaultOrchestratorSession(),
  turnGuard: {
    inFlight: false,
    lastTranscriptHash: null,
    lastResponse: null
  },
  // bookingState is an array — supports multiple bookings (one per product)
  bookingState: [],
  // set of product IDs for which a booking has been confirmed
  bookedProductIds: new Set(),
  // [NEW — Phase 1 / R3] Stable per-session booking slots. Generated exactly
  // once, then reused so the confirm_user_info tool result and the standalone
  // GET /booking-slots route present the IDENTICAL set of times to the user.
  bookingSlots: null
})

function getState(sessionToken) {
  if (!sessionState.has(sessionToken)) {
    sessionState.set(sessionToken, createDefaultState())
  }
  return sessionState.get(sessionToken)
}

// ── Supabase persistence bridge ──────────────────────────────────────
// The Set field is serialized to/from an array so the state survives jsonb
// storage. Stored rows are overlaid on a fresh default so older rows missing
// newer fields rehydrate safely.

export function serializeSessionState(state) {
  if (!state) return null
  return {
    ...state,
    bookedProductIds: [...(state.bookedProductIds || [])]
  }
}

export function deserializeSessionState(stored) {
  if (!stored) return null
  return {
    ...createDefaultState(),
    ...stored,
    bookedProductIds: new Set(stored.bookedProductIds || [])
  }
}

// Read the raw state without creating one (used by the persistence layer).
export function peekSessionState(sessionToken) {
  return sessionState.get(sessionToken) || null
}

// Replace the raw state object (used when hydrating from storage).
export function setRawSessionState(sessionToken, state) {
  if (!state) return
  sessionState.set(sessionToken, state)
}

function hashTranscript(transcript) {
  const text = String(transcript || '')
    .trim()
    .toLowerCase()
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return String(hash)
}

export function beginTranscriptTurn(sessionToken, transcript) {
  const state = getState(sessionToken)
  const transcriptHash = hashTranscript(transcript)

  if (state.turnGuard.inFlight) {
    return {
      allowed: false,
      blocked: true,
      code: 'TURN_IN_PROGRESS',
      message: 'A turn is already being processed for this session.'
    }
  }

  if (
    state.turnGuard.lastTranscriptHash &&
    state.turnGuard.lastTranscriptHash === transcriptHash &&
    state.turnGuard.lastResponse
  ) {
    return {
      allowed: false,
      duplicate: true,
      response: state.turnGuard.lastResponse
    }
  }

  state.turnGuard.inFlight = true
  return { allowed: true, transcriptHash }
}

export function completeTranscriptTurn(sessionToken, transcriptHash, response) {
  const state = getState(sessionToken)
  state.turnGuard.inFlight = false
  state.turnGuard.lastTranscriptHash = transcriptHash || null
  state.turnGuard.lastResponse = response || null
}

export function failTranscriptTurn(sessionToken) {
  const state = getState(sessionToken)
  state.turnGuard.inFlight = false
}

export function initOrchestratorSession(sessionToken) {
  const state = getState(sessionToken)
  if (!state.orchestrator) {
    state.orchestrator = createDefaultOrchestratorSession()
  }
  return state.orchestrator
}

export function getOrchestratorSession(sessionToken) {
  return initOrchestratorSession(sessionToken)
}

export function setHomeInfo(sessionToken, homeInfo) {
  const orchestrator = initOrchestratorSession(sessionToken)
  orchestrator.homeInfo = { ...(homeInfo || {}) }
  return orchestrator.homeInfo
}

export function getHomeInfo(sessionToken) {
  return initOrchestratorSession(sessionToken).homeInfo
}

export function hasHomeInfo(sessionToken) {
  const homeInfo = getHomeInfo(sessionToken)
  return !!(homeInfo && Object.keys(homeInfo).length > 0)
}

export function isHomeInfoComplete(sessionToken) {
  const homeInfo = getHomeInfo(sessionToken) || {}
  return !!(homeInfo.mode && homeInfo.location && homeInfo.size)
}

export function setSelectedSKU(sessionToken, sku) {
  const orchestrator = initOrchestratorSession(sessionToken)
  orchestrator.selectedSKU = sku || null
}

export function getSelectedSKU(sessionToken) {
  return initOrchestratorSession(sessionToken).selectedSKU
}

export function updateUserInfoFields(sessionToken, input = {}) {
  const orchestrator = initOrchestratorSession(sessionToken)
  // eslint-disable-next-line no-unused-vars
  for (const field of USER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue
    const nextValue = input[field]
    if (nextValue === undefined || nextValue === null || nextValue === '')
      continue

    const currentValue = orchestrator.userInfo[field]?.value ?? null
    const normalized = String(nextValue).trim()
    if (!normalized) continue

    // Any explicit update marks only that field as pending reconfirmation.
    if (currentValue !== normalized) {
      orchestrator.userInfo[field] = { value: normalized, confirmed: false }
    }
  }
  return orchestrator.userInfo
}

export function confirmUserInfoField(sessionToken, field, confirmed = true) {
  if (!USER_FIELDS.includes(field)) return
  const orchestrator = initOrchestratorSession(sessionToken)
  const existing = orchestrator.userInfo[field] || {
    value: null,
    confirmed: false
  }
  orchestrator.userInfo[field] = { ...existing, confirmed: !!confirmed }
}

export function confirmAllUserInfoFields(sessionToken) {
  const orchestrator = initOrchestratorSession(sessionToken)
  // eslint-disable-next-line no-unused-vars
  for (const field of USER_FIELDS) {
    const value = orchestrator.userInfo[field]?.value ?? null
    orchestrator.userInfo[field] = {
      value,
      confirmed: !!value
    }
  }
}

export function setScheduledTime(sessionToken, scheduledTime) {
  const orchestrator = initOrchestratorSession(sessionToken)
  orchestrator.scheduledTime = scheduledTime || null
}

export function getScheduleValidation(sessionToken) {
  const orchestrator = initOrchestratorSession(sessionToken)
  const missing = []
  const unconfirmed = []
  // eslint-disable-next-line no-unused-vars
  for (const field of USER_FIELDS) {
    const entry = orchestrator.userInfo[field] || {
      value: null,
      confirmed: false
    }
    if (!entry.value) missing.push(field)
    if (!entry.confirmed) unconfirmed.push(field)
  }
  return {
    missing,
    unconfirmed,
    allValuesPresent: missing.length === 0,
    allConfirmed: missing.length === 0 && unconfirmed.length === 0
  }
}

export function canRenderDateTimeCards(sessionToken) {
  return getScheduleValidation(sessionToken).allConfirmed
}

export function getLLMSessionSnapshot(sessionToken) {
  return initOrchestratorSession(sessionToken)
}

export function getConversationPhase(sessionToken) {
  const orchestrator = initOrchestratorSession(sessionToken)
  const hasAnyUserInfo = USER_FIELDS.some(field => {
    const entry = orchestrator.userInfo[field]
    return !!(entry && entry.value)
  })

  if (!isHomeInfoComplete(sessionToken)) return PHASES.QUALIFICATION
  if (hasAnyUserInfo || orchestrator.scheduledTime) return PHASES.BOOKING
  if (orchestrator.selectedSKU) return PHASES.DETAIL
  return PHASES.RECOMMENDATION
}

export function validateToolCallGuardrails(sessionToken, toolName) {
  const orchestrator = initOrchestratorSession(sessionToken)
  const phase = getConversationPhase(sessionToken)

  if (toolName === 'schedule_visit' || toolName === 'confirm_booking') {
    const schedule = getScheduleValidation(sessionToken)
    if (!schedule.allConfirmed) {
      return {
        allowed: false,
        code: 'USER_INFO_NOT_CONFIRMED',
        message:
          'Scheduling requires name, phone, address, and email, and all four must be confirmed.',
        required: [
          'userInfo.name.value',
          'userInfo.phone.value',
          'userInfo.address.value',
          'userInfo.email.value',
          'userInfo.name.confirmed === true',
          'userInfo.phone.confirmed === true',
          'userInfo.address.confirmed === true',
          'userInfo.email.confirmed === true'
        ],
        missing: schedule.missing,
        unconfirmed: schedule.unconfirmed,
        session: orchestrator
      }
    }
  }

  return { allowed: true, phase }
}

export { PHASES }

// Legacy exports kept for compatibility during migration away from deterministic flow.
export const FLOW_STATES = Object.freeze({})

export function getFlowState(_sessionToken) {
  return null
}

export function transitionFlowState(_sessionToken, _targetState) {
  return { success: true, previous: null, current: null }
}

export function isUserInfoComplete(sessionToken) {
  return getScheduleValidation(sessionToken).allValuesPresent
}

export async function incrementExchangeCount(sessionToken) {
  const state = getState(sessionToken)
  state.exchangeCount++
}

export async function setModelFocus(sessionToken, modelId) {
  const state = getState(sessionToken)
  state.modelFocus = modelId
}

export async function recordInterestSignal(sessionToken, signal) {
  const state = getState(sessionToken)
  state.interestSignals.push({ signal, at: Date.now() })
}

export function getSessionState(sessionToken) {
  return getState(sessionToken)
}

// [NEW FLOW] User info helpers
export function setUserInfo(sessionToken, info) {
  updateUserInfoFields(sessionToken, info)
}

export function getUserInfo(sessionToken) {
  const orchestrator = initOrchestratorSession(sessionToken)
  return {
    name: orchestrator.userInfo.name.value,
    phone: orchestrator.userInfo.phone.value,
    address: orchestrator.userInfo.address.value,
    email: orchestrator.userInfo.email.value
  }
}

// [NEW FLOW] Booking state helpers — array-based, one entry per product
export function setBookingState(sessionToken, booking) {
  const state = getState(sessionToken)
  // If a booking for this product already exists, update it; otherwise push new entry
  const existing = state.bookingState.find(
    b => b.productId === booking.productId
  )
  if (existing) {
    Object.assign(existing, booking)
  } else {
    state.bookingState.push({ ...booking })
  }
}

// Returns the most recent booking, or booking for a specific productId
export function getBookingState(sessionToken, productId) {
  const state = getState(sessionToken)
  if (productId) {
    return state.bookingState.find(b => b.productId === productId) || null
  }
  return state.bookingState.length > 0
    ? state.bookingState[state.bookingState.length - 1]
    : null
}

// [NEW FLOW] Booked product tracking — prevents re-entry into booking flow for same product
export function addBookedProduct(sessionToken, productId) {
  const state = getState(sessionToken)
  state.bookedProductIds.add(productId?.toLowerCase())
}

export function isProductBooked(sessionToken, productId) {
  const state = getState(sessionToken)
  return state.bookedProductIds.has(productId?.toLowerCase())
}

export function getBookedProductIds(sessionToken) {
  return [...getState(sessionToken).bookedProductIds]
}

// [NEW — Phase 1 / R3] Return the session's stable booking slots, generating them
// exactly once via the injected `generator` and caching on session state. Every
// later call (re-render, the second trigger path) returns the identical set, which
// kills the random time-mismatch between confirm_user_info and GET /booking-slots.
// The generator is dependency-injected so this module never imports data-builders.js
// (avoids a circular dependency: data-builders imports nothing from here today).
export function getOrCreateBookingSlots(sessionToken, generator) {
  const state = getState(sessionToken)
  if (!Array.isArray(state.bookingSlots) || state.bookingSlots.length === 0) {
    state.bookingSlots = generator()
    console.log('[SESSION STATE] Generated and cached booking slots')
  } else {
    console.log('[SESSION STATE] Reusing cached booking slots')
  }
  return state.bookingSlots
}
