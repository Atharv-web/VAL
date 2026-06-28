import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateBookingSlots } from './core/helpers/data-builders.js' // [NEW FLOW]
import { getModelConfig, getModelsInfo, hasModel } from './core/config/index.js'
import {
  validateMessage,
  validateSessionToken,
  validateAssistantResponse,
  validateToolEnvelope
} from './core/helpers/validation.js'
import { extractEmailFromTranscript } from './core/helpers/email-parser.js'
import {
  initOrchestratorSession,
  getLLMSessionSnapshot,
  setHomeInfo,
  getHomeInfo,
  isHomeInfoComplete,
  setSelectedSKU,
  getSelectedSKU,
  setUserInfo,
  getUserInfo,
  confirmAllUserInfoFields,
  confirmUserInfoField,
  canRenderDateTimeCards,
  getScheduleValidation,
  validateToolCallGuardrails,
  setScheduledTime,
  setBookingState,
  addBookedProduct,
  isProductBooked,
  isUserInfoComplete,
  withSessionLock,
  beginTranscriptTurn,
  completeTranscriptTurn,
  failTranscriptTurn,
  getConversationPhase,
  getOrCreateBookingSlots // [NEW — Phase 1 / R3] per-session stable slot cache
} from './core/helpers/session-state.js'
import {
  logConversationMessage,
  logError as logPosthogError,
  logSecurityEvent,
  logSessionConfig,
  logSessionCreated,
  logTokenUsage,
  logToolExecutionError,
  registerSession
} from './services/posthog-logger.js'
import {
  addConversationMessage,
  getConversationHistory,
  getConversationTokenEstimate,
  pruneConversationHistory
} from './services/supabase/conversation-store.js'
import {
  getCachedCompetitorCatalog,
  loadLocalCompetitorCatalog,
  ensureCompetitorCatalogCache
} from './services/supabase/competitor-store.js'
import { getTotalSummary, logUsage } from './services/token-monitor.js'
import {
  executeToolCall,
  getSessionConfig
} from './services/webrtc-tools-service.js'
import {
  validSessions,
  hydrateSession,
  persistSession
} from './voice-agent-lennox.helper.js'

// Debug logging flag - set VOICE_AGENT_DEBUG=true in .env to enable
const DEBUG = process.env.VOICE_AGENT_DEBUG === 'true'
const DEFAULT_LENNOX_ASSETS_BASE_URL =
  'https://ak-dyno-dump.s3.amazonaws.com/nudge-voice-assets/images/lennox-assets/'
const lennoxAssetsBaseUrl =
  process.env.LENNOX_ASSETS_BASE_URL || DEFAULT_LENNOX_ASSETS_BASE_URL
const LENNOX_ASSETS_BASE_URL = lennoxAssetsBaseUrl.endsWith('/')
  ? lennoxAssetsBaseUrl
  : `${lennoxAssetsBaseUrl}/`
const JOURNEY_MEDIA_TARGET_COUNT = 4

const buildLennoxImageUrl = productId =>
  `${LENNOX_ASSETS_BASE_URL}${String(productId || '').trim()}.png`
const buildYoutubeThumbnailUrl = videoId =>
  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`

const mergeJourneyMediaItems = (
  primaryItems = [],
  fallbackItems = [],
  getItemKey = item => JSON.stringify(item),
  limit = JOURNEY_MEDIA_TARGET_COUNT
) => {
  const merged = [...primaryItems, ...fallbackItems]
  const seen = new Set()
  const uniqueItems = []

  // eslint-disable-next-line no-unused-vars
  for (const item of merged) {
    const key = String(getItemKey(item) || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniqueItems.push(item)
    if (uniqueItems.length >= limit) break
  }

  return uniqueItems
}

const log = (...args) => {
  if (DEBUG) console.log('[LENNOX VOICE AGENT]', ...args)
}

const logWarn = (...args) => {
  if (DEBUG) console.warn('[LENNOX VOICE AGENT]', ...args)
}

const logError = (...args) => {
  // Always log errors
  console.error('LENNOX VOICE AGENT]', ...args)
}

// Get token usage stats
export const getTokenUsage = (_req, res) => {
  const summary = getTotalSummary()
  res.json({
    status: 'success',
    usage: summary,
    timestamp: new Date().toISOString()
  })
}

// Map zip code prefix ranges to US state abbreviations for filtering
const ZIP_STATE_RANGES = [
  [35004, 36925, 'AL'],
  [99501, 99950, 'AK'],
  [85001, 86556, 'AZ'],
  [71601, 72959, 'AR'],
  [90001, 96162, 'CA'],
  [80001, 81658, 'CO'],
  [6001, 6928, 'CT'],
  [19701, 19980, 'DE'],
  [32004, 34997, 'FL'],
  [30001, 31999, 'GA'],
  [96701, 96898, 'HI'],
  [83201, 83876, 'ID'],
  [60001, 62999, 'IL'],
  [46001, 47997, 'IN'],
  [50001, 52809, 'IA'],
  [66002, 67954, 'KS'],
  [40003, 42788, 'KY'],
  [70001, 71497, 'LA'],
  [3901, 4992, 'ME'],
  [20601, 21930, 'MD'],
  [1001, 2791, 'MA'],
  [48001, 49971, 'MI'],
  [55001, 56763, 'MN'],
  [38601, 39776, 'MS'],
  [63001, 65899, 'MO'],
  [59001, 59937, 'MT'],
  [68001, 69367, 'NE'],
  [88901, 89883, 'NV'],
  [3031, 3897, 'NH'],
  [7001, 8989, 'NJ'],
  [87001, 88441, 'NM'],
  [10001, 14975, 'NY'],
  [27006, 28909, 'NC'],
  [58001, 58856, 'ND'],
  [43001, 45999, 'OH'],
  [73001, 74966, 'OK'],
  [97001, 97920, 'OR'],
  [15001, 19640, 'PA'],
  [2801, 2940, 'RI'],
  [29001, 29948, 'SC'],
  [57001, 57799, 'SD'],
  [37010, 38589, 'TN'],
  [75001, 79999, 'TX'],
  [84001, 84784, 'UT'],
  [5001, 5907, 'VT'],
  [20101, 24658, 'VA'],
  [98001, 99403, 'WA'],
  [24701, 26886, 'WV'],
  [53001, 54990, 'WI'],
  [82001, 83128, 'WY']
]

function zipToState(zip) {
  const z = parseInt(zip, 10)
  const match = ZIP_STATE_RANGES.find(([lo, hi]) => z >= lo && z <= hi)
  return match ? match[2] : null
}

// Lennox dealer locator -- proxies the Lennox API so the API key stays server-side
export const findDealers = async (req, res) => {
  try {
    const zip = (req.query.zip || '').trim().replace(/[^0-9]/g, '')
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'A valid 5-digit zip is required' })
    }

    const response = await fetch(
      'https://www.lennox.com/api/residential/v2/4rroifG/dealers',
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LennoxDealerLocator/1.0'
        }
      }
    )

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: 'Dealer locator API unavailable', dealers: [] })
    }

    const data = await response.json()
    const raw = Array.isArray(data)
      ? data
      : data.dealers || data.results || data.data || []

    if (!raw.length) {
      return res.json({ dealers: [], empty: true })
    }

    // Filter to dealers in the same state as the provided zip, then take top 2
    const targetState = zipToState(zip)
    const stateNames = {
      AL: 'Alabama',
      AK: 'Alaska',
      AZ: 'Arizona',
      AR: 'Arkansas',
      CA: 'California',
      CO: 'Colorado',
      CT: 'Connecticut',
      DE: 'Delaware',
      FL: 'Florida',
      GA: 'Georgia',
      HI: 'Hawaii',
      ID: 'Idaho',
      IL: 'Illinois',
      IN: 'Indiana',
      IA: 'Iowa',
      KS: 'Kansas',
      KY: 'Kentucky',
      LA: 'Louisiana',
      ME: 'Maine',
      MD: 'Maryland',
      MA: 'Massachusetts',
      MI: 'Michigan',
      MN: 'Minnesota',
      MS: 'Mississippi',
      MO: 'Missouri',
      MT: 'Montana',
      NE: 'Nebraska',
      NV: 'Nevada',
      NH: 'New Hampshire',
      NJ: 'New Jersey',
      NM: 'New Mexico',
      NY: 'New York',
      NC: 'North Carolina',
      ND: 'North Dakota',
      OH: 'Ohio',
      OK: 'Oklahoma',
      OR: 'Oregon',
      PA: 'Pennsylvania',
      RI: 'Rhode Island',
      SC: 'South Carolina',
      SD: 'South Dakota',
      TN: 'Tennessee',
      TX: 'Texas',
      UT: 'Utah',
      VT: 'Vermont',
      VA: 'Virginia',
      WA: 'Washington',
      WV: 'West Virginia',
      WI: 'Wisconsin',
      WY: 'Wyoming'
    }
    const targetStateName = targetState ? stateNames[targetState] : null

    const filtered = targetStateName
      ? raw.filter(d => d.state === targetStateName || d.state === targetState)
      : raw

    const dealers = (filtered.length ? filtered : raw).slice(0, 2).map(d => ({
      name: d.name || 'Lennox Dealer',
      city: d.city || '',
      zip: d.postalCode || d.zip || ''
    }))

    return res.json({ dealers })
  } catch (err) {
    logError('[VOICE AGENT] findDealers error:', err)
    return res.status(500).json({ error: err.message, dealers: [] })
  }
}

// [NEW FLOW] Return booking slot options for the date/time picker card
export const getBookingSlots = async (req, res) => {
  const sessionToken = req.query.session_token
  await hydrateSession(sessionToken)
  if (!sessionToken || !validSessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Invalid session' })
  }

  if (!canRenderDateTimeCards(sessionToken)) {
    const validation = getScheduleValidation(sessionToken)
    return res.status(403).json({
      allowed: false,
      blocked: true,
      code: 'DATE_TIME_NOT_APPROVED',
      missing_fields: validation.missing,
      unconfirmed_fields: validation.unconfirmed
    })
  }

  // [CHANGED — Phase 1 / R3] Use the per-session cached slots so this GET route and
  // the confirm_user_info tool result return the identical set for the same session.
  const slots = getOrCreateBookingSlots(sessionToken, generateBookingSlots)
  await persistSession(sessionToken)
  return res.json({ allowed: true, booking_slots: slots })
}

const normalizeTranscript = text =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// eslint-disable-next-line no-unused-vars
const extractHomeInfoFromTranscript = (transcript, current = {}) => {
  const normalized = normalizeTranscript(transcript)
  const next = {
    mode: current.mode || null,
    location: current.location || null,
    size: current.size || null
  }

  if (!next.mode) {
    if (
      /\b(heating_cooling|both|heating and cooling|heat and cool|heat pump)\b/.test(
        normalized
      )
    )
      next.mode = 'both'
    else if (/\b(cooling|cool|ac|air conditioning)\b/.test(normalized))
      next.mode = 'cooling'
    else if (/\b(heating|heat|furnace)\b/.test(normalized))
      next.mode = 'heating'
  }

  if (!next.location) {
    if (/\bbasement\b/.test(normalized)) next.location = 'basement'
    else if (/\bcrawlspace\b|\bcrawl space\b/.test(normalized))
      next.location = 'crawlspace'
    else if (/\bgarage\b/.test(normalized)) next.location = 'garage'
    else if (/\battic\b/.test(normalized)) next.location = 'attic'
  }

  if (!next.size) {
    const sqftMatch = normalized.match(
      /(\d{3,5})\s*(sq\s*ft|sqft|square feet|square foot)?/
    )
    const sqft = sqftMatch ? Number.parseInt(sqftMatch[1], 10) : null
    if (sqft && !Number.isNaN(sqft)) {
      if (sqft < 1200) next.size = 'small'
      else if (sqft < 1800) next.size = 'small_mid'
      else if (sqft <= 2400) next.size = 'medium'
      else if (sqft <= 3200) next.size = 'mid_large'
      else next.size = 'large'
    } else if (/\bsmall mid\b|\bsmall-mid\b/.test(normalized))
      next.size = 'small_mid'
    else if (/\bsmall\b/.test(normalized)) next.size = 'small'
    else if (/\bmedium\b/.test(normalized)) next.size = 'medium'
    else if (/\bmid large\b|\bmid-large\b/.test(normalized))
      next.size = 'mid_large'
    else if (/\blarge\b|\bbig\b/.test(normalized)) next.size = 'large'
  }

  return next
}

// eslint-disable-next-line no-unused-vars
const getCurrentQualificationField = homeInfo => {
  if (!homeInfo?.mode) return 'mode'
  if (!homeInfo?.location) return 'location'
  if (!homeInfo?.size) return 'size'
  return null
}

const looksLikeQualifierPromptEcho = normalized => {
  if (!normalized) return false
  return (
    /are you looking for/.test(normalized) ||
    /where will the unit be installed/.test(normalized) ||
    /roughly how big is the space/.test(normalized) ||
    /cooling heating or both/.test(normalized) ||
    /basement crawlspace garage attic/.test(normalized)
  )
}

const extractModeFromTranscript = transcript => {
  const normalized = normalizeTranscript(transcript)
  if (!normalized || looksLikeQualifierPromptEcho(normalized)) return null

  // Block option-list echoes like "cooling, heating, or both".
  if (
    /cooling.*heating.*or.*both/.test(normalized) ||
    /heating.*cooling.*or.*both/.test(normalized)
  ) {
    return null
  }

  const hasExplicitBoth = /\b(heating_cooling|both|heating and cooling|heat and cool|heat pump)\b/.test(
    normalized
  )
  if (hasExplicitBoth) return 'both'

  const hasCooling = /\b(cooling|cool|ac|air conditioning)\b/.test(normalized)
  const hasHeating = /\b(heating|heat|furnace)\b/.test(normalized)

  if (hasCooling && !hasHeating) return 'cooling'
  if (hasHeating && !hasCooling) return 'heating'
  return null
}

const extractLocationFromTranscript = transcript => {
  const normalized = normalizeTranscript(transcript)
  if (!normalized || looksLikeQualifierPromptEcho(normalized)) return null

  const matches = []
  if (/\bbasement\b/.test(normalized)) matches.push('basement')
  if (/\bcrawlspace\b|\bcrawl space\b/.test(normalized))
    matches.push('crawlspace')
  if (/\bgarage\b/.test(normalized)) matches.push('garage')
  if (/\battic\b/.test(normalized)) matches.push('attic')

  if (matches.length === 1) return matches[0]
  return null
}

const extractSizeFromTranscript = transcript => {
  const normalized = normalizeTranscript(transcript)
  if (!normalized || looksLikeQualifierPromptEcho(normalized)) return null

  const sqftMatch = normalized.match(
    /(\d{3,5})\s*(sq\s*ft|sqft|square feet|square foot)?/
  )
  const sqft = sqftMatch ? Number.parseInt(sqftMatch[1], 10) : null
  if (sqft && !Number.isNaN(sqft)) {
    if (sqft < 1200) return 'small'
    if (sqft < 1800) return 'small_mid'
    if (sqft <= 2400) return 'medium'
    if (sqft <= 3200) return 'mid_large'
    return 'large'
  }
  const matches = []
  const hasSmallMid = /\bsmall mid\b|\bsmall-mid\b/.test(normalized)
  const hasMidLarge = /\bmid large\b|\bmid-large\b/.test(normalized)

  if (hasSmallMid) matches.push('small_mid')
  if (hasMidLarge) matches.push('mid_large')
  if (/\bsmall\b/.test(normalized) && !hasSmallMid) matches.push('small')
  if (/\bmedium\b/.test(normalized)) matches.push('medium')
  if (/\blarge\b|\bbig\b/.test(normalized) && !hasMidLarge)
    matches.push('large')

  const unique = [...new Set(matches)]
  if (unique.length === 1) return unique[0]
  return null
}

const extractQualificationValueForField = (field, transcript) => {
  if (field === 'mode') return extractModeFromTranscript(transcript)
  if (field === 'location') return extractLocationFromTranscript(transcript)
  if (field === 'size') return extractSizeFromTranscript(transcript)
  return null
}

const NUDGE_ENTRY_VARIANTS = [
  {
    id: 'nudge-1',
    pattern: /new home|replacing an existing system/,
    variants: [
      'Let me understand your situation so I can guide you to the smartest long term decision.',
      'Let’s narrow this down and find what fits your home best.'
    ]
  },
  {
    id: 'nudge-2',
    pattern: /hot and cold spots|upgrading efficiency/,
    variants: [
      'That is exactly the right place to start.',
      'Let’s focus on how your home distributes and retains conditioned air so we choose the right fit.'
    ]
  },
  {
    id: 'nudge-3',
    pattern: /worth it for your home|\bworth it\b/,
    variants: [
      'It depends, because “worth it” comes down to performance, longevity, and long term savings.',
      'Share a bit about your home and usage, and I’ll pinpoint what suits you best.'
    ]
  },
  {
    id: 'nudge-4',
    pattern: /every sale has a story|what they re saying|reviews/,
    variants: [
      'Reviews are useful, but the real outcome depends on proper sizing and installation quality.',
      'Let’s tailor this to your setup so the recommendation is truly relevant.'
    ]
  },
  {
    id: 'nudge-5',
    pattern: /replace just the outdoor unit|outdoor unit|full system/,
    variants: [
      'Replacing only the outdoor unit can seem efficient, but true performance comes from a matched indoor outdoor system.',
      'Smart question, because scope decisions directly affect comfort and long term efficiency.'
    ]
  }
]

const NUDGE_PATTERNS = NUDGE_ENTRY_VARIANTS.map(entry => entry.pattern)

const selectDeterministicVariantIndex = (seed, size) => {
  if (!size || size <= 1) return 0
  const key = String(seed || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % size
}

const getNudgeEntryLead = (transcript, sessionToken = '') => {
  const t = normalizeTranscript(transcript)
  if (!t) return null
  const matchedEntry = NUDGE_ENTRY_VARIANTS.find(entry => entry.pattern.test(t))
  if (!matchedEntry || !matchedEntry.variants?.length) return null
  const index = selectDeterministicVariantIndex(
    `${sessionToken}:${matchedEntry.id}`,
    matchedEntry.variants.length
  )
  return matchedEntry.variants[index]
}

const getNextHomeInfoPrompt = homeInfo => {
  if (!homeInfo.mode) {
    return {
      message: 'Are you looking for cooling, heating, or both?',
      ui_components: [
        {
          type: 'qualification_cards',
          field: 'mode',
          layout: 'icon_row',
          options: [
            { label: 'Heating + Cooling', value: 'both' },
            { label: 'Heating', value: 'heating' },
            { label: 'Cooling', value: 'cooling' }
          ]
        }
      ]
    }
  }
  if (!homeInfo.location) {
    return {
      message:
        'Where will the unit be installed: basement, crawlspace, garage, or attic?',
      ui_components: [
        {
          type: 'qualification_cards',
          field: 'location',
          layout: 'icon_row',
          options: [
            { label: 'Basement', value: 'basement' },
            { label: 'Crawlspace', value: 'crawlspace' },
            { label: 'Garage', value: 'garage' },
            { label: 'Attic', value: 'attic' }
          ]
        }
      ]
    }
  }
  if (!homeInfo.size) {
    return {
      message: 'Roughly how big is the space you want to cool?',
      ui_components: [
        {
          type: 'qualification_cards',
          field: 'size',
          layout: 'stacked_rows',
          options: [
            { label: 'Small (0-1200 sq.ft.)', value: 'small' },
            { label: 'Small-Mid (1200-1800 sq.ft.)', value: 'small_mid' },
            { label: 'Medium (1800-2400 sq.ft.)', value: 'medium' },
            { label: 'Mid-Large (2400-3200 sq.ft.)', value: 'mid_large' },
            { label: 'Large (3200+ sq.ft.)', value: 'large' }
          ]
        }
      ]
    }
  }
  // return {
  //   message: `Thanks. I have ${homeInfo.mode}, ${homeInfo.location}, and ${homeInfo.size}.`,
  //   ui_components: []
  // }
}

const chooseRecommendedSku = homeInfo => {
  if (
    homeInfo.mode === 'cooling' &&
    ['small', 'small_mid', 'medium'].includes(homeInfo.size)
  )
    return 'el16xc1'
  if (
    homeInfo.mode === 'cooling' &&
    ['mid_large', 'large'].includes(homeInfo.size)
  )
    return 'xc21'
  // Default fallback for heating/both or any unmatched combination
  return 'el16xc1'
}

const BOOKING_FIELD_ORDER = ['name', 'phone', 'address', 'email']
const DETAIL_INTENT_PATTERN = /\b(details?|tell me more|more info|more information|specs?|specifications?|features?|seer|seer2|noise|quiet|warranty|breakdown|explain)\b/
const COMPARISON_INTENT_PATTERN = /\b(compare|comparison|vs|versus|against)\b/
const BOOKING_INTENT_PATTERN = /\b(book|booking|schedule|appointment|visit|dealer visit|dealer|dealership|set it up|go ahead|proceed|move forward|lets do it|let's do it|buy now|purchase)\b/
const AFFIRMATIVE_PATTERN = /\b(yes|yep|yeah|correct|that.?s right|looks good|all good|confirmed|confirm)\b/
const NEGATIVE_PATTERN = /\b(no|nope|wrong|incorrect|change|not correct|fix|update)\b/

const TURN_TOOL_ALLOWLIST_BY_PHASE = {
  qualification: new Set([
    'show_comfort_needs',
    'show_installation_location',
    'show_space_size'
  ]),
  recommendation: new Set([
    'suggest_sku',
    'show_journey_media',
    'show_competitor_comparison'
  ]),
  detail: new Set([
    'suggest_sku',
    'show_journey_media',
    'show_competitor_comparison'
  ]),
  booking: new Set([
    'collect_user_info',
    'confirm_user_info',
    'schedule_visit',
    'confirm_booking'
  ])
}

let competitorCatalogCache = null
let lennoxProductsRowsCache = null

const getLennoxProductsRows = () => {
  if (Array.isArray(lennoxProductsRowsCache)) return lennoxProductsRowsCache

  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  const candidatePaths = [
    // Works in dev/watch + bundled runtime (run.js at project root)
    path.join(
      process.cwd(),
      'src/services/voice-agent-lennox/core/helpers/lennox-products.json'
    ),
    // Works when import.meta.url resolves to src/services/voice-agent-lennox
    path.join(baseDir, 'core/helpers/lennox-products.json'),
    // Fallback for edge bundling layouts
    path.join(
      baseDir,
      'src/services/voice-agent-lennox/core/helpers/lennox-products.json'
    )
  ]

  const productsJsonPath = candidatePaths.find(candidate =>
    fs.existsSync(candidate)
  )

  if (!productsJsonPath) {
    throw new Error(
      '[VOICE AGENT] lennox-products.json not found in expected paths'
    )
  }

  const raw = fs.readFileSync(productsJsonPath, 'utf8')
  const parsed = JSON.parse(raw)
  const rows = parsed?.databases?.products?.tables?.products?.rows

  if (!Array.isArray(rows)) {
    throw new Error(
      '[VOICE AGENT] Invalid lennox-products.json format: products rows missing'
    )
  }

  lennoxProductsRowsCache = rows
  return lennoxProductsRowsCache
}

const sortByRatingDesc = rows =>
  [...rows].sort((a, b) => {
    const aRating = Number(a?.rating ?? -1)
    const bRating = Number(b?.rating ?? -1)
    return bRating - aRating
  })

const normalizeLikeParam = value =>
  String(value || '')
    .toLowerCase()
    .replace(/%/g, '')

const executeProductsQuery = (query, params = []) => {
  const sql = String(query || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const rows = getLennoxProductsRows()

  if (sql.includes("lower(replace(id,'-','')) = ?")) {
    const needle = String(params[0] || '')
      .toLowerCase()
      .replace(/[\s-]/g, '')
    return rows
      .filter(
        row =>
          String(row?.id || '')
            .toLowerCase()
            .replace(/-/g, '')
            .includes(needle) &&
          String(row?.id || '')
            .toLowerCase()
            .replace(/-/g, '') === needle
      )
      .slice(0, 1)
  }

  if (sql.includes('lower(id) like ?')) {
    const needle = normalizeLikeParam(params[0])
    return sortByRatingDesc(
      rows.filter(row =>
        String(row?.id || '')
          .toLowerCase()
          .includes(needle)
      )
    ).slice(0, 1)
  }

  if (sql.includes('lower(series) like ?')) {
    const needle = normalizeLikeParam(params[0])
    const limit = Math.max(1, Number(params[1]) || 1)
    return sortByRatingDesc(
      rows.filter(row =>
        String(row?.series || '')
          .toLowerCase()
          .includes(needle)
      )
    ).slice(0, limit)
  }

  if (sql.includes('price_display = ?')) {
    const tier = String(params[0] || '')
    return sortByRatingDesc(
      rows.filter(row => String(row?.price_display || '') === tier)
    ).slice(0, 1)
  }

  logWarn(`[VOICE AGENT] Unsupported products query: ${query}`)
  return []
}

const getProductsDb = () => ({
  prepare: query => ({
    all: (...params) => executeProductsQuery(query, params)
  })
})

const getPhaseToolAllowlist = session_token => {
  const phase = getConversationPhase(session_token)
  return TURN_TOOL_ALLOWLIST_BY_PHASE[phase] || new Set()
}

const filterTurnToolCallsByPhase = (session_token, toolCalls = []) => {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return []
  const allowlist = getPhaseToolAllowlist(session_token)
  return toolCalls.filter(call => call?.name && allowlist.has(call.name))
}

const getJourneyMediaBundle = type => {
  const videos = [
    {
      title: 'Lennox Central Air Conditioner - What You Should Know',
      url: 'https://www.youtube.com/watch?v=IV275LGcN1o',
      videoId: 'IV275LGcN1o',
      thumbnail_url: 'https://img.youtube.com/vi/IV275LGcN1o/mqdefault.jpg'
    },
    {
      title:
        'Lennox XC21 2 Stage Cooling - Innovative and Most Energy Efficient',
      url: 'https://www.youtube.com/watch?v=cJHg0ZcJd_I',
      videoId: 'cJHg0ZcJd_I',
      thumbnail_url: 'https://img.youtube.com/vi/cJHg0ZcJd_I/mqdefault.jpg'
    },
    {
      title: 'Lennox Elite EL16XC1 Install 2021',
      url: 'https://www.youtube.com/watch?v=GmjuTp5_uWA',
      videoId: 'GmjuTp5_uWA',
      thumbnail_url: 'https://img.youtube.com/vi/GmjuTp5_uWA/mqdefault.jpg'
    },
    {
      title: 'Lennox XC21 Air Conditioner Installation Review',
      url: 'https://www.youtube.com/watch?v=4iSHhVMgtLg',
      videoId: '4iSHhVMgtLg',
      thumbnail_url: 'https://img.youtube.com/vi/4iSHhVMgtLg/mqdefault.jpg'
    }
  ]
  const reviews = [
    {
      text:
        'Lennox has the highest efficiency ratings of any major HVAC company, which means higher long-term energy savings.',
      source: "Today's Homeowner - Lennox Air Conditioner Review"
    },
    {
      text:
        'Lennox AC reviews are largely positive and often mention durability, reliability, and quiet operation.',
      source: 'Harp Home Services - Are Lennox HVAC Systems Worth It?'
    },
    {
      text:
        "Lennox is an outstanding option if you're installing a new AC in your home, with strong efficiency and near-silent operation on many models.",
      source: "Today's Homeowner - Lennox Air Conditioner Review"
    },
    {
      text:
        'Many Lennox models qualify for Energy Star certification, with durable build quality and advanced comfort features.',
      source: 'The Furnace Outlet - Is Lennox a Good AC Brand?'
    }
  ]
  const bundleVideos = videos.slice(0, JOURNEY_MEDIA_TARGET_COUNT)
  const bundleReviews = reviews.slice(0, JOURNEY_MEDIA_TARGET_COUNT)

  if (type === 'videos')
    return { youtube_references: bundleVideos, reviews: [] }
  if (type === 'reviews')
    return { youtube_references: [], reviews: bundleReviews }
  return { youtube_references: bundleVideos, reviews: bundleReviews }
}

const getCardsForSuggestSku = toolArgs => {
  const db = getProductsDb()
  const { filter_series, model_id, model_ids, limit, sku } = toolArgs || {}
  const requestedModelId = model_id || sku || null

  let rows = []

  if (Array.isArray(model_ids) && model_ids.length) {
    // eslint-disable-next-line no-unused-vars
    for (const mid of model_ids) {
      const idLower = String(mid)
        .toLowerCase()
        .replace(/[\s-]/g, '')
      let found = db
        .prepare(
          "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
        )
        .all(idLower)
      if (!found.length) {
        found = db
          .prepare(
            'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
          )
          .all(`%${idLower}%`)
      }
      if (found.length) rows.push(found[0])
    }
  }

  if (!rows.length && requestedModelId) {
    const idLower = String(requestedModelId)
      .toLowerCase()
      .replace(/[\s-]/g, '')
    rows = db
      .prepare(
        "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
      )
      .all(idLower)
    if (!rows.length) {
      rows = db
        .prepare(
          'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
        )
        .all(`%${idLower}%`)
    }
  }

  if (!rows.length && filter_series && filter_series !== 'all') {
    const seriesMap = {
      signature: 'dave lennox signature collection',
      elite: 'elite series',
      merit: 'merit series'
    }
    const seriesName =
      seriesMap[String(filter_series).toLowerCase()] || filter_series
    const maxCards = limit || 4
    rows = db
      .prepare(
        'SELECT * FROM products WHERE LOWER(series) LIKE ? ORDER BY rating DESC LIMIT ?'
      )
      .all(`%${String(seriesName).toLowerCase()}%`, maxCards)
    if (!rows.length) {
      rows = db
        .prepare(
          'SELECT * FROM products WHERE LOWER(series) LIKE ? ORDER BY rating DESC LIMIT ?'
        )
        .all(`%${String(filter_series).toLowerCase()}%`, maxCards)
    }
  }

  if (!rows.length) {
    rows = ['$$$$', '$$$', '$$', '$'].flatMap(tier =>
      db
        .prepare(
          'SELECT * FROM products WHERE price_display = ? ORDER BY rating DESC LIMIT 1'
        )
        .all(tier)
    )
  }

  return rows.map(p => ({
    id: p.id,
    title: p.title,
    series: p.series,
    image_url: buildLennoxImageUrl(p.id),
    price_display: p.price_display,
    seer: p.seer,
    seer2: p.seer2,
    noise: p.noise,
    energy_star: p.energy_star,
    rating: p.rating,
    reviews: p.reviews,
    features: p.features ? JSON.parse(p.features).slice(0, 3) : [],
    description: p.description,
    refrigerant_type: p.refrigerant_type,
    compressor_stages: p.compressor_stages,
    warranty_compressor_years: p.warranty_compressor_years
  }))
}

const loadCompetitorCatalog = () => {
  if (competitorCatalogCache) return competitorCatalogCache

  const redisCached = getCachedCompetitorCatalog()
  if (Array.isArray(redisCached) && redisCached.length) {
    competitorCatalogCache = redisCached
    return competitorCatalogCache
  }

  const localCatalog = loadLocalCompetitorCatalog()
  if (Array.isArray(localCatalog) && localCatalog.length) {
    competitorCatalogCache = localCatalog
    return competitorCatalogCache
  }

  return []
}

const warmCompetitorCatalogOnStartup = async () => {
  try {
    const cachedCatalog = await ensureCompetitorCatalogCache()
    if (Array.isArray(cachedCatalog) && cachedCatalog.length) {
      competitorCatalogCache = cachedCatalog
      log(
        `[VOICE AGENT] Competitor catalog warm-up complete (${cachedCatalog.length} models)`
      )
      return
    }

    logWarn('[VOICE AGENT] Competitor catalog startup warm-up returned empty')
  } catch (error) {
    logWarn(
      '[VOICE AGENT] Competitor catalog startup warm-up failed:',
      error.message
    )
  }
}

void warmCompetitorCatalogOnStartup()

const detectCompetitorModelId = transcript => {
  const text = String(transcript || '').toLowerCase()
  if (!text) return null
  const competitors = loadCompetitorCatalog()

  // eslint-disable-next-line no-unused-vars
  for (const comp of competitors) {
    const idNorm = String(comp.id || '')
      .toLowerCase()
      .replace(/-/g, ' ')
    const nameNorm = String(comp.model_name || '').toLowerCase()
    if (idNorm && text.includes(idNorm)) return comp.id
    if (nameNorm && text.includes(nameNorm)) return comp.id
    if (comp.brand && comp.model_name) {
      const combo = `${String(comp.brand).toLowerCase()} ${String(
        comp.model_name
      ).toLowerCase()}`
      if (text.includes(combo)) return comp.id
    }
  }
  return null
}

const buildCompetitorComparisonUi = ({ competitorModelId, lennoxModelId }) => {
  const competitors = loadCompetitorCatalog()
  const competitorIdNorm = String(competitorModelId || '')
    .toLowerCase()
    .replace(/[\s_]/g, '-')
  const competitor = competitors.find(
    c =>
      c.id === competitorIdNorm ||
      c.id === competitorModelId ||
      c.model_name?.toLowerCase().replace(/\s+/g, '-') === competitorIdNorm
  )
  if (!competitor) return null

  const activeLennoxId = lennoxModelId || competitor.comparable_lennox_ids?.[0]
  let lennoxCard = null
  if (activeLennoxId) {
    const db = getProductsDb()
    const idLower = String(activeLennoxId)
      .toLowerCase()
      .replace(/[\s-]/g, '')
    let rows = db
      .prepare(
        "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
      )
      .all(idLower)
    if (!rows.length) {
      rows = db
        .prepare(
          'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
        )
        .all(`%${idLower}%`)
    }
    if (rows.length) {
      const p = rows[0]
      lennoxCard = {
        id: p.id,
        brand: 'Lennox',
        title: p.title,
        series: p.series,
        image_url: buildLennoxImageUrl(p.id),
        price_display: p.price_display,
        seer: p.seer,
        seer2: p.seer2,
        noise_db: p.noise,
        compressor_stages: p.compressor_stages,
        warranty_compressor_years: p.warranty_compressor_years,
        warranty_parts_years: p.warranty_parts_years,
        refrigerant_type: p.refrigerant_type
      }
    }
  }

  if (!lennoxCard) return null

  const competitorCard = {
    id: competitor.id,
    brand: competitor.brand,
    title: `${competitor.brand} ${competitor.model_name}`,
    series: competitor.series,
    price_display: competitor.price_tier,
    seer: competitor.seer || null,
    seer2: competitor.seer2 || null,
    noise_db: competitor.noise_db || null,
    compressor_stages: competitor.compressor_type || null,
    warranty_compressor_years: competitor.warranty_compressor_years || null,
    warranty_parts_years: competitor.warranty_parts_years || null,
    refrigerant_type: competitor.refrigerant_type || null
  }

  return { lennox_card: lennoxCard, competitor_card: competitorCard }
}

const executeTurnToolCalls = ({
  session_token,
  sessionData,
  toolCalls = []
}) => {
  const ui_components = []
  const executed = []

  // eslint-disable-next-line no-unused-vars
  for (const call of toolCalls) {
    if (!call?.name) continue
    const guard = validateToolCallGuardrails(session_token, call.name)
    if (!guard.allowed) continue

    if (call.name === 'suggest_sku') {
      const cards = getCardsForSuggestSku(call.arguments || {})
      const selectedSku = cards[0]?.id || call.arguments?.sku || null
      if (selectedSku) {
        setSelectedSKU(session_token, selectedSku)
        sessionData.selectedSKU = selectedSku
      }
      if (cards.length) {
        ui_components.push({ type: 'product_cards', cards })
      }
      executed.push(call)
      continue
    }

    if (call.name === 'show_journey_media') {
      const bundle = getJourneyMediaBundle(call.arguments?.type || 'all')
      ui_components.push({
        type: 'journey_media',
        youtube_references: bundle.youtube_references || [],
        reviews: bundle.reviews || []
      })
      executed.push(call)
      continue
    }

    if (call.name === 'show_competitor_comparison') {
      const comparison = buildCompetitorComparisonUi({
        competitorModelId: call.arguments?.competitor_model_id,
        lennoxModelId:
          call.arguments?.lennox_model_id || sessionData.selectedSKU
      })
      if (comparison?.lennox_card && comparison?.competitor_card) {
        ui_components.push({
          type: 'competitor_comparison',
          lennox_card: comparison.lennox_card,
          competitor_card: comparison.competitor_card
        })
      }
      executed.push(call)
      continue
    }

    // Booking state mutations are already server-controlled in /voice-agent-lennox.
    if (
      [
        'collect_user_info',
        'confirm_user_info',
        'schedule_visit',
        'confirm_booking'
      ].includes(call.name)
    ) {
      executed.push(call)
    }
  }

  return { ui_components, tool_calls: executed }
}

const getProductById = productId => {
  if (!productId) return null
  try {
    const db = getProductsDb()
    const idLower = String(productId)
      .toLowerCase()
      .replace(/[\s-]/g, '')
    let rows = db
      .prepare(
        "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
      )
      .all(idLower)
    if (!rows.length) {
      rows = db
        .prepare(
          'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
        )
        .all(`%${idLower}%`)
    }
    return rows[0] || null
  } catch (_err) {
    return null
  }
}

const buildProductDetailMessage = ({ product, sku, homeInfo }) => {
  if (!product) {
    return `${String(
      sku || ''
    ).toUpperCase()} is a strong fit for your ${homeInfo?.mode ||
      'home comfort'} needs. It is designed for efficient, reliable whole-home performance.`
  }

  const lines = []
  lines.push(
    `${product.title} is a strong fit for your ${homeInfo?.mode ||
      'comfort'} goals.`
  )

  if (product.seer2 || product.seer) {
    if (product.seer2 && product.seer) {
      lines.push(
        `Efficiency is rated up to ${product.seer} SEER and ${product.seer2} SEER2.`
      )
    } else if (product.seer2) {
      lines.push(`Efficiency is rated up to ${product.seer2} SEER2.`)
    } else {
      lines.push(`Efficiency is rated up to ${product.seer} SEER.`)
    }
  }

  if (product.noise) {
    lines.push(
      `Sound levels are as low as about ${product.noise} dB for quieter operation.`
    )
  }

  if (product.compressor_stages) {
    lines.push(
      `It uses a ${product.compressor_stages} compressor design for steadier comfort.`
    )
  }

  if (product.warranty_compressor_years || product.warranty_parts_years) {
    const compressorYears = product.warranty_compressor_years
      ? `${product.warranty_compressor_years}-year compressor`
      : null
    const partsYears = product.warranty_parts_years
      ? `${product.warranty_parts_years}-year parts`
      : null
    const coverage = [compressorYears, partsYears].filter(Boolean).join(' and ')
    if (coverage)
      lines.push(`Coverage includes up to ${coverage} warranty terms.`)
  }

  if (lines.length < 4 && product.description) {
    lines.push(product.description)
  }

  return lines.slice(0, 5).join(' ')
}

const getFirstMissingBookingField = validation =>
  BOOKING_FIELD_ORDER.find(field => validation.missing.includes(field)) || null

const getBookingQuestionForField = field => {
  if (field === 'name')
    return `Great, let's get your dealer visit started. What is your full name?`
  if (field === 'phone')
    return 'Thanks. What is the best phone number for the dealer to reach you?'
  if (field === 'address') return 'Got it. What is the installation address?'
  return 'Perfect. What email should we send your confirmation to?'
}

const extractEmail = transcript => {
  const parsed = extractEmailFromTranscript(transcript)
  log(
    `[BOOKING][EMAIL_PARSE] raw="${parsed.raw}" canonicalized="${parsed.canonicalized}" valid=${parsed.isValid}`
  )
  return parsed.email
}

const DIGIT_WORD_MAP = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9'
}

const normalizeSpokenDigits = transcript => {
  const base = String(transcript || '')
    .toLowerCase()
    .replace(/[\s,.-]+/g, ' ')
    .trim()

  if (!base) return ''

  return base
    .split(' ')
    .map(token => DIGIT_WORD_MAP[token] || token)
    .join('')
}

const extractPhone = transcript => {
  const digits = normalizeSpokenDigits(transcript).replace(/\D/g, '')
  if (!digits) return null
  const ten =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return null
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`
}

const extractName = transcript => {
  const text = String(transcript || '').trim()
  if (!text) return null
  const explicit = text.match(
    /(?:my name is|name is|i am|i'm)\s+([a-z][a-z\s.'-]{1,60})/i
  )
  if (explicit?.[1]) return explicit[1].trim().replace(/[.,!?]+$/g, '')
  if (/[\d@]/.test(text)) return null
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length >= 2 && words.length <= 4) {
    return text.replace(/[.,!?]+$/g, '')
  }
  return null
}

const extractAddress = transcript => {
  const text = String(transcript || '').trim()
  if (!text) return null
  const explicit = text.match(/(?:address is|i live|it is|it's)\s+(.+)/i)
  const candidate = (explicit?.[1] || text).trim().replace(/[.,!?]+$/g, '')
  if (candidate.length < 8) return null
  return candidate
}

const extractBookingFieldValue = (field, transcript) => {
  if (field === 'name') return extractName(transcript)
  if (field === 'phone') return extractPhone(transcript)
  if (field === 'address') return extractAddress(transcript)
  return extractEmail(transcript)
}

const extractIncorrectField = normalized => {
  if (/\bname\b/.test(normalized)) return 'name'
  if (/\b(phone|number|mobile)\b/.test(normalized)) return 'phone'
  if (/\baddress\b/.test(normalized)) return 'address'
  if (/\bemail\b/.test(normalized)) return 'email'
  return null
}

const buildCollectUserInfoToolArgs = userInfo => ({
  name: userInfo?.name || null,
  phone: userInfo?.phone || null,
  address: userInfo?.address || null,
  email: userInfo?.email || null
})

const buildBookingTurn = ({
  session_token,
  transcript,
  sessionData,
  homeInfo
}) => {
  const normalized = normalizeTranscript(transcript)
  const validation = getScheduleValidation(session_token)
  const info = getUserInfo(session_token)

  if (!validation.allValuesPresent) {
    const targetField = getFirstMissingBookingField(validation)
    const extracted = extractBookingFieldValue(targetField, transcript)

    // If this transcript looks like a booking intent trigger, ask for first field directly.
    if (
      !extracted &&
      BOOKING_INTENT_PATTERN.test(normalized) &&
      targetField === 'name'
    ) {
      sessionData.bookingStarted = true
      validSessions.set(session_token, sessionData)
      return {
        message: getBookingQuestionForField('name'),
        ui_components: [],
        tool_calls: [],
        homeInfo,
        home_info_complete: true
      }
    }

    if (!extracted) {
      return {
        message: getBookingQuestionForField(targetField),
        ui_components: [],
        tool_calls: [],
        homeInfo,
        home_info_complete: true
      }
    }

    const updatePayload = {
      name: info.name || null,
      phone: info.phone || null,
      address: info.address || null,
      email: info.email || null,
      [targetField]: extracted
    }

    setUserInfo(session_token, updatePayload)
    const updatedInfo = getUserInfo(session_token)
    const nextValidation = getScheduleValidation(session_token)

    if (nextValidation.allValuesPresent) {
      return {
        message: `Let me confirm your details. Your name is ${updatedInfo.name}, phone number ${updatedInfo.phone}, address ${updatedInfo.address}, and email ${updatedInfo.email}. Is all of that correct?`,
        ui_components: [],
        tool_calls: [
          {
            name: 'collect_user_info',
            arguments: buildCollectUserInfoToolArgs(updatedInfo)
          }
        ],
        homeInfo,
        home_info_complete: true
      }
    }

    const nextField = getFirstMissingBookingField(nextValidation)
    return {
      message: `Thanks. ${getBookingQuestionForField(nextField)}`,
      ui_components: [],
      tool_calls: [
        {
          name: 'collect_user_info',
          arguments: buildCollectUserInfoToolArgs(updatedInfo)
        }
      ],
      homeInfo,
      home_info_complete: true
    }
  }

  // All values present but not fully confirmed: run confirmation loop.
  if (!validation.allConfirmed) {
    const incorrectField = extractIncorrectField(normalized)
    if (NEGATIVE_PATTERN.test(normalized) && incorrectField) {
      confirmUserInfoField(session_token, incorrectField, false)
      return {
        message: `No problem. ${getBookingQuestionForField(incorrectField)}`,
        ui_components: [],
        tool_calls: [
          {
            name: 'confirm_user_info',
            arguments: { incorrect_field: incorrectField }
          }
        ],
        homeInfo,
        home_info_complete: true
      }
    }

    if (AFFIRMATIVE_PATTERN.test(normalized)) {
      confirmAllUserInfoFields(session_token)
      return {
        message: 'Perfect, let me show you available times.',
        ui_components: [{ type: 'booking_slots' }],
        tool_calls: [
          { name: 'confirm_user_info', arguments: { confirmed_all: true } }
        ],
        homeInfo,
        home_info_complete: true
      }
    }

    return {
      message: `Let me confirm your details. Your name is ${info.name}, phone number ${info.phone}, address ${info.address}, and email ${info.email}. Is all of that correct?`,
      ui_components: [],
      tool_calls: [],
      homeInfo,
      home_info_complete: true
    }
  }

  // Confirmation already complete; keep the booking handoff deterministic.
  return {
    message: 'Great, let me show you available times.',
    ui_components: [{ type: 'booking_slots' }],
    tool_calls: [],
    homeInfo,
    home_info_complete: true
  }
}

const buildPostQualificationTurn = ({
  session_token,
  transcript,
  sessionData
}) => {
  const normalized = normalizeTranscript(transcript)
  const homeInfo = getHomeInfo(session_token) || {
    mode: null,
    location: null,
    size: null
  }
  const conversationPhase = getConversationPhase(session_token)
  const bookingStarted = !!sessionData.bookingStarted

  if (conversationPhase === 'booking' || bookingStarted) {
    return buildBookingTurn({
      session_token,
      transcript,
      sessionData,
      homeInfo
    })
  }

  if (BOOKING_INTENT_PATTERN.test(normalized)) {
    sessionData.bookingStarted = true
    validSessions.set(session_token, sessionData)
    return buildBookingTurn({
      session_token,
      transcript,
      sessionData,
      homeInfo
    })
  }

  const selectedSku =
    getSelectedSKU(session_token) ||
    sessionData.selectedSKU ||
    chooseRecommendedSku(homeInfo)
  if (selectedSku) {
    setSelectedSKU(session_token, selectedSku)
    sessionData.selectedSKU = selectedSku
  }

  const competitorModelId = detectCompetitorModelId(transcript)
  if (COMPARISON_INTENT_PATTERN.test(normalized)) {
    if (!competitorModelId) {
      return {
        message:
          'I can compare it directly. Which exact competitor model should we stack against this Lennox unit?',
        ui_components: [],
        tool_calls: [],
        homeInfo,
        home_info_complete: true
      }
    }

    return {
      message: `Great comparison request. I will stack ${String(
        selectedSku
      ).toUpperCase()} against that model so you can decide with confidence.`,
      ui_components: [],
      tool_calls: [
        {
          name: 'show_competitor_comparison',
          arguments: {
            competitor_model_id: competitorModelId,
            lennox_model_id: selectedSku
          }
        }
      ],
      homeInfo,
      home_info_complete: true
    }
  }

  const product = getProductById(selectedSku)
  const detailText = buildProductDetailMessage({
    product,
    sku: selectedSku,
    homeInfo
  })

  if (
    conversationPhase === 'recommendation' &&
    !DETAIL_INTENT_PATTERN.test(normalized)
  ) {
    return {
      message: `Based on your ${homeInfo.mode}, ${homeInfo.location}, and ${
        homeInfo.size
      } profile, ${String(
        selectedSku
      ).toUpperCase()} remains the best fit. Would you like me to walk you through the key details, or are you ready to book a dealer visit?`,
      ui_components: [],
      tool_calls: [
        { name: 'suggest_sku', arguments: { sku: selectedSku } },
        { name: 'show_journey_media', arguments: { type: 'all' } }
      ],
      homeInfo,
      home_info_complete: true
    }
  }

  return {
    message: `${detailText} Ready to book a dealer visit?`,
    ui_components: [],
    tool_calls: [
      { name: 'suggest_sku', arguments: { sku: selectedSku } },
      { name: 'show_journey_media', arguments: { type: 'all' } }
    ],
    homeInfo,
    home_info_complete: true
  }
}

// Voice-first turn processor for home info accumulation.
export const processVoiceTurn = async (req, res) => {
  try {
    const { session_token, transcript } = req.body || {}
    await hydrateSession(session_token)
    if (!session_token || !validSessions.has(session_token)) {
      return res.status(401).json({ error: 'Invalid session' })
    }
    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({ error: 'Missing transcript' })
    }

    const turnResult = await withSessionLock(session_token, async () => {
      const turnGuard = beginTranscriptTurn(session_token, transcript)
      if (!turnGuard.allowed) {
        if (turnGuard.duplicate && turnGuard.response) {
          return res.json(turnGuard.response)
        }
        return res.status(409).json({
          message: 'One turn is already in progress. Please retry.',
          ui_components: [],
          tool_calls: [],
          homeInfo: getHomeInfo(session_token),
          home_info_complete: isHomeInfoComplete(session_token)
        })
      }

      let payload
      const sessionData = validSessions.get(session_token) || {}
      const existing = getHomeInfo(session_token) || {}
      const wasComplete = isHomeInfoComplete(session_token)

      if (!wasComplete) {
        const updated = {
          mode: existing.mode || null,
          location: existing.location || null,
          size: existing.size || null
        }

        // Extract ALL qualification fields from the transcript in one pass.
        // The AI (OpenAI Realtime) may rephrase the backend's question, causing
        // the user to answer multiple fields at once (e.g. "cooling for my
        // basement, about 1500 square feet"). Extracting only the current field
        // would leave the extra answers unprocessed, creating a mismatch between
        // what the AI heard and what the backend state reflects.
        let anyFieldAdvanced = false
        // eslint-disable-next-line no-unused-vars
        for (const field of ['mode', 'location', 'size']) {
          if (updated[field]) continue // already set from a previous turn
          const value = extractQualificationValueForField(field, transcript)
          if (value) {
            updated[field] = value
            anyFieldAdvanced = true
          }
        }

        if (anyFieldAdvanced) {
          setHomeInfo(session_token, updated)
          sessionData.homeInfo = updated
          validSessions.set(session_token, sessionData)
        }

        const nowComplete = isHomeInfoComplete(session_token)
        if (nowComplete) {
          const suggestedSku = chooseRecommendedSku(updated)
          payload = {
            message: `Based on your ${updated.mode} needs, ${
              updated.location
            } install, and ${
              updated.size
            } space, ${suggestedSku.toUpperCase()} is a strong fit for your home. Would you like me to walk you through the key details, or are you ready to book a dealer visit?`,
            ui_components: [],
            tool_calls: [
              { name: 'suggest_sku', arguments: { sku: suggestedSku } },
              { name: 'show_journey_media', arguments: { type: 'all' } }
            ],
            homeInfo: updated,
            home_info_complete: true
          }
        } else {
          const turn = getNextHomeInfoPrompt(updated)
          const isEntryTurn =
            !existing.mode && !existing.location && !existing.size
          const isNudgeEntry =
            isEntryTurn &&
            NUDGE_PATTERNS.some(pattern =>
              pattern.test(normalizeTranscript(transcript))
            )
          const nudgeLead = isNudgeEntry
            ? getNudgeEntryLead(transcript, session_token)
            : null
          const message = nudgeLead
            ? `${nudgeLead} ${turn.message}`
            : turn.message
          payload = {
            message,
            ui_components: turn.ui_components,
            tool_calls: [],
            homeInfo: updated,
            home_info_complete: false
          }
        }
      } else {
        payload = buildPostQualificationTurn({
          session_token,
          transcript,
          sessionData
        })
        validSessions.set(session_token, sessionData)
      }

      const filteredToolCalls = filterTurnToolCallsByPhase(
        session_token,
        Array.isArray(payload.tool_calls) ? payload.tool_calls : []
      )
      const executedTurnTools = executeTurnToolCalls({
        session_token,
        sessionData,
        toolCalls: filteredToolCalls
      })
      payload.tool_calls = executedTurnTools.tool_calls
      payload.ui_components = [
        ...(Array.isArray(payload.ui_components) ? payload.ui_components : []),
        ...(Array.isArray(executedTurnTools.ui_components)
          ? executedTurnTools.ui_components
          : [])
      ]
      validSessions.set(session_token, sessionData)

      const shape = validateAssistantResponse(payload)
      if (!shape.isValid) {
        failTranscriptTurn(session_token)
        return res.status(500).json({
          error: `Invalid assistant response shape: ${shape.error}`
        })
      }

      completeTranscriptTurn(session_token, turnGuard.transcriptHash, payload)
      return res.json(payload)
    })
    await persistSession(session_token)
    return turnResult
  } catch (err) {
    if (req?.body?.session_token) {
      failTranscriptTurn(req.body.session_token)
    }
    logError('[VOICE AGENT] processVoiceTurn error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Log context debug data to file (for debugging token growth)
export const logContextDebug = (req, res) => {
  try {
    const { session_token, turn_number, context_data } = req.body

    if (!session_token) {
      return res.status(400).json({ error: 'Missing session_token' })
    }

    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs', 'context-debug')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    // Create/append to session log file
    const timestamp = Date.now()
    const sessionShort = session_token.substring(0, 8)
    const filename = `session-${sessionShort}-${timestamp}.log`
    const filepath = path.join(logsDir, filename)

    // Check if we already have a log file for this session
    const existingFiles = fs
      .readdirSync(logsDir)
      .filter(f => f.includes(sessionShort))
    const logFile =
      existingFiles.length > 0 ? path.join(logsDir, existingFiles[0]) : filepath

    // Format the log entry
    const logEntry = `
${'█'.repeat(80)}
📜 TURN ${turn_number} - CONTEXT DEBUG LOG
${'█'.repeat(80)}
Timestamp: ${new Date().toISOString()}
Session: ${session_token}

${'-'.repeat(80)}
SYSTEM PROMPT (${context_data.systemPromptTokens || 0} tokens):
${'-'.repeat(80)}
${
  context_data.systemPrompt
    ? context_data.systemPrompt.substring(0, 1000) +
      (context_data.systemPrompt.length > 1000 ? '\n... [truncated]' : '')
    : 'N/A'
}

${'-'.repeat(80)}
TOOL DEFINITIONS (~${context_data.toolDefinitionsTokens || 0} tokens)
${'-'.repeat(80)}

${'-'.repeat(80)}
CONVERSATION TURNS (${context_data.turns?.length || 0} turns):
${'-'.repeat(80)}
${(context_data.turns || [])
  .map(
    (turn, i) => `
TURN ${i}: ${turn.role?.toUpperCase()} (${turn.type})
Tokens: ~${turn.tokens} | Chars: ${turn.contentLength}
Content:
${
  typeof turn.content === 'string'
    ? turn.content
    : JSON.stringify(turn.content, null, 2)
}
`
  )
  .join('\n' + '-'.repeat(40) + '\n')}

${'-'.repeat(80)}
TOTALS:
${'-'.repeat(80)}
System Prompt: ~${context_data.systemPromptTokens || 0} tokens
Tool Definitions: ~${context_data.toolDefinitionsTokens || 0} tokens
Conversation: ~${(context_data.turns || []).reduce(
      (s, t) => s + (t.tokens || 0),
      0
    )} tokens
ESTIMATED TOTAL: ~${context_data.totalTokens || 0} tokens

OpenAI Reported:
  Input Tokens: ${context_data.openaiUsage?.input_tokens || 'N/A'}
  Output Tokens: ${context_data.openaiUsage?.output_tokens || 'N/A'}
  Cached Tokens: ${context_data.openaiUsage?.input_token_details
    ?.cached_tokens || 'N/A'}

${'█'.repeat(80)}

`

    // Append to log file
    fs.appendFileSync(logFile, logEntry, 'utf8')

    console.log(
      `[CONTEXT DEBUG] 📝 Logged turn ${turn_number} to ${path.basename(
        logFile
      )}`
    )

    res.json({
      status: 'success',
      log_file: path.basename(logFile),
      turn: turn_number
    })
  } catch (err) {
    logError('[VOICE AGENT] Error logging context debug:', err)
    res.status(500).json({ error: err.message })
  }
}

// Report token usage from client
export const reportUsage = async (req, res) => {
  try {
    const { session_token, usage, context } = req.body

    await hydrateSession(session_token)
    if (!session_token || !validSessions.has(session_token)) {
      logWarn('[VOICE AGENT] Invalid session token for usage report')
      return res.status(401).json({ error: 'Invalid session' })
    }

    if (!usage || typeof usage !== 'object') {
      logWarn('[VOICE AGENT] Invalid usage data')
      return res.status(400).json({ error: 'Invalid usage data' })
    }

    logUsage(session_token, usage, context || {})

    // PostHog: Log token usage
    logTokenUsage(session_token, {
      inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
      outputTokens: usage.output_tokens || usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      audioInputTokens: usage.input_token_details?.audio_tokens || 0,
      audioOutputTokens: usage.output_token_details?.audio_tokens || 0,
      cachedTokens: usage.input_token_details?.cached_tokens || 0,
      context: context?.toolName || context?.type || 'usage_report'
    })

    res.json({ status: 'success' })
  } catch (err) {
    logError('[VOICE AGENT] Error logging usage:', err)
    res.status(500).json({ error: err.message })
  }
}

// Store conversation message
export const storeConversationMessage = async (req, res) => {
  try {
    const { session_token, message } = req.body

    await hydrateSession(session_token)
    const sessionValidation = validateSessionToken(session_token, validSessions)
    if (!sessionValidation.isValid) {
      logWarn('[VOICE AGENT] Invalid session token for conversation message')
      return res.status(401).json({ error: sessionValidation.error })
    }

    const messageValidation = validateMessage(message)
    if (!messageValidation.isValid) {
      logWarn('[VOICE AGENT] Invalid message:', messageValidation.error)
      return res.status(400).json({ error: messageValidation.error })
    }

    const success = await addConversationMessage(session_token, message)
    if (!success) {
      return res.status(500).json({ error: 'Failed to store message' })
    }

    // PostHog: Log conversation message
    logConversationMessage(session_token, {
      role: message.role,
      content: message.content
    })

    const tokenEstimate = await getConversationTokenEstimate(session_token)
    res.json({ status: 'success', token_estimate: tokenEstimate })
  } catch (err) {
    logError('[VOICE AGENT] Error storing conversation message:', err)
    logPosthogError(req.body?.session_token, {
      category: 'conversation',
      endpoint: '/conversation/message',
      method: 'POST',
      error: err.message,
      errorStack: err.stack
    })
    res.status(500).json({ error: err.message })
  }
}

// Get conversation history
export const getConversationHistoryHandler = async (req, res) => {
  try {
    const { session_token, limit } = req.query

    await hydrateSession(session_token)
    if (!session_token || !validSessions.has(session_token)) {
      logWarn('[VOICE AGENT] Invalid session token for conversation history')
      return res.status(401).json({ error: 'Invalid session' })
    }

    const history = await getConversationHistory(
      session_token,
      parseInt(limit) || 20
    )
    const tokenEstimate = await getConversationTokenEstimate(session_token)

    res.json({
      status: 'success',
      messages: history,
      message_count: history.length,
      token_estimate: tokenEstimate
    })
  } catch (err) {
    logError('[VOICE AGENT] Error retrieving conversation history:', err)
    res.status(500).json({ error: err.message })
  }
}

// Prune conversation history
export const pruneConversationHandler = async (req, res) => {
  try {
    const { session_token, max_tokens } = req.body

    await hydrateSession(session_token)
    if (!session_token || !validSessions.has(session_token)) {
      logWarn('[VOICE AGENT] Invalid session token for conversation pruning')
      return res.status(401).json({ error: 'Invalid session' })
    }

    const pruned = await pruneConversationHistory(
      session_token,
      max_tokens || 4000
    )
    const tokenEstimate = await getConversationTokenEstimate(session_token)
    const history = await getConversationHistory(session_token)

    res.json({
      status: 'success',
      messages_pruned: pruned,
      messages_remaining: history.length,
      token_estimate: tokenEstimate
    })
  } catch (err) {
    logError('[VOICE AGENT] Error pruning conversation:', err)
    res.status(500).json({ error: err.message })
  }
}

// Create WebRTC session
// Exchange SDP for WebRTC connection with OpenAI
export const exchangeRealtimeSdp = async (req, res) => {
  try {
    const { sdp, client_secret, session_token } = req.body

    if (!sdp || !client_secret || !session_token) {
      return res.status(400).json({
        error: 'Missing required fields: sdp, client_secret, session_token'
      })
    }

    await hydrateSession(session_token)
    const validation = validateSessionToken(session_token, validSessions)
    if (!validation.isValid) {
      return res.status(401).json({ error: validation.error })
    }

    log('[VOICE AGENT] Exchanging SDP for unified session')

    // GA Realtime API: the browser/relay POSTs the SDP offer to /realtime/calls
    // using the ephemeral key as bearer. The model is baked into that key.
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${client_secret}`,
        'Content-Type': 'application/sdp'
      },
      body: sdp
    })

    if (!response.ok) {
      const error = await response.text()
      logError('[VOICE AGENT] OpenAI SDP exchange failed:', error)
      return res.status(response.status).json({ error: 'SDP exchange failed' })
    }

    const answerSdp = await response.text()
    log(`[VOICE AGENT] SDP exchange successful`)

    res.json({ sdp: answerSdp })
  } catch (err) {
    logError('[VOICE AGENT] Error exchanging SDP:', err)
    res.status(500).json({ error: err.message })
  }
}

export const createSession = async (req, res) => {
  try {
    const { voice: requestedVoice, model_id: initialModelId } = req.query
    const ip = req.ip || req.connection.remoteAddress || 'unknown'

    // Check if initial model is specified from data-id attribute
    if (initialModelId) {
      log(
        `[VOICE AGENT] Creating session with initial model: ${initialModelId} - IP: ${ip}`
      )
    } else {
      log('[VOICE AGENT] Creating Lennox WebRTC session - IP: ' + ip)
    }

    // Voice selection: male = 'echo', female/default = 'marin'
    const selectedVoice = requestedVoice === 'male' ? 'echo' : 'marin'
    console.log(`[VOICE AGENT] Creating session with voice: ${selectedVoice}`)

    const sessionConfig = getSessionConfig(selectedVoice)

    // GA Realtime API: mint an ephemeral client secret. The model and session
    // config are baked into the token; the browser then POSTs its SDP to
    // /v1/realtime/calls using the returned ephemeral key as the bearer.
    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: 'gpt-realtime-2',
            instructions: sessionConfig.instructions,
            tools: sessionConfig.tools,
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                turn_detection: sessionConfig.turn_detection,
                transcription: sessionConfig.input_audio_transcription
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: selectedVoice
              }
            }
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      logError('[VOICE AGENT] OpenAI session error:', err)
      throw new Error('Failed to create OpenAI session')
    }

    const data = await response.json()

    const sessionToken = crypto.randomBytes(32).toString('hex')
    validSessions.set(sessionToken, {
      createdAt: Date.now(),
      ip: ip,
      currentModelId: initialModelId || null,
      homeInfo: {
        mode: null,
        location: null,
        size: null
      },
      selectedSKU: null,
      homeQualifier: {
        initialized: false,
        answers: { unit_type: null, location: null, size: null },
        completed: false
      },
      // [NEW FLOW] track which products have a confirmed booking to block re-entry
      bookedProductIds: new Set()
    })
    initOrchestratorSession(sessionToken)
    await persistSession(sessionToken)

    const sessionModelId = initialModelId || 'lennox'
    const sessionModelName = 'Lennox UCP Agent'

    log(`[VOICE AGENT] Session created with model: ${sessionModelId}`)

    // PostHog: Register session
    registerSession(sessionToken, {
      modelId: sessionModelId,
      modelName: sessionModelName,
      ip: ip
    })

    logSessionCreated(sessionToken, {
      modelId: sessionModelId,
      modelName: sessionModelName,
      voice: selectedVoice,
      toolsCount: sessionConfig.tools?.length || 0,
      ip: ip
    })

    logSessionConfig(sessionToken, sessionConfig)

    if (data.usage) {
      logUsage(sessionToken, data.usage, { usage: data.usage })
      logTokenUsage(sessionToken, {
        inputTokens: data.usage.input_tokens || 0,
        outputTokens: data.usage.output_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
        context: 'session_creation'
      })
    }

    res.json({
      client_secret: { value: data.value, expires_at: data.expires_at },
      session_config: {
        instructions: sessionConfig.instructions,
        tool_names: sessionConfig.tools.map(t => t.name),
        turn_detection: sessionConfig.turn_detection,
        input_audio_transcription: sessionConfig.input_audio_transcription,
        model: {
          id: sessionModelId,
          name: sessionModelName
        }
      },
      session_token: sessionToken,
      model: {
        id: sessionModelId,
        name: sessionModelName
      }
    })
  } catch (err) {
    logError('[VOICE AGENT] Error creating session:', err)
    res.status(500).json({ error: err.message })
  }
}

// Execute tool calls from WebRTC client
export const executeTools = async (req, res) => {
  const startTime = Date.now()
  try {
    const {
      tool_name,
      tool_args,
      call_id,
      session_token,
      model_id: bodyModelId
    } = req.body

    const toolEnvelopeValidation = validateToolEnvelope(req.body)
    if (!toolEnvelopeValidation.isValid) {
      return res.status(400).json({ error: toolEnvelopeValidation.error })
    }

    const sessionShort = session_token?.slice(0, 8) || 'unknown'
    const summarizeToolResult = result => ({
      success: !!result?.success,
      blocked: !!result?.blocked,
      code: result?.code || null,
      has_cards: Array.isArray(result?.cards) ? result.cards.length : 0,
      has_ui_components: Array.isArray(result?.ui_components)
        ? result.ui_components.length
        : 0,
      has_booking_slots: Array.isArray(result?.booking_slots)
        ? result.booking_slots.length
        : 0,
      has_locations: Array.isArray(result?.locations)
        ? result.locations.length
        : 0,
      booking_confirmed: !!result?.booking_confirmed
    })

    const originalJson = res.json.bind(res)
    res.json = payload => {
      const duration = Date.now() - startTime
      if (payload?.result) {
        console.log('[LENNOX TOOLS] Result:', {
          session: sessionShort,
          tool: tool_name,
          call_id,
          duration_ms: duration,
          ...summarizeToolResult(payload.result)
        })
      } else {
        console.log('[LENNOX TOOLS] Response:', {
          session: sessionShort,
          tool: tool_name,
          call_id,
          duration_ms: duration,
          status: 'non_result_payload'
        })
      }
      return originalJson(payload)
    }

    console.log('[LENNOX TOOLS] Incoming request:', {
      session: sessionShort,
      tool: tool_name,
      call_id,
      model_id: bodyModelId || null,
      arg_keys: Object.keys(
        tool_args && typeof tool_args === 'object' ? tool_args : {}
      )
    })

    log(`[VOICE AGENT] ===== TOOL REQUEST RECEIVED =====`)
    log(`[VOICE AGENT] Model (Body): ${bodyModelId || 'none'}`)
    log(`[VOICE AGENT] Tool: ${tool_name}`)
    log(`[VOICE AGENT] Call ID: ${call_id}`)

    await hydrateSession(session_token)
    if (!session_token || !validSessions.has(session_token)) {
      logWarn('[VOICE AGENT] SECURITY: Invalid or missing session token')
      logSecurityEvent(session_token || 'unknown', {
        type: 'invalid_session',
        ip: req.ip,
        details: { requestModelId: bodyModelId, tool_name }
      })
      return res.status(401).json({ error: 'Invalid session' })
    }

    // ── Serialize tool execution per session to prevent race conditions ──
    const toolResult = await withSessionLock(session_token, async () => {
      const sessionData = validSessions.get(session_token)

      // Get active model ID from session (supports dynamic switching)
      const activeModelId = bodyModelId || sessionData.currentModelId

      const guardResult = validateToolCallGuardrails(session_token, tool_name)
      if (!guardResult.allowed) {
        return res.json({
          result: {
            success: false,
            blocked: true,
            code: guardResult.code,
            phase: guardResult.phase || getConversationPhase(session_token),
            message: guardResult.message,
            required_conditions: guardResult.required || [],
            missing_fields: guardResult.missing || [],
            unconfirmed_fields: guardResult.unconfirmed || [],
            session: guardResult.session,
            context: `[TOOL BLOCKED: ${tool_name}] ${guardResult.message}`
          }
        })
      }

      // [NEW FLOW] Re-entry guard helper -- check if a product is already booked this session
      const bookedProductIds = sessionData.bookedProductIds || new Set()
      const checkBookingReEntry = productId => {
        if (!productId) return null
        const pid = productId.toLowerCase()
        if (bookedProductIds.has(pid) || isProductBooked(session_token, pid)) {
          const displayId = pid.toUpperCase()
          return `[BOOKING_ALREADY_CONFIRMED for ${displayId}. The user already has a confirmed dealer visit booked for the ${displayId}. Do NOT collect information again or re-enter the booking flow for this product. Acknowledge the existing booking warmly if they mention it, then offer to help with questions about the product or discuss other Lennox models.]`
        }
        return null
      }

      // Handle show_products/suggest_sku -- smart query: specific model, series, tier, or 1-per-tier default
      if (tool_name === 'show_products' || tool_name === 'suggest_sku') {
        log('[VOICE AGENT] Executing show_products (UCP product catalog)')

        try {
          const db = getProductsDb()
          const { filter_series, model_id, model_ids, limit, sku } =
            tool_args || {}
          const requestedModelId = model_id || sku || null

          let rows = []

          // Priority 1a: multiple specific model IDs (e.g. ["el17xc1", "ml17xc1"])
          if (model_ids?.length) {
            // eslint-disable-next-line no-unused-vars
            for (const mid of model_ids) {
              const idLower = mid.toLowerCase().replace(/[\s-]/g, '')
              let found = db
                .prepare(
                  "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
                )
                .all(idLower)
              if (!found.length)
                found = db
                  .prepare(
                    'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
                  )
                  .all(`%${idLower}%`)
              if (found.length) rows.push(found[0])
            }
          }

          // Priority 1b: single specific model ID
          if (!rows.length && requestedModelId) {
            const idLower = requestedModelId.toLowerCase().replace(/[\s-]/g, '')
            rows = db
              .prepare(
                "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
              )
              .all(idLower)
            if (!rows.length) {
              rows = db
                .prepare(
                  'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
                )
                .all(`%${idLower}%`)
            }
          }

          // Priority 2: series filter
          if (!rows.length && filter_series && filter_series !== 'all') {
            const seriesMap = {
              signature: 'dave lennox signature collection',
              elite: 'elite series',
              merit: 'merit series'
            }
            const seriesName =
              seriesMap[filter_series.toLowerCase()] || filter_series
            const maxCards = limit || 4
            rows = db
              .prepare(
                'SELECT * FROM products WHERE LOWER(series) LIKE ? ORDER BY rating DESC LIMIT ?'
              )
              .all(`%${seriesName.toLowerCase()}%`, maxCards)
            // Fallback: partial series name match
            if (!rows.length) {
              rows = db
                .prepare(
                  'SELECT * FROM products WHERE LOWER(series) LIKE ? ORDER BY rating DESC LIMIT ?'
                )
                .all(`%${filter_series.toLowerCase()}%`, maxCards)
            }
          }

          // Priority 3: default -- 1 best product per price tier ($$$$, $$$, $$, $)
          if (!rows.length) {
            rows = ['$$$$', '$$$', '$$', '$'].flatMap(tier =>
              db
                .prepare(
                  'SELECT * FROM products WHERE price_display = ? ORDER BY rating DESC LIMIT 1'
                )
                .all(tier)
            )
          }

          const cards = rows.map(p => ({
            id: p.id,
            title: p.title,
            series: p.series,
            image_url: buildLennoxImageUrl(p.id),
            price_display: p.price_display,
            seer: p.seer,
            seer2: p.seer2,
            noise: p.noise,
            energy_star: p.energy_star,
            rating: p.rating,
            reviews: p.reviews,
            features: p.features ? JSON.parse(p.features).slice(0, 3) : [],
            description: p.description,
            refrigerant_type: p.refrigerant_type,
            compressor_stages: p.compressor_stages,
            warranty_compressor_years: p.warranty_compressor_years
          }))

          const isComparison = !!(tool_args.model_ids?.length >= 2)

          // [NEW FLOW] Check if any shown product already has a confirmed booking and append guard context
          const shownProductIds = cards.map(c => c.id)
          const bookingGuards = shownProductIds
            .map(pid => checkBookingReEntry(pid))
            .filter(Boolean)
          const bookingGuardContext =
            bookingGuards.length > 0 ? bookingGuards.join(' ') : null

          const selectedSku = cards[0]?.id || requestedModelId || null
          if (selectedSku) {
            setSelectedSKU(session_token, selectedSku)
            sessionData.selectedSKU = selectedSku
            validSessions.set(session_token, sessionData)
          }

          // Bundle journey media (videos + reviews) with product cards
          const mediaBundle = getJourneyMediaBundle('all')

          return res.json({
            result: {
              success: true,
              cards,
              has_cards: true,
              is_comparison: isComparison,
              source: 'ucp_products',
              selected_sku: selectedSku,
              has_media: true,
              show_reviews: true,
              youtube_references: mediaBundle.youtube_references,
              reviews: mediaBundle.reviews,
              context:
                '[Product card, videos, and reviews are now visible on screen.' +
                ' Give a brief 1-sentence recommendation, then ask exactly:' +
                ' "Would you like me to walk you through the details, or ready to book a dealer visit?"]',
              ...(bookingGuardContext && {
                booking_guard_context: bookingGuardContext
              })
            }
          })
        } catch (err) {
          logError('[VOICE AGENT] show_products error:', err)
          return res.json({
            result: {
              success: false,
              cards: [],
              has_cards: false,
              error: err.message
            }
          })
        }
      }

      // Handle show_competitor_comparison -- use Redis-hydrated catalog (with JSON fallback) and return side-by-side card
      if (tool_name === 'show_competitor_comparison') {
        log('[VOICE AGENT] Executing show_competitor_comparison')
        try {
          const allCompetitors = await ensureCompetitorCatalogCache()
          if (Array.isArray(allCompetitors) && allCompetitors.length) {
            competitorCatalogCache = allCompetitors
          }

          const { competitor_model_id, lennox_model_id } = tool_args || {}

          // Find the competitor model
          const competitorIdNorm = competitor_model_id
            ?.toLowerCase()
            .replace(/[\s_]/g, '-')
          const competitor = allCompetitors.find(c => {
            const normalizedModelName = c.model_name
              ?.toLowerCase()
              .replace(/\s+/g, '-')
            return (
              c.id === competitorIdNorm ||
              c.id === competitor_model_id ||
              normalizedModelName === competitorIdNorm
            )
          })

          if (!competitor) {
            return res.json({
              result: {
                success: false,
                found: false,
                has_competitor_card: false
              }
            })
          }

          // Determine which Lennox model to use
          const activeLennoxId =
            lennox_model_id ||
            sessionData.selectedSKU ||
            getSelectedSKU(session_token) ||
            sessionData.currentModelId ||
            competitor.comparable_lennox_ids?.[0]

          let lennoxCard = null
          if (activeLennoxId) {
            const db = getProductsDb()
            const idLower = String(activeLennoxId)
              .toLowerCase()
              .replace(/[\s-]/g, '')
            let rows = db
              .prepare(
                "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
              )
              .all(idLower)
            if (!rows.length)
              rows = db
                .prepare(
                  'SELECT * FROM products WHERE LOWER(id) LIKE ? ORDER BY rating DESC LIMIT 1'
                )
                .all(`%${idLower}%`)
            if (rows.length) {
              const p = rows[0]
              lennoxCard = {
                id: p.id,
                brand: 'Lennox',
                title: p.title,
                series: p.series,
                image_url: buildLennoxImageUrl(p.id),
                price_display: p.price_display,
                seer: p.seer,
                seer2: p.seer2,
                noise_db: p.noise,
                compressor_stages: p.compressor_stages,
                warranty_compressor_years: p.warranty_compressor_years,
                warranty_parts_years: p.warranty_parts_years,
                refrigerant_type: p.refrigerant_type
              }
            }
          }

          // Fallback: if no specific Lennox model found, use best comparable from the tier
          if (!lennoxCard && competitor.comparable_lennox_ids?.length) {
            const db = getProductsDb()
            // eslint-disable-next-line no-unused-vars
            for (const cid of competitor.comparable_lennox_ids) {
              const idLower = cid.toLowerCase().replace(/[\s-]/g, '')
              const rows = db
                .prepare(
                  "SELECT * FROM products WHERE LOWER(REPLACE(id,'-','')) = ? LIMIT 1"
                )
                .all(idLower)
              if (rows.length) {
                const p = rows[0]
                lennoxCard = {
                  id: p.id,
                  brand: 'Lennox',
                  title: p.title,
                  series: p.series,
                  image_url: buildLennoxImageUrl(p.id),
                  price_display: p.price_display,
                  seer: p.seer,
                  seer2: p.seer2,
                  noise_db: p.noise,
                  compressor_stages: p.compressor_stages,
                  warranty_compressor_years: p.warranty_compressor_years,
                  warranty_parts_years: p.warranty_parts_years,
                  refrigerant_type: p.refrigerant_type
                }
                break
              }
            }
          }

          // Final fallback: ensure Lennox side is available for rendering
          // even when comparable_lennox_ids are missing or don't match.
          if (!lennoxCard) {
            const fallbackCards = getCardsForSuggestSku({
              sku: sessionData.selectedSKU || getSelectedSKU(session_token),
              limit: 1
            })
            const fallbackCard =
              fallbackCards[0] || getCardsForSuggestSku({ limit: 1 })[0]

            if (fallbackCard) {
              lennoxCard = {
                id: fallbackCard.id,
                brand: 'Lennox',
                title: fallbackCard.title,
                series: fallbackCard.series,
                image_url: fallbackCard.image_url,
                price_display: fallbackCard.price_display,
                seer: fallbackCard.seer,
                seer2: fallbackCard.seer2,
                noise_db: fallbackCard.noise,
                compressor_stages: fallbackCard.compressor_stages,
                warranty_compressor_years:
                  fallbackCard.warranty_compressor_years,
                warranty_parts_years: null,
                refrigerant_type: fallbackCard.refrigerant_type
              }
            }
          }

          const competitorCard = {
            id: competitor.id,
            brand: competitor.brand,
            title: `${competitor.brand} ${competitor.model_name}`,
            series: competitor.series,
            price_display: competitor.price_tier,
            seer: competitor.seer || null,
            seer2: competitor.seer2 || null,
            noise_db: competitor.noise_db || null,
            compressor_stages: competitor.compressor_type || null,
            warranty_compressor_years:
              competitor.warranty_compressor_years || null,
            warranty_parts_years: competitor.warranty_parts_years || null,
            refrigerant_type: competitor.refrigerant_type || null
          }

          return res.json({
            result: {
              success: !!lennoxCard,
              has_competitor_card: !!lennoxCard,
              lennox_card: lennoxCard,
              competitor_card: competitorCard
            }
          })
        } catch (err) {
          logError('[VOICE AGENT] show_competitor_comparison error:', err)
          return res.json({
            result: {
              success: false,
              has_competitor_card: false,
              error: err.message
            }
          })
        }
      }

      // Qualification is backend-/voice-agent-lennox-driven. Legacy qualification tools are disabled.
      if (
        [
          'select_system_type',
          'select_install_location',
          'select_space_size'
        ].includes(tool_name)
      ) {
        return res.json({
          result: {
            success: false,
            blocked: true,
            code: 'QUALIFICATION_TOOL_DEPRECATED',
            context:
              '[Qualification is backend-orchestrated via /voice-agent-lennox. Do not call qualification tools.]'
          }
        })
      }

      // Handle show_journey_media -- match AI's free-text description to media bucket
      if (tool_name === 'show_journey_media') {
        const { description, type } = tool_args || {}

        const JOURNEY_MEDIA = [
          {
            description:
              'User is learning what Lennox ACs are and why they matter.',
            keywords: [
              'what is',
              'how does',
              'explain',
              'learning',
              'curious',
              'tell me about',
              'why lennox',
              'what makes',
              'new to',
              'first time',
              'general',
              'overview',
              'intro',
              'seer',
              'efficiency',
              'types of ac',
              'el16xc1',
              'el16',
              'two stage',
              'two-stage'
            ],
            videos: [
              {
                title: 'Lennox Central Air Conditioner - What You Should Know',
                url: 'https://www.youtube.com/watch?v=IV275LGcN1o',
                videoId: 'IV275LGcN1o'
              },
              {
                title: 'Lennox Elite EL16XC1 Install 2021',
                url: 'https://www.youtube.com/watch?v=GmjuTp5_uWA',
                videoId: 'GmjuTp5_uWA'
              },
              {
                title:
                  'Lennox Two-Stage Air Conditioning Technology (features XC21 and EL16XC1-style operation)',
                url: 'https://www.youtube.com/watch?v=mvKssP2gz1g',
                videoId: 'mvKssP2gz1g'
              }
            ],
            reviews: [
              {
                text:
                  'Lennox has the highest efficiency ratings of any major HVAC company, which means higher long-term energy savings for you. Many units have silent operation, and the company offers a great selection of AC types, including split systems and ductless units.',
                source: "Today's Homeowner - Lennox Air Conditioner Review"
              },
              {
                text:
                  "Lennox is an outstanding option if you're installing a new AC in your home. It's one of the most highly recommended HVAC brands due to average pricing and well-above-average efficiency ratings, including up to 28.0 SEER/25.8 SEER2.",
                source: "Today's Homeowner - Lennox Air Conditioner Review"
              },
              {
                text:
                  'Many Lennox models qualify for Energy Star certification, with strong durability, reliability, advanced features like smart home integration and variable-speed compressors, plus extended warranties on high-end models.',
                source: 'The Furnace Outlet - Is Lennox a Good AC Brand?'
              }
            ]
          },
          {
            description:
              'User is comparing Lennox AC models vs other brands or budget tiers, including EL16XC1 vs XC21.',
            keywords: [
              'compare',
              'vs',
              'versus',
              'difference',
              'which one',
              'better',
              'carrier',
              'trane',
              'rheem',
              'brand',
              'budget',
              'price range',
              'tier',
              'series',
              'merit vs elite',
              'elite vs signature',
              'options',
              'models',
              'side by side',
              'el16xc1',
              'xc21',
              'el16',
              'signature',
              'elite'
            ],
            videos: [
              {
                title:
                  'Lennox XC21 2 Stage Cooling - Innovative and Most Energy Efficient',
                url: 'https://www.youtube.com/watch?v=cJHg0ZcJd_I',
                videoId: 'cJHg0ZcJd_I'
              },
              {
                title: 'Lennox Central Air Conditioner - What You Should Know',
                url: 'https://www.youtube.com/watch?v=IV275LGcN1o',
                videoId: 'IV275LGcN1o'
              },
              {
                title:
                  'Lennox Two-Stage Air Conditioning Technology (features XC21 and EL16XC1-style operation)',
                url: 'https://www.youtube.com/watch?v=mvKssP2gz1g',
                videoId: 'mvKssP2gz1g'
              }
            ],
            reviews: [
              {
                text:
                  'Lennox air conditioner reviews are largely positive and often mention durability and reliability. Lennox is known for producing units that operate quietly, which is especially important during nighttime, though the higher-quality build usually comes with a higher initial cost.',
                source: 'Harp Home Services - Are Lennox HVAC Systems Worth It?'
              },
              {
                text:
                  'I purchased the Merit Series ML17XP1 Heat Pump April 19th 2024. Cost me $9k installed. The outside unit shakes badly, but the cooling power with great efficiency is excellent. Lennox manufactures the most efficient air conditioners.',
                source:
                  "YouTube review comment on 'Know before you buy! Lennox Air Conditioning System Review'"
              },
              {
                text:
                  'Lennox AC units are on the more expensive side, but long-term energy savings and reliability justify the cost for many homeowners.',
                source: 'The Furnace Outlet - Is Lennox a Good AC Brand?'
              }
            ]
          },
          {
            description:
              'User is considering the Lennox XC21 or premium two-stage ACs and wants comfort, quiet operation, or precision cooling.',
            keywords: [
              'variable speed',
              'variable-speed',
              'premium',
              'high end',
              'quiet',
              'noise',
              'precision',
              'comfort',
              'inverter',
              'xc21',
              'xc25',
              'xp25',
              'sl25',
              'signature',
              'luxury',
              'whisper',
              'humidity',
              'dehumidif',
              'two stage',
              'two-stage',
              'energy efficient'
            ],
            videos: [
              {
                title:
                  'Lennox XC21 2 Stage Cooling - Innovative and Most Energy Efficient',
                url: 'https://www.youtube.com/watch?v=cJHg0ZcJd_I',
                videoId: 'cJHg0ZcJd_I'
              },
              {
                title: 'Lennox XC21 3 Ton Start Up, Run Noise & Install',
                url: 'https://www.youtube.com/watch?v=bA08MTbqJHk',
                videoId: 'bA08MTbqJHk'
              },
              {
                title: 'Lennox XC21 Air Conditioner Installation Review',
                url: 'https://www.youtube.com/watch?v=4iSHhVMgtLg',
                videoId: '4iSHhVMgtLg'
              }
            ],
            reviews: [
              {
                text:
                  "If you're a 'Rolls-Royce' buyer who values quiet, precision comfort, and doesn't mind the premium cost -- Lennox is a great choice. Set 72°, stay 72°. The units are whisper-quiet, even at 118°, and the build quality still looks great after 6 Phoenix summers.",
                source:
                  'Fire & Air AZ - Lennox Variable Speed Air Conditioner Review (After Using)'
              },
              {
                text:
                  "Lennox advertises 'the most precise comfort money can buy.' I agree. If I set 72°, my house is 72°. Not 73, not 71. Always spot on -- even during an 118° Phoenix heatwave. The cabinets are still solid, and parts are readily available in Phoenix.",
                source:
                  'Fire & Air AZ - Lennox Variable Speed Air Conditioner Review (After Using)'
              },
              {
                text:
                  'Lennox AC reviews are largely positive and mention durability, reliability, quiet operation, and advanced features like variable-speed compressors, making them a strong fit for comfort-focused buyers.',
                source: 'The Furnace Outlet - Is Lennox a Good AC Brand?'
              }
            ]
          },
          {
            description:
              'User is ready to buy or confirm an EL16XC1 or XC21 model and needs reassurance, installation context, or a final confidence nudge.',
            keywords: [
              'ready to buy',
              'want to buy',
              'go ahead',
              'purchase',
              'confirm',
              'install',
              'installation',
              'worth it',
              'should i',
              'convinced',
              'final',
              'decide',
              'confident',
              'trust',
              'reliable',
              'long term',
              'last',
              'durability',
              'xc21',
              'el16xc1',
              'el16',
              'buy now',
              'order'
            ],
            videos: [
              {
                title: 'Lennox XC21 Air Conditioner Installation Review',
                url: 'https://www.youtube.com/watch?v=4iSHhVMgtLg',
                videoId: '4iSHhVMgtLg'
              },
              {
                title: 'Lennox Elite EL16XC1 Install 2021',
                url: 'https://www.youtube.com/watch?v=GmjuTp5_uWA',
                videoId: 'GmjuTp5_uWA'
              },
              {
                title: 'Lennox Central Air Conditioner - What You Should Know',
                url: 'https://www.youtube.com/watch?v=IV275LGcN1o',
                videoId: 'IV275LGcN1o'
              }
            ],
            reviews: [
              {
                text:
                  'Reliable for years! My last Lennox furnace lasted 30 years! This new one is very quiet and works great!',
                source: 'Lennox ML13KC1 Product Review (Lennox.com)'
              },
              {
                text:
                  "Lennox has an A+ rating with the Better Business Bureau. We recommend Lennox as a good option for most homeowners, especially if you're installing a new AC. The units are relatively affordable, very efficient, and many operate in near-silent mode.",
                source: "Today's Homeowner - Lennox Air Conditioner Review"
              },
              {
                text:
                  'Lennox air conditioner reviews are largely positive and mention durability, reliability, and quiet operation, which makes them a strong choice for homeowners who want long-term performance and comfort.',
                source: 'Harp Home Services - Are Lennox HVAC Systems Worth It?'
              }
            ]
          },
          {
            description:
              'User already bought a Lennox AC (EL16XC1 or XC21) and wants maintenance, care, or troubleshooting help.',
            keywords: [
              'already bought',
              'just installed',
              'maintenance',
              'care',
              'clean',
              'filter',
              'troubleshoot',
              'repair',
              'after purchase',
              'post purchase',
              'own',
              'my unit',
              'how to maintain',
              'service',
              'xc21',
              'el16xc1',
              'el16',
              'start up',
              'run'
            ],
            videos: [
              {
                title: 'Lennox XC21 3 Ton Start Up, Run Noise & Install',
                url: 'https://www.youtube.com/watch?v=bA08MTbqJHk',
                videoId: 'bA08MTbqJHk'
              },
              {
                title:
                  'Lennox XC21 2 Stage Cooling - Innovative and Most Energy Efficient',
                url: 'https://www.youtube.com/watch?v=cJHg0ZcJd_I',
                videoId: 'cJHg0ZcJd_I'
              },
              {
                title: 'Lennox Elite EL16XC1 Install 2021',
                url: 'https://www.youtube.com/watch?v=GmjuTp5_uWA',
                videoId: 'GmjuTp5_uWA'
              }
            ],
            reviews: [
              {
                text:
                  "After 6 brutal Phoenix summers, the precise comfort, whisper-quiet operation, and build quality of Lennox's variable-speed systems are undeniable. The cabinets still look great, and parts are readily available in Phoenix-area supply houses.",
                source:
                  'Fire & Air AZ - Lennox Variable Speed Air Conditioner Review (After Using)'
              },
              {
                text:
                  "If I set 72°, my house is 72°. Always spot on -- even during 118° heat. The proprietary thermostat and hub are the Achilles' heel; they're expensive, fragile, and required. But the comfort and efficiency more than make up for it.",
                source:
                  'Fire & Air AZ - Lennox Variable Speed Air Conditioner Review (After Using)'
              },
              {
                text:
                  'Lennox AC units are impressive machines for long-term ownership. The long-term energy savings, solid build quality, and quiet operation justify the premium if you plan to stay in your home for many years.',
                source: "Today's Homeowner - Lennox Air Conditioner Review"
              }
            ]
          }
        ]

        // Match AI's free-text description against each bucket's description + keywords
        // Score = keyword hits + partial word overlap with bucket description
        const descLower = (description || '').toLowerCase()
        let bestMatch = JOURNEY_MEDIA[0]
        let bestScore = -1

        // eslint-disable-next-line no-unused-vars
        for (const bucket of JOURNEY_MEDIA) {
          let score = 0
          // eslint-disable-next-line no-unused-vars
          for (const kw of bucket.keywords) {
            if (descLower.includes(kw)) score++
          }
          // Bonus: shared meaningful words between AI description and bucket description
          const bucketDescWords = bucket.description
            .toLowerCase()
            .split(/\W+/)
            .filter(w => w.length > 4)
          // eslint-disable-next-line no-unused-vars
          for (const word of bucketDescWords) {
            if (descLower.includes(word)) score += 0.5
          }
          if (score > bestScore) {
            bestScore = score
            bestMatch = bucket
          }
        }

        const fallbackBundle = getJourneyMediaBundle('all')
        const selectedVideos = mergeJourneyMediaItems(
          bestMatch.videos,
          fallbackBundle.youtube_references,
          video => video?.videoId || video?.video_id || video?.url || '',
          JOURNEY_MEDIA_TARGET_COUNT
        ).map(video => {
          const normalizedVideoId = video.videoId || video.video_id || null
          return {
            ...video,
            ...(normalizedVideoId && {
              thumbnail_url:
                video.thumbnail_url ||
                buildYoutubeThumbnailUrl(normalizedVideoId)
            })
          }
        })
        const selectedReviews = mergeJourneyMediaItems(
          bestMatch.reviews,
          fallbackBundle.reviews,
          review =>
            `${review?.text || review?.quote || ''}|${review?.source ||
              review?.reviewer ||
              ''}`,
          JOURNEY_MEDIA_TARGET_COUNT
        )

        if (type === 'videos') {
          return res.json({
            result: {
              success: true,
              has_media: true,
              youtube_references: selectedVideos
            }
          })
        }

        if (type === 'reviews') {
          return res.json({
            result: {
              success: true,
              has_media: true,
              show_reviews: true,
              reviews: selectedReviews
            }
          })
        }

        // type === 'all' (or unrecognised) -- return both videos and reviews in one shot
        return res.json({
          result: {
            success: true,
            has_media: true,
            show_reviews: true,
            youtube_references: selectedVideos,
            reviews: selectedReviews
          }
        })
      }

      // ========================================================================
      // QUALIFICATION PHASE TOOLS (show_comfort_needs, show_installation_location, show_space_size)
      // ========================================================================

      if (tool_name === 'show_comfort_needs') {
        const { buildComfortNeedsCards } = await import(
          './core/helpers/data-builders.js'
        )
        const cards = buildComfortNeedsCards()
        log(
          '[VOICE AGENT] Rendering comfort needs qualification cards' +
            ' (cooling/heating/both)'
        )
        return res.json({
          result: {
            success: true,
            tool: 'show_comfort_needs',
            ui_components: [cards],
            context:
              '[Cards are now visible on screen. DO NOT repeat the question —' +
              ' the user can see the options. Wait silently for their selection.' +
              ' Options: Cooling Only, Heating Only, or Heating + Cooling.]'
          }
        })
      }

      if (tool_name === 'show_installation_location') {
        const { buildInstallationLocationCards } = await import(
          './core/helpers/data-builders.js'
        )
        const cards = buildInstallationLocationCards()
        log(
          '[VOICE AGENT] Rendering installation location qualification cards' +
            ' (basement/attic/garage/etc)'
        )
        return res.json({
          result: {
            success: true,
            tool: 'show_installation_location',
            ui_components: [cards],
            context:
              '[Cards are now visible on screen. DO NOT repeat the question —' +
              ' the user can see the options. Wait silently for their selection.' +
              ' Options: Basement, Attic, Garage, Crawlspace, Closet/Indoor.]'
          }
        })
      }

      if (tool_name === 'show_space_size') {
        const { buildSpaceSizeCards } = await import(
          './core/helpers/data-builders.js'
        )
        const cards = buildSpaceSizeCards()
        log(
          '[VOICE AGENT] Rendering space size qualification cards' +
            ' (small/medium/large/etc)'
        )
        return res.json({
          result: {
            success: true,
            tool: 'show_space_size',
            ui_components: [cards],
            context:
              '[Cards are now visible on screen. DO NOT repeat the question —' +
              ' the user can see the options. Wait silently for their selection.' +
              ' Options: Small, Small-Mid, Medium, Mid-Large, Large.]'
          }
        })
      }

      // [NEW FLOW] collect_user_info -- store user contact details for booking
      if (tool_name === 'collect_user_info') {
        // Re-entry guard: if the current product already has a confirmed booking, block
        const guardMsg = checkBookingReEntry(activeModelId)
        if (guardMsg) {
          return res.json({
            result: { success: false, blocked: true, context: guardMsg }
          })
        }

        setUserInfo(session_token, {
          name: tool_args?.name || null,
          phone: tool_args?.phone || null,
          address: tool_args?.address || null,
          email: tool_args?.email || null
        })

        // Check if all 4 fields are now complete
        const allFieldsComplete = isUserInfoComplete(session_token)
        if (allFieldsComplete) {
          const info = getUserInfo(session_token)
          const validation = getScheduleValidation(session_token)
          return res.json({
            result: {
              success: true,
              user_info_saved: true,
              user_info_complete: true,
              user_info_confirmed: validation.allConfirmed,
              pending_confirmation_fields: validation.unconfirmed,
              confirmation_snapshot: getLLMSessionSnapshot(session_token)
                .userInfo,
              context: `[All 4 fields collected. You MUST now read back the information to the user for confirmation. Say exactly:
"Let me confirm your details. Your name is ${info.name}, phone number ${info.phone}, address ${info.address}, and email ${info.email}. Is all of that correct?"
If the user says YES → call confirm_user_info with {"confirmed_all": true}. The date/time picker will appear automatically.
If the user says any field is WRONG → call confirm_user_info with {"incorrect_field":"<field_name>"} to reset ONLY that field. Ask only for that field, update it via collect_user_info, then re-confirm.]`
            }
          })
        }

        // Not all fields yet -- continue collecting
        const info = getUserInfo(session_token)
        const missing = []
        if (!info.name) missing.push('name')
        if (!info.phone) missing.push('phone')
        if (!info.address) missing.push('address')
        if (!info.email) missing.push('email')

        return res.json({
          result: {
            success: true,
            user_info_saved: true,
            user_info_complete: false,
            missing_fields: missing,
            context: `[User info partially saved. Still missing: ${missing.join(
              ', '
            )}. Ask for the next missing field. Collect ONE field at a time in this order: name, phone, address, email. Do NOT bundle questions.]`
          }
        })
      }

      // confirm_user_info -- mark all fields confirmed or reset one incorrect field
      if (tool_name === 'confirm_user_info') {
        const { confirmed_all, incorrect_field } = tool_args || {}
        const validField = ['name', 'phone', 'address', 'email']

        if (confirmed_all === true) {
          const validation = getScheduleValidation(session_token)
          if (!validation.allValuesPresent) {
            return res.json({
              result: {
                success: false,
                blocked: true,
                code: 'MISSING_USER_FIELDS',
                missing_fields: validation.missing,
                context:
                  '[BLOCKED: Cannot confirm details yet. One or more required fields are missing.]'
              }
            })
          }
          confirmAllUserInfoFields(session_token)
        } else if (incorrect_field && validField.includes(incorrect_field)) {
          confirmUserInfoField(session_token, incorrect_field, false)
        }

        const snapshot = getLLMSessionSnapshot(session_token)
        const validation = getScheduleValidation(session_token)
        const resultPayload = {
          success: true,
          confirmation_updated: true,
          user_info: snapshot.userInfo,
          all_confirmed: validation.allConfirmed,
          missing_fields: validation.missing,
          unconfirmed_fields: validation.unconfirmed,
          date_time_approved: validation.allConfirmed
        }
        // When all fields are confirmed, include booking slots so the frontend
        // can render the date/time picker via the tool call result (no keyword trigger needed).
        if (validation.allConfirmed) {
          resultPayload.has_booking_slots = true
          // [CHANGED — Phase 1 / R3] cached, stable per session (note: this scope
          // uses session_token, while the GET route above uses sessionToken).
          resultPayload.booking_slots = getOrCreateBookingSlots(
            session_token,
            generateBookingSlots
          )
        }
        return res.json({ result: resultPayload })
      }

      // [NEW FLOW] confirm_booking -- finalize booking, simulate confirmation email
      if (tool_name === 'confirm_booking' || tool_name === 'schedule_visit') {
        const userInfo = getUserInfo(session_token)
        const productId = tool_args?.product_id || null
        const bookingData = {
          selectedDate: tool_args?.selected_date || null,
          selectedTime: tool_args?.selected_time || null,
          productId,
          dealerName: 'Hce Systems Inc',
          dealerCity: tool_args?.dealer_city || null,
          confirmed: true
        }
        setScheduledTime(session_token, {
          date: bookingData.selectedDate,
          time: bookingData.selectedTime
        })
        setBookingState(session_token, bookingData)

        // Mark this product as booked -- blocks re-entry into booking flow
        if (productId) {
          addBookedProduct(session_token, productId)
          const sd = validSessions.get(session_token)
          if (sd) {
            sd.bookedProductIds = sd.bookedProductIds || new Set()
            sd.bookedProductIds.add(productId.toLowerCase())
            validSessions.set(session_token, sd)
          }
        }

        // Simulate email -- log to console (no real send)
        const emailPayload = {
          to: userInfo?.email || 'unknown',
          subject: `Your Lennox dealer visit is confirmed -- ${bookingData.selectedDate} at ${bookingData.selectedTime}`,
          body: `Hi ${userInfo?.name || 'there'},\n\nYour visit with ${
            bookingData.dealerName
          } is confirmed!\n\nProduct of interest: ${bookingData.productId?.toUpperCase()}\nDate: ${
            bookingData.selectedDate
          }\nTime: ${bookingData.selectedTime}\nDealer: ${
            bookingData.dealerName
          }${
            bookingData.dealerCity ? ', ' + bookingData.dealerCity : ''
          }\n\nYour dealer will call you 30 minutes before your visit to confirm.\n\nSee you soon,\nThe Lennox Team`
        }
        console.log(
          '[NEW FLOW][SIMULATED EMAIL]',
          JSON.stringify(emailPayload, null, 2)
        )

        return res.json({
          result: {
            success: true,
            booking_confirmed: true,
            booking_summary: {
              date: bookingData.selectedDate,
              time: bookingData.selectedTime,
              product: bookingData.productId,
              dealer: bookingData.dealerName,
              dealer_city: bookingData.dealerCity,
              user_name: userInfo?.name,
              user_email: userInfo?.email,
              user_phone: userInfo?.phone,
              user_address: userInfo?.address
            },
            simulated_email_sent: true,
            context: `[BOOKING CONFIRMED. Show the confirmation card with: user info (${userInfo.name}, ${userInfo.phone}, ${userInfo.address}, ${userInfo.email}), date/time (${bookingData.selectedDate} at ${bookingData.selectedTime}), dealer (${bookingData.dealerName}). Then say EXACTLY this voice line: "Congrats, Your order is set. The dealer will call you 30 minutes before the scheduled visit." Booking is now locked -- do NOT re-enter the booking flow for this product.]`
          }
        })
      }

      // Handle client-side checkout automation via WebMCP tool bridge
      if (tool_name === 'webmcp_checkout_automation') {
        const action = tool_args?.action || 'auto'
        const allowedActions = [
          'confirm_purchase',
          'pay_with_google_pay',
          'auto'
        ]
        if (!allowedActions.includes(action)) {
          return res.status(400).json({
            error: `Invalid action '${action}'. Must be one of: ${allowedActions.join(
              ', '
            )}`
          })
        }

        return res.json({
          result: {
            success: true,
            has_webmcp_action: true,
            webmcp_action: action,
            context:
              '[Checkout automation action executed in UI. Keep speaking naturally and briefly confirm progress to the user.]'
          }
        })
      }

      logWarn(`[VOICE AGENT] SECURITY: Blocked unknown tool: ${tool_name}`)
      logSecurityEvent(session_token, {
        type: 'invalid_tool',
        ip: req.ip,
        details: { tool_name }
      })
      return res.status(400).json({ error: 'Invalid tool' })
    }) // end withSessionLock
    await persistSession(session_token)
    return toolResult
  } catch (err) {
    const duration = Date.now() - startTime
    logError(`[VOICE AGENT] ===== TOOL EXECUTION FAILED (${duration}ms) =====`)
    logError('[VOICE AGENT] Error:', err.message)
    logError('[VOICE AGENT] Stack:', err.stack)

    // PostHog: Log tool execution error
    const { tool_name: tn, call_id: cid, session_token: st } = req.body
    if (st) {
      logToolExecutionError(st, {
        toolName: tn,
        callId: cid,
        durationMs: duration,
        error: err.message,
        errorStack: err.stack
      })
    }

    res.status(500).json({ error: err.message })
  }
}

// Text-based evaluation endpoint - simulates voice agent for evaluation purposes
// Uses same system prompt and tools but returns text responses via Chat Completions API
export const evaluateTextResponse = async (req, res) => {
  const startTime = Date.now()
  try {
    const {
      question,
      market = 'UAE',
      conversationHistory = [],
      model_id
    } = req.body

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' })
    }

    // Support unified evaluation (no model) or model-specific evaluation
    let modelConfig = null
    if (model_id) {
      if (!hasModel(model_id)) {
        return res.status(404).json({
          error: `Model '${model_id}' not found`,
          availableModels: getModelsInfo().map(m => m.id)
        })
      }
      modelConfig = getModelConfig(model_id)
    }

    const sessionConfig = getSessionConfig()

    // Convert voice agent tools to Chat Completions format
    const chatTools = sessionConfig.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))

    // Build messages with conversation history for multi-turn support
    const messages = [{ role: 'system', content: sessionConfig.instructions }]

    // Add conversation history if provided (for turn-by-turn evaluation)
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })
      })
    }

    // Add current user question
    messages.push({ role: 'user', content: question })

    // Call OpenAI Chat Completions with tool support
    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          tools: chatTools,
          tool_choice: 'auto',
          temperature: 0.8,
          max_tokens: 800
        })
      }
    )

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text()
      console.error('[VOICE AGENT EVAL] OpenAI error:', err)
      throw new Error('Failed to call OpenAI')
    }

    const data = await openaiResponse.json()
    let response = data.choices[0]?.message
    let toolResults = []

    // Handle tool calls if any (single-LLM-call mode: no second completion pass)
    if (response?.tool_calls?.length > 0) {
      // Execute each tool call
      // eslint-disable-next-line no-unused-vars
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

        log(`[VOICE AGENT EVAL] Executing tool: ${toolName}`)

        const result = await executeToolCall(toolName, toolArgs, modelConfig)
        toolResults.push({
          name: toolName,
          args: toolArgs,
          result: result
        })
      }
    }

    const latencyMs = Date.now() - startTime
    const content = response?.content || ''

    log(`[VOICE AGENT EVAL] Response generated in ${latencyMs}ms`)

    res.json({
      success: true,
      response: content,
      toolsCalled: toolResults.map(t => t.name),
      toolsUsed: toolResults.map(t => t.name),
      toolResults,
      metrics: {
        latencyMs,
        model_id: model_id || 'unified',
        market,
        toolCallsCount: toolResults.length
      }
    })
  } catch (err) {
    const duration = Date.now() - startTime
    console.error(`[VOICE AGENT EVAL] Error (${duration}ms):`, err.message)
    res.status(500).json({ error: err.message })
  }
}
