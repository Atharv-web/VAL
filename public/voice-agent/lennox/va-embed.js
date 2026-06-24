;(function() {
  'use strict'
  /* eslint-env browser */
  /* global YT, Swiper, marked, runWebMCPCheckoutAutomation */

  // ===================================================
  // DYNAMIC CONFIGURATION FROM MASTER DIV
  // ===================================================

  // 1. Check if master DIV exists
  const masterDiv = document.querySelector('#swirl-ai-nva')
  if (!masterDiv) {
    console.log(
      '[Swirl AI] Master DIV #swirl-ai-nva not found. Plugin will nota load.'
    )
    return // Exit plugin if master DIV not present
  }

  // 2. Extract data attributes from master DIV
  const modelId = masterDiv.getAttribute('data-id') || '' // Optional for unified agent
  const nudgeTrigger = masterDiv.getAttribute('data-nudge-trigger') || ''
  const sendPrompt = masterDiv.getAttribute('data-send-prompt') || 'true'
  const defaultPromptText =
    masterDiv.getAttribute('data-default-prompt') || 'Ask Lennox AI'
  const voiceType = masterDiv.getAttribute('data-voice') || '' // 'male' or empty for female default
  const apiBaseUrl = (masterDiv.getAttribute('data-api-base') || '').trim() // Optional backend override
  const assetsBaseUrl = (
    masterDiv.getAttribute('data-assets-base') || ''
  ).trim() // Optional Lennox product assets override

  // 3. Model ID is optional - defaults to unified Lennox flow
  const isUnifiedAgent = !modelId
  if (isUnifiedAgent) {
    console.log(
      '[Swirl AI] 🌟 Loading unified Lennox agent (no specific model ID)'
    )
  } else {
    console.log('[Swirl AI] Loading single-model agent:', modelId)
  }

  // 4. Set global variables for easy access across the plugin
  window.SWIRL_CONFIG = {
    MODEL_ID: modelId || null, // null for unified agent
    NUDGE_TRIGGER: nudgeTrigger,
    ENABLE_PROMPT_AUTO_SEND: sendPrompt === 'true',
    DEFAULT_PROMPT_TEXT: defaultPromptText,
    VOICE: voiceType, // 'male' = male voice, empty = female (default)
    IS_UNIFIED: isUnifiedAgent, // Flag to track unified vs single-model mode
    API_BASE_URL: apiBaseUrl,
    ASSETS_BASE_URL: assetsBaseUrl
  }

  console.log(
    '[Swirl AI] 🚀 Dynamic configuration loaded:',
    window.SWIRL_CONFIG
  )

  // ===================================================
  // CONFIGURATION
  // ===================================================

  const LOCAL =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const normalizeBaseUrl = value => (value.endsWith('/') ? value : `${value}/`)
  const DEFAULT_LENNOX_ASSETS_BASE_URL =
    'https://ak-dyno-dump.s3.amazonaws.com/nudge-voice-assets/images/lennox-assets/'
  const BASE_URL = (() => {
    if (window.SWIRL_CONFIG.API_BASE_URL) {
      return normalizeBaseUrl(window.SWIRL_CONFIG.API_BASE_URL)
    }
    if (LOCAL) return 'http://localhost:6004/'
    return 'https://nudge.goswirl.ai/'
  })()
  const LENNOX_ASSETS_BASE_URL = (() => {
    if (window.SWIRL_CONFIG.ASSETS_BASE_URL) {
      return normalizeBaseUrl(window.SWIRL_CONFIG.ASSETS_BASE_URL)
    }
    return DEFAULT_LENNOX_ASSETS_BASE_URL
  })()
  const resolveLennoxImageUrl = (imageUrl = '', productId = '') => {
    const raw = String(imageUrl || '').trim()
    if (/^https?:\/\//i.test(raw)) return raw

    if (raw) {
      const normalizedRaw = raw.replace(/^\/?assets\//i, '')
      if (normalizedRaw !== raw) {
        return `${LENNOX_ASSETS_BASE_URL}${normalizedRaw}`
      }
      return raw
    }

    const safeId = String(productId || '').trim()
    if (!safeId) return ''
    return `${LENNOX_ASSETS_BASE_URL}${safeId}.png`
  }
  const TRIGGER_BASE_PATH = LOCAL
    ? '../triggers/'
    : 'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/triggers/'

  const CONFIG = {
    // Lennox voice-agent routes
    sessionUrl: (() => {
      const params = new URLSearchParams()
      if (window.SWIRL_CONFIG.VOICE)
        params.append('voice', window.SWIRL_CONFIG.VOICE)
      if (window.SWIRL_CONFIG.MODEL_ID)
        params.append('model_id', window.SWIRL_CONFIG.MODEL_ID)
      const queryString = params.toString()
      return `${BASE_URL}voice-agent/lennox/session${
        queryString ? `?${queryString}` : ''
      }`
    })(),
    toolsUrl: `${BASE_URL}voice-agent/lennox/tools`,
    contextDebugUrl: `${BASE_URL}voice-agent/lennox/context-debug`,
    realtimeUrl: `${BASE_URL}voice-agent/lennox/realtime`,
    bookingSlotsUrl: `${BASE_URL}voice-agent/lennox/booking-slots`,
    dealersUrl: `${BASE_URL}voice-agent/lennox/dealers`,
    checkoutBaseUrl: `${BASE_URL}checkout-sessions`,

    iconGifPath:
      'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/ai-nudge-animation.gif',

    // 🎬 Voice Agent Video States (4 states)
    voiceVideoStates: {
      default:
        'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/va-default-state.mp4',
      listening:
        'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/va-listening-state.mp4',
      thinking:
        'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/va-thinking-state.mp4',
      speaking:
        'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/va-speaking-state.mp4'
    },

    initDelay: 500,

    // 🎯 Simple Trigger System Settings (Dynamic)
    defaultPromptText: window.SWIRL_CONFIG.DEFAULT_PROMPT_TEXT,
    enablePageTriggers: !!window.SWIRL_CONFIG.NUDGE_TRIGGER, // Enable only if trigger file specified
    triggerJsUrl: window.SWIRL_CONFIG.NUDGE_TRIGGER
      ? `${TRIGGER_BASE_PATH}${window.SWIRL_CONFIG.NUDGE_TRIGGER}`
      : '',
    thinkingAnimationDuration: 400,

    // 🎯 AI Greeting Settings (Dynamic)
    enablePromptAutoSend: window.SWIRL_CONFIG.ENABLE_PROMPT_AUTO_SEND,
    defaultGreeting: 'How can I help you?',

    // 🖼️ S3 Assets URL for production
    s3AssetsUrl:
      'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets'
  }

  // Loading status filler phrases
  const FILLER_PHRASES = [
    'Let me look that up for you...',
    // "Good question, let me check...",
    'One moment while I find that information...',
    'Let me see what I can find...'
    // "Great question! Let me get those details..."
  ]

  // ===================================================
  // MODEL-SPECIFIC VIDEOS (EL16XC1 & XC21)
  // ===================================================

  const LENNOX_MODEL_VIDEOS = {
    xc21: [
      {
        title:
          'Lennox XC21 2 Stage Cooling - Innovative and Most Energy Efficient',
        url: 'https://www.youtube.com/watch?v=cJHg0ZcJd_I',
        videoId: 'cJHg0ZcJd_I',
        thumbnail_url: 'https://img.youtube.com/vi/cJHg0ZcJd_I/mqdefault.jpg'
      },
      {
        title: 'Lennox XC21 3 Ton Start Up, Run Noise & Install',
        url: 'https://www.youtube.com/watch?v=bA08MTbqJHk',
        videoId: 'bA08MTbqJHk',
        thumbnail_url: 'https://img.youtube.com/vi/bA08MTbqJHk/mqdefault.jpg'
      },
      {
        title: 'Lennox XC21 Air Conditioner Installation Review',
        url: 'https://www.youtube.com/watch?v=4iSHhVMgtLg',
        videoId: '4iSHhVMgtLg',
        thumbnail_url: 'https://img.youtube.com/vi/4iSHhVMgtLg/mqdefault.jpg'
      }
    ],
    el16xc1: [
      {
        title: 'Lennox Central Air Conditioner - What You Should Know',
        url: 'https://www.youtube.com/watch?v=IV275LGcN1o',
        videoId: 'IV275LGcN1o',
        thumbnail_url: 'https://img.youtube.com/vi/IV275LGcN1o/mqdefault.jpg'
      },
      {
        title: 'Lennox Elite EL16XC1 Install 2021',
        url: 'https://www.youtube.com/watch?v=GmjuTp5_uWA',
        videoId: 'GmjuTp5_uWA',
        thumbnail_url: 'https://img.youtube.com/vi/GmjuTp5_uWA/mqdefault.jpg'
      },
      {
        title: 'Lennox Two-Stage Air Conditioning Technology',
        url: 'https://www.youtube.com/watch?v=mvKssP2gz1g',
        videoId: 'mvKssP2gz1g',
        thumbnail_url: 'https://img.youtube.com/vi/mvKssP2gz1g/mqdefault.jpg'
      }
    ]
  }

  // ===================================================
  // STATE VARIABLES
  // ===================================================

  let initialized = false
  let modalOpen = false
  let scrollPosition = 0

  // 🎯 Global persona variable (accessible by trigger JS)
  window.SWIRL_ACTIVE_PERSONA = 'PERFORMANCE'

  // Conversation turn state (for clearing old responses)
  let currentConversationTurn = 0
  let isFirstEventInTurn = true
  let assistantTranscriptFinalizedThisTurn = false
  let progressiveMediaShownThisTurn = false

  // YouTube Video Modal state
  let youtubePlayer = null
  // eslint-disable-next-line no-unused-vars
  let youtubeAPIReady = false
  let currentVideoData = []
  let currentVideoIndex = 0
  let videoSwiper = null
  let updateProgressInterval = null
  let isInitializingPlayer = false
  let playerInitTimeout = null

  // Image Modal state
  let currentImageData = []
  let currentImageIndex = 0
  let imageSwiper = null

  // WebRTC state
  let peerConnection = null
  let dataChannel = null
  let localStream = null
  let remoteAudioEl = null
  let isConnected = false
  let sessionConfig = null
  let sessionToken = null
  let userMutedMic = false
  let isAISpeaking = false
  let currentModelId = null // Tracks active Lennox model context
  let isListening = false
  let pendingMessageAfterCancel = null // Message to send after response cancellation
  let isAIGreeting = false // Flag to track AI greeting phase (prevents mic feedback loop)
  let pendingLennoxIntroQuestion = false // After intro line finishes, ask the follow-up question
  let pendingMediaEnrichment = null // Media from Lennox tool results - rendered after AI response
  let pendingProductCards = null // Product cards queued to render after assistant answer
  let pendingTurnUiComponents = null // Qualification/selection UI from backend tool calls (render after spoken answer)
  let pendingBookingSlotsTriggerFromTurn = false // Set when backend message says to show available times
  let bookingSlotsFetchInFlight = false
  let homeInfoCollected = false // Set true after all 3 qualifier steps complete
  let backendHomeInfo = { mode: null, location: null, size: null }
  let backendHomeInfoComplete = false
  const NUDGE4_FLOW = Object.freeze({
    IDLE: 'idle',
    PROMPT_SENT: 'prompt_sent',
    REVIEWS_TOOL_COMPLETED: 'reviews_tool_completed',
    AWAITING_OPT_IN: 'awaiting_opt_in',
    QUALIFIER_STARTED: 'qualifier_started'
  })
  // eslint-disable-next-line no-unused-vars
  let nudge4FlowState = NUDGE4_FLOW.IDLE

  // eslint-disable-next-line no-unused-vars
  let lastVisitBookingSummary = null // Stores latest booking summary for final confirmation UI fallback
  let lastShownLennoxCards = [] // Track currently displayed product cards for voice selection
  // eslint-disable-next-line no-unused-vars
  let lastMentionedCard = null // Last card the AI confirmed — set when user picks one, cleared after checkout card shown
  let lastConfirmedCard = null // Sticky — survives grid clears, used as fallback when lastMentionedCard is null at checkout
  let checkoutPending = false // Set true when "let's get that sorted" fires — waiting for card or click
  let chosenCardScheduled = false // Set true when chosen card is already scheduled via timeout — blocks regular grid
  let orderCompleted = false // Set true after actual payment — blocks everything
  let userZipCode = '94043' // Default zip; updated if user mentions their zip in conversation
  // Checkout automation state (used by WebMCP automation tool)
  let currentInputMode = 'voice' // Global state: 'voice' or 'text'
  let hasRealMicrophone = false // Flag to track if user has real mic (not silent track)

  // Test mode - enabled via ?test URL parameter for debugging
  const urlParams = new URLSearchParams(window.location.search)
  const isTestMode = urlParams.has('test')
  console.log(
    '[Swirl AI] URL params:',
    window.location.search,
    '| isTestMode:',
    isTestMode
  )
  if (isTestMode) {
    console.log(
      '[Swirl AI] 🧪 TEST MODE ENABLED - Session ID will be displayed for debugging'
    )
  }

  // Interaction detection (for sliders/carousels)
  let interactionDebounce = null
  let activeSection = null
  let sectionDwellTimer = null
  let scrollStopTimer = null
  let sectionPrompts = null
  let currentPrompts = []
  let currentPromptIndex = 0

  // Audio visualization
  let audioContext = null
  let analyser = null
  let animationFrameId = null

  // Remote audio analyzer (for detecting when AI stops speaking)
  let remoteAudioContext = null
  let remoteAudioAnalyser = null

  // Text streaming state
  let transcriptQueue = []
  let displayedText = ''
  // eslint-disable-next-line no-unused-vars
  let fullTranscript = ''
  let currentAssistantMessage = ''
  let syncInterval = null
  let firstTranscriptTime = null
  // eslint-disable-next-line no-unused-vars
  let audioPlayStartTime = null
  // eslint-disable-next-line no-unused-vars
  let isAudioPlaying = false

  async function fetchAndDisplayBookingSlots(triggerSource = 'unknown') {
    if (bookingSlotsFetchInFlight) return
    if (!sessionToken) return
    if (document.querySelector('.swirl-ai-booking-slots-container')) return

    bookingSlotsFetchInFlight = true
    try {
      const slotsResp = await fetch(
        `${CONFIG.bookingSlotsUrl}?session_token=${encodeURIComponent(
          sessionToken
        )}`
      )
      if (!slotsResp.ok) {
        let errorPayload = null
        try {
          errorPayload = await slotsResp.json()
        } catch (_e) {}
        console.warn('[Lennox] Booking slots fetch blocked/failed:', {
          triggerSource,
          status: slotsResp.status,
          body: errorPayload
        })
        return
      }

      const slotsData = await slotsResp.json()
      if (
        slotsData?.allowed &&
        Array.isArray(slotsData.booking_slots) &&
        slotsData.booking_slots.length > 0
      ) {
        displayBookingSlots(slotsData.booking_slots)
        return
      }

      console.warn('[Lennox] Booking slots response had no usable slots:', {
        triggerSource,
        payload: slotsData
      })
    } catch (e) {
      console.warn('[Lennox] Could not fetch booking slots:', e)
    } finally {
      bookingSlotsFetchInFlight = false
    }
  }

  // eslint-disable-next-line no-unused-vars
  function isNudge4ReviewPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') return false
    const normalized = promptText.toLowerCase()
    return (
      normalized.includes('every sale has a story') ||
      normalized.includes("here's what they're saying") ||
      normalized.includes('real owners') ||
      normalized.includes('reviews')
    )
  }

  // eslint-disable-next-line no-unused-vars
  function isPositiveNudgeOptIn(transcript) {
    if (!transcript || typeof transcript !== 'string') return false
    const normalized = transcript.toLowerCase().trim()
    if (!normalized) return false
    return /\b(yes|yeah|yep|sure|ok|okay|go ahead|sounds good|let's do it|lets do it|please do|do it|start|continue)\b/.test(
      normalized
    )
  }

  function resetNudge4Flow() {
    nudge4FlowState = NUDGE4_FLOW.IDLE
  }

  // eslint-disable-next-line no-unused-vars
  function callGatherHomeInfo() {
    if (!dataChannel || dataChannel.readyState !== 'open') return
    if (homeInfoCollected || qualificationStepsContainer) return
    handleNewUserQuestion()
    muteMicrophone()
    showLoadingStatus()
    dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Yes, I want to find the right Lennox system for my home.'
            }
          ]
        }
      })
    )
    dataChannel.send(JSON.stringify({ type: 'response.create' }))
  }

  // Sync constants
  const TEXT_DELAY_MS = 300
  const SYNC_INTERVAL_MS = 30

  // ===================================================
  // LOAD EXTERNAL LIBRARIES & CSS
  // ===================================================

  function loadPluginCSS() {
    console.log('[Swirl AI] Loading plugin CSS...')
    const pluginCSS = document.createElement('link')
    pluginCSS.rel = 'stylesheet'
    pluginCSS.href =
      'https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/style.min.css'
    document.head.appendChild(pluginCSS)

    console.log('[Swirl AI] ✅ Plugin CSS injected')
  }

  function injectConnectionLoaderStyles() {
    if (document.getElementById('swirl-ai-connection-loader-styles')) return

    const style = document.createElement('style')
    style.id = 'swirl-ai-connection-loader-styles'
    style.textContent = `
      .swirl-ai-connection-loader {
        position: absolute;
        inset: 0;
        z-index: 10000001;
        background: #131126;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.35s ease, visibility 0s linear 0.35s;
      }

      .swirl-ai-connection-loader::before {
        content: '';
        position: absolute;
        inset: 0;
        box-shadow: inset 0 0 55px 14px rgba(140, 145, 228, 0.18);
        pointer-events: none;
        z-index: 0;
      }

      .swirl-ai-connection-loader.visible {
        opacity: 1;
        visibility: visible;
        pointer-events: all;
        transition: opacity 0.35s ease, visibility 0s;
      }

      .swirl-ai-connection-loader.hiding {
        background: transparent;
        opacity: 1;
        visibility: hidden;
        pointer-events: none;
        transition: background 0.6s ease, visibility 0s linear 0.85s;
      }

      .swirl-ai-connection-loader.hiding::before {
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .swirl-ai-connection-loader.hiding .swirl-ai-loader-header {
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .swirl-ai-connection-loader.hiding .swirl-ai-loader-phrases,
      .swirl-ai-connection-loader.hiding .swirl-ai-powered-badge--loader {
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .swirl-ai-connection-loader.hiding .swirl-ai-loader-orb-img {
        transform: translate(-50%, calc(76px - 50vh)) scale(0.47);
        animation: none !important;
        transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .swirl-ai-loader-orb-img {
        position: absolute;
        left: 50%;
        top: calc(50% - 52px);
        transform: translate(-50%, -50%);
        width: 171px;
        height: 171px;
        border-radius: 50%;
        animation: swirl-loader-breathe 3s ease-in-out infinite;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
        z-index: 1;
        pointer-events: none;
      }

      @keyframes swirl-loader-breathe {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.06); }
      }

      .swirl-ai-loader-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: grid;
        grid-template-columns: 44px 1fr 44px;
        align-items: center;
        gap: 20px;
        padding: 10px 20px;
        z-index: 2;
        transition: opacity 0.25s ease;
      }

      .swirl-ai-loader-title {
        font-family: 'Circular Std', 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 700;
        font-size: 32px;
        line-height: 28px;
        color: #ffffff;
        text-align: center;
        white-space: nowrap;
        justify-self: center;
      }

      .swirl-ai-loader-close-btn {
        width: 44px;
        height: 44px;
        background: transparent;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        justify-self: end;
        transition: background 0.3s ease;
      }

      .swirl-ai-loader-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
      }

      .swirl-ai-loader-phrases {
        position: absolute;
        left: 50%;
        top: calc(50% + 68px);
        transform: translateX(-50%);
        width: 290px;
        height: 54px;
        z-index: 1;
        transition: opacity 0.2s ease;
      }

      .swirl-ai-loader-phrase {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        transform: translateY(-50%);
        font-family: 'Montserrat', sans-serif;
        font-size: 17px;
        font-weight: 600;
        line-height: 27px;
        text-align: center;
        background: linear-gradient(to right, #cfc8c8 0%, #ffffff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        opacity: 0;
        transition: opacity 0.5s ease;
      }

      .swirl-ai-loader-phrase.active {
        opacity: 1;
      }

      .swirl-ai-powered-badge {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 14px 6px 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 100px;
        cursor: pointer;
        text-decoration: none;
        transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
        white-space: nowrap;
        z-index: 10;
      }

      .swirl-ai-powered-badge:hover {
        background: rgba(255, 255, 255, 0.11);
        border-color: rgba(140, 145, 228, 0.4);
        transform: translateX(-50%) translateY(-2px);
        box-shadow: 0 4px 20px rgba(140, 145, 228, 0.2);
      }

      .swirl-ai-powered-badge--loader {
        z-index: 10000001;
      }

      .swirl-ai-powered-text {
        font-family: 'Montserrat', sans-serif;
        font-size: 10px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.45);
        letter-spacing: 0.3px;
      }

      .swirl-ai-powered-icon {
        height: 13px;
        width: auto;
        opacity: 0.85;
        display: block;
        filter: brightness(0) invert(1);
      }
    `
    document.head.appendChild(style)
  }

  function loadSwiperLibrary() {
    return new Promise((resolve, reject) => {
      if (typeof Swiper !== 'undefined') {
        console.log('[Swirl AI] Swiper already loaded')
        resolve()
        return
      }

      console.log('[Swirl AI] Loading Swiper library...')

      const swiperCSS = document.createElement('link')
      swiperCSS.rel = 'stylesheet'
      swiperCSS.href =
        'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css'
      document.head.appendChild(swiperCSS)

      const swiperJS = document.createElement('script')
      swiperJS.src =
        'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js'
      swiperJS.onload = () => {
        console.log('[Swirl AI] ✅ Swiper library loaded successfully')
        resolve()
      }
      swiperJS.onerror = () => {
        console.error('[Swirl AI] ❌ Failed to load Swiper library')
        reject(new Error('Failed to load Swiper'))
      }
      document.head.appendChild(swiperJS)
    })
  }

  function loadMarkedLibrary() {
    return new Promise((resolve, reject) => {
      if (typeof marked !== 'undefined') {
        console.log('[Swirl AI] Marked already loaded')
        resolve()
        return
      }

      console.log('[Swirl AI] Loading Marked library...')
      const markedJS = document.createElement('script')
      markedJS.src = 'https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js'
      markedJS.onload = () => {
        console.log('[Swirl AI] ✅ Marked library loaded successfully')
        resolve()
      }
      markedJS.onerror = () => {
        console.error('[Swirl AI] ❌ Failed to load Marked library')
        reject(new Error('Failed to load Marked'))
      }
      document.head.appendChild(markedJS)
    })
  }

  function loadYouTubeAPI() {
    return new Promise((resolve, reject) => {
      if (typeof YT !== 'undefined' && YT.Player) {
        console.log('[Swirl AI] YouTube API already loaded')
        youtubeAPIReady = true
        resolve()
        return
      }

      console.log('[Swirl AI] Loading YouTube IFrame API...')

      // YouTube API requires window callback
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Swirl AI] ✅ YouTube API loaded successfully')
        youtubeAPIReady = true
        resolve()
      }

      const ytScript = document.createElement('script')
      ytScript.src = 'https://www.youtube.com/iframe_api'
      ytScript.onerror = () => {
        console.error('[Swirl AI] ❌ Failed to load YouTube API')
        reject(new Error('Failed to load YouTube API'))
      }
      document.head.appendChild(ytScript)
    })
  }

  // ===================================================
  // INITIALIZATION
  // ===================================================

  async function init() {
    console.log(
      '[Swirl AI] Initializing Nudge Plugin (WebRTC Dynamic Version)...'
    )

    if (initialized) {
      console.log('[Swirl AI] Already initialized, skipping...')
      return
    }

    // Inject plugin CSS
    loadPluginCSS()
    injectConnectionLoaderStyles()

    try {
      // Pre-load libraries
      await Promise.all([loadSwiperLibrary(), loadMarkedLibrary()])

      // Build and inject floating nudge with default prompt
      buildFloatingNudge()

      // Initialize page-specific triggers (will load prompts from trigger JS)
      if (CONFIG.enablePageTriggers) {
        await loadPageTriggers()
      }

      // Listen for nudge events from nudge-observer.js
      window.addEventListener('swirl:nudge', e => {
        const decision = e.detail
        if (decision?.should_nudge && decision?.message) {
          updatePrompt(decision.message, decision.prompt)
        }
      })

      window.addEventListener('swirl:send-prompt', e => {
        const { prompt } = e.detail || {}
        if (prompt) {
          pendingPromptToSend = prompt
          openModal()
        }
      })

      // Show initial prompt (will show default "Ask Lennox AI")
      showPromptWithAnimation()

      // Create hidden audio element for remote audio
      remoteAudioEl = document.createElement('audio')
      remoteAudioEl.autoplay = true
      document.body.appendChild(remoteAudioEl)

      // Setup audio sync listeners
      setupAudioSyncListeners()

      // Setup viewport resize listener for modal height adjustment (mobile URL bar)
      window.addEventListener('resize', () => {
        if (modalOpen) {
          setModalDynamicHeight()
        }
      })

      // Also listen to orientationchange event on mobile
      window.addEventListener('orientationchange', () => {
        if (modalOpen) {
          setTimeout(setModalDynamicHeight, 100)
        }
      })

      initialized = true
      console.log(
        '[Swirl AI] ✅ Nudge Plugin Initialized Successfully (WebRTC Dynamic Mode)'
      )

      // Append Posthog script for analytics
      appendPosthogScript()
    } catch (error) {
      console.error('[Swirl AI] ❌ Initialization Error:', error)
    }
  }

  function appendPosthogScript() {
    const scriptEl = document.createElement('script')
    scriptEl.type = 'text/javascript'
    scriptEl.text = `
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init('phc_js7ivtV0gIdOYvGlKin9bJbVuHbT823I8kZntiBYPfU', {
            api_host: 'https://us.i.posthog.com',
            person_profiles: 'always',
            // Session Replay - Full Recording
            session_recording: {
                maskAllInputs: false,
                maskInputOptions: {
                    password: true
                },
                recordCrossOriginIframes: true,
            },
            capture_pageview: true,
            capture_pageleave: true,
            loaded: (posthogInstance) => {
                posthogInstance.register({
                    nva_model: '${window.SWIRL_CONFIG.MODEL_ID}',
                    nva_org: 'lennox',
                    nva_source: 'frontend'
                });
                // Start session recording immediately
                posthogInstance.startSessionRecording();
                window.SWIRL_POSTHOG_READY = true;
            },
        })
    `
    document.head.appendChild(scriptEl)

    console.log('[Swirl AI] PostHog Initialized with Session Replay.')
  }

  // ===================================================
  // POSTHOG LOGGER - Unified Event Tracking
  // ===================================================

  // Session token for correlation (set when session is created)
  let posthogSessionToken = null

  // Cumulative session token usage tracking
  let sessionTokenStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalAudioInputTokens: 0,
    totalAudioOutputTokens: 0,
    totalCachedTokens: 0,
    responseCount: 0
  }

  // Reset session token stats
  const resetSessionTokenStats = () => {
    sessionTokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalAudioInputTokens: 0,
      totalAudioOutputTokens: 0,
      totalCachedTokens: 0,
      responseCount: 0
    }
  }

  // Update cumulative token stats
  const updateSessionTokenStats = usage => {
    if (!usage) return
    sessionTokenStats.totalInputTokens += usage.input_tokens || 0
    sessionTokenStats.totalOutputTokens += usage.output_tokens || 0
    sessionTokenStats.totalTokens += usage.total_tokens || 0
    sessionTokenStats.totalAudioInputTokens +=
      usage.input_token_details?.audio_tokens || 0
    sessionTokenStats.totalAudioOutputTokens +=
      usage.output_token_details?.audio_tokens || 0
    sessionTokenStats.totalCachedTokens +=
      usage.input_token_details?.cached_tokens || 0
    sessionTokenStats.responseCount++
  }

  // ===================================================
  // DEBUG: DETAILED TOKEN CONTEXT LOGGER
  // Tracks exactly what's being sent to OpenAI each turn
  // ===================================================
  const DEBUG_TOKENS = true // Set to false to disable detailed logging

  // Conversation context tracker - mirrors what OpenAI sees
  const conversationContextTracker = {
    systemPromptTokens: 0, // Estimated from session config
    toolDefinitionsTokens: 0, // Estimated from tools array
    systemPrompt: '', // Store actual system prompt for logging
    turns: [], // Array of { role, content, tokens, timestamp }

    reset() {
      this.turns = []
      this.systemPrompt = ''
      console.log('[TOKEN DEBUG] 🔄 Conversation context reset')
    },

    // Rough token estimation (~4 chars per token for English)
    estimateTokens(text) {
      if (!text) return 0
      const str = typeof text === 'string' ? text : JSON.stringify(text)
      return Math.ceil(str.length / 4)
    },

    addTurn(role, content, type = 'message') {
      const tokens = this.estimateTokens(content)
      const turn = {
        index: this.turns.length,
        role,
        type,
        tokens,
        content: content, // Store FULL content for detailed logging
        contentPreview:
          typeof content === 'string'
            ? content.substring(0, 100) + (content.length > 100 ? '...' : '')
            : JSON.stringify(content).substring(0, 100) + '...',
        contentLength:
          typeof content === 'string'
            ? content.length
            : JSON.stringify(content).length,
        timestamp: new Date().toISOString()
      }
      this.turns.push(turn)

      if (DEBUG_TOKENS) {
        console.log(`[TOKEN DEBUG] ➕ Turn ${turn.index} added:`, {
          role,
          type,
          tokens,
          contentLength: turn.contentLength
        })
      }

      return turn
    },

    // Update the most recent user turn with the real transcript once it arrives.
    // This prevents the tracker showing assistant→assistant when the transcript
    // completion event fires after the AI has already started responding.
    updateLastUserTurn(transcript) {
      for (let i = this.turns.length - 1; i >= 0; i--) {
        if (
          this.turns[i].role === 'user' &&
          this.turns[i].type === 'audio_transcript'
        ) {
          const turn = this.turns[i]
          turn.content = transcript
          turn.tokens = this.estimateTokens(transcript)
          turn.contentPreview =
            transcript.substring(0, 100) +
            (transcript.length > 100 ? '...' : '')
          turn.contentLength = transcript.length
          if (DEBUG_TOKENS) {
            console.log(
              `[TOKEN DEBUG] ✏️ Turn ${i} updated with transcript: "${transcript.substring(
                0,
                50
              )}${transcript.length > 50 ? '...' : ''}"`
            )
          }
          return
        }
      }
      // No pending user turn found — add it fresh (fallback)
      this.addTurn('user', transcript, 'audio_transcript')
    },

    getTotalContextTokens() {
      const turnsTokens = this.turns.reduce((sum, t) => sum + t.tokens, 0)
      return this.systemPromptTokens + this.toolDefinitionsTokens + turnsTokens
    },

    printContextBreakdown() {
      console.log('\n' + '═'.repeat(70))
      console.log('📊 CONVERSATION CONTEXT BREAKDOWN')
      console.log('═'.repeat(70))
      console.log(
        `System Prompt:     ~${this.systemPromptTokens.toLocaleString()} tokens`
      )
      console.log(
        `Tool Definitions:  ~${this.toolDefinitionsTokens.toLocaleString()} tokens`
      )
      console.log('─'.repeat(70))

      let runningTotal = this.systemPromptTokens + this.toolDefinitionsTokens
      this.turns.forEach((turn, i) => {
        runningTotal += turn.tokens
        const roleIcon =
          turn.role === 'user' ? '👤' : turn.role === 'assistant' ? '🤖' : '🔧'
        console.log(
          `Turn ${i}: ${roleIcon} ${turn.role.padEnd(12)} | ${turn.type.padEnd(
            15
          )} | ~${turn.tokens
            .toString()
            .padStart(5)} tokens | Running: ${runningTotal.toLocaleString()}`
        )
        if (turn.type === 'tool_result') {
          console.log(
            `         └─ Content length: ${turn.contentLength.toLocaleString()} chars`
          )
        }
      })

      console.log('─'.repeat(70))
      console.log(
        `ESTIMATED TOTAL: ~${this.getTotalContextTokens().toLocaleString()} tokens`
      )
      console.log('═'.repeat(70) + '\n')
    },

    // Print FULL context as OpenAI sees it (for deep debugging)
    printFullContext() {
      console.log('\n' + '█'.repeat(80))
      console.log(
        '📜 FULL CONVERSATION CONTEXT (What OpenAI Sees at This Turn)'
      )
      console.log('█'.repeat(80))

      // System prompt (truncated for readability)
      console.log(
        '\n┌─ SYSTEM PROMPT ─────────────────────────────────────────────────────────────'
      )
      console.log(
        `│ Length: ${this.systemPrompt.length.toLocaleString()} chars (~${this.systemPromptTokens.toLocaleString()} tokens)`
      )
      if (this.systemPrompt) {
        console.log('│ Content (first 500 chars):')
        const promptLines = this.systemPrompt.substring(0, 500).split('\n')
        promptLines.forEach(line => console.log('│ ' + line))
        if (this.systemPrompt.length > 500) console.log('│ ... [truncated]')
      }
      console.log(
        '└──────────────────────────────────────────────────────────────────────────────\n'
      )

      // Each turn with full content
      this.turns.forEach((turn, i) => {
        const roleIcon =
          turn.role === 'user'
            ? '👤 USER'
            : turn.role === 'assistant'
            ? '🤖 ASSISTANT'
            : '🔧 TOOL RESULT'

        console.log(
          `┌─ TURN ${i}: ${roleIcon} ─────────────────────────────────────────────────────`
        )
        console.log(`│ Type: ${turn.type}`)
        console.log(
          `│ Tokens: ~${turn.tokens.toLocaleString()} | Chars: ${turn.contentLength.toLocaleString()}`
        )
        console.log(`│ Time: ${turn.timestamp}`)
        console.log('│')
        console.log('│ CONTENT:')

        // Print full content (with reasonable limit)
        const content =
          typeof turn.content === 'string'
            ? turn.content
            : JSON.stringify(turn.content, null, 2)
        const maxChars = turn.type === 'tool_result' ? 3000 : 1000 // More for tool results
        const lines = content.substring(0, maxChars).split('\n')
        lines.forEach(line => console.log('│ ' + line))
        if (content.length > maxChars) {
          console.log(`│`)
          console.log(
            `│ ... [${(
              content.length - maxChars
            ).toLocaleString()} more chars truncated]`
          )
        }
        console.log(
          '└──────────────────────────────────────────────────────────────────────────────\n'
        )
      })

      // Summary
      const totalTokens = this.getTotalContextTokens()
      console.log('█'.repeat(80))
      console.log(
        `📊 TOTAL CONTEXT SIZE: ~${totalTokens.toLocaleString()} tokens`
      )
      console.log(
        `   ├─ System Prompt: ~${this.systemPromptTokens.toLocaleString()} tokens`
      )
      console.log(
        `   ├─ Tool Definitions: ~${this.toolDefinitionsTokens.toLocaleString()} tokens`
      )
      console.log(
        `   └─ Conversation Turns: ~${this.turns
          .reduce((s, t) => s + t.tokens, 0)
          .toLocaleString()} tokens (${this.turns.length} turns)`
      )
      console.log('█'.repeat(80) + '\n')
    },

    // Get data for sending to backend
    getContextData() {
      return {
        systemPrompt: this.systemPrompt,
        systemPromptTokens: this.systemPromptTokens,
        toolDefinitionsTokens: this.toolDefinitionsTokens,
        turns: this.turns.map(t => ({
          role: t.role,
          type: t.type,
          tokens: t.tokens,
          content: t.content,
          contentLength: t.contentLength,
          timestamp: t.timestamp
        })),
        totalTokens: this.getTotalContextTokens()
      }
    }
  }

  // Send context debug data to backend for file logging
  const sendContextToBackend = async (turnNumber, openaiUsage) => {
    if (!DEBUG_TOKENS || !sessionToken) return

    try {
      const contextData = conversationContextTracker.getContextData()
      contextData.openaiUsage = openaiUsage

      const response = await fetch(CONFIG.contextDebugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          turn_number: turnNumber,
          context_data: contextData
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log(
          `[TOKEN DEBUG] 📁 Context logged to file: ${result.log_file}`
        )
      } else {
        console.warn(
          '[TOKEN DEBUG] Failed to log context to backend:',
          response.status
        )
      }
    } catch (err) {
      console.warn(
        '[TOKEN DEBUG] Error sending context to backend:',
        err.message
      )
    }
  }

  // Log what's being sent to OpenAI via data channel
  const logDataChannelMessage = (payload, direction = 'SEND') => {
    if (!DEBUG_TOKENS) return

    const msg = typeof payload === 'string' ? JSON.parse(payload) : payload
    const tokens = conversationContextTracker.estimateTokens(payload)

    console.log(
      `[TOKEN DEBUG] ${
        direction === 'SEND' ? '📤' : '📥'
      } DataChannel ${direction}:`,
      {
        type: msg.type,
        estimatedTokens: tokens,
        ...(msg.item?.type && { itemType: msg.item.type }),
        ...(msg.item?.call_id && { callId: msg.item.call_id })
      }
    )

    // Track tool results being sent to OpenAI
    if (
      msg.type === 'conversation.item.create' &&
      msg.item?.type === 'function_call_output'
    ) {
      const output = msg.item.output
      const outputSize = output ? output.length : 0
      conversationContextTracker.addTurn('tool', output, 'tool_result')

      // Parse and show what's in the tool result
      try {
        const parsed = JSON.parse(output)
        console.log('[TOKEN DEBUG] 🔧 Tool result breakdown:', {
          success: parsed.success,
          contextLength: parsed.context?.length || 0,
          hasImages: !!parsed.images?.length,
          imagesCount: parsed.images?.length || 0,
          hasVideos: !!parsed.youtube_references?.length,
          videosCount: parsed.youtube_references?.length || 0,
          hasReviews: !!parsed.reviews?.length,
          reviewsCount: parsed.reviews?.length || 0,
          hasCards: !!parsed.cards?.length,
          totalOutputBytes: outputSize
        })
      } catch (e) {
        // Not JSON, just log size
      }
    }
  }

  // ===================================================
  // TOKEN OPTIMIZATION: Strip media data before sending to OpenAI
  // Since media is displayed in UI, we don't need to send full data to AI
  // Set to true to enable token savings (can reduce ~50-70% of tool result tokens)
  // ===================================================
  const OPTIMIZE_TOOL_TOKENS = true // Keep tool outputs compact to reduce context growth

  const optimizeToolResultForAI = result => {
    if (!OPTIMIZE_TOOL_TOKENS) return result

    // Create a copy to avoid mutating original
    const optimized = { ...result }

    // Strip images - just tell AI how many were shown
    if (optimized.images?.length > 0) {
      const count = optimized.images.length
      optimized.images_shown = count
      optimized.images = undefined // Remove full image data
      console.log(`[TOKEN OPT] Stripped ${count} images from tool result`)
    }

    // Strip youtube references - just tell AI how many videos
    if (optimized.youtube_references?.length > 0) {
      const count = optimized.youtube_references.length
      const titles = optimized.youtube_references
        .map(v => v.title || 'Video')
        .slice(0, 2)
      optimized.videos_shown = count
      optimized.video_titles = titles // Keep just titles for context
      optimized.youtube_references = undefined
      console.log(`[TOKEN OPT] Stripped ${count} videos from tool result`)
    }

    // Strip reviews - just tell AI review count and summary
    if (optimized.reviews?.length > 0) {
      const count = optimized.reviews.length
      optimized.reviews_shown = count
      optimized.reviews = undefined
      console.log(`[TOKEN OPT] Stripped ${count} reviews from tool result`)
    }

    // Strip booking slots - AI doesn't need full slot details
    if (optimized.booking_slots?.length > 0) {
      const count = optimized.booking_slots.length
      optimized.slots_shown = count
      optimized.booking_slots = undefined
      console.log(
        `[TOKEN OPT] Stripped ${count} booking slots from tool result`
      )
    }

    // Strip locations - keep just names for context
    if (optimized.locations?.length > 0) {
      const count = optimized.locations.length
      const names = optimized.locations.map(l => l.name || l.title).slice(0, 3)
      optimized.locations_shown = count
      optimized.location_names = names
      optimized.locations = undefined
      console.log(`[TOKEN OPT] Stripped ${count} locations from tool result`)
    }

    return optimized
  }

  // PostHog session replay URL (captured when session starts)
  let posthogReplayUrl = null

  // Set session token for PostHog correlation
  const setPosthogSessionToken = token => {
    posthogSessionToken = token
    posthogReplayUrl = null // Reset replay URL for new session
    resetSessionTokenStats() // Reset stats for new session
    if (window.posthog && token) {
      // Identify user by session token for correlation with backend
      window.posthog.identify(token)
      window.posthog.register({ nva_session_token: token })

      // Capture the session replay URL for debugging
      try {
        posthogReplayUrl = window.posthog.get_session_replay_url({
          withTimestamp: true
        })
        console.log('[PostHog] 🎥 Session Replay URL:', posthogReplayUrl)
      } catch (err) {
        console.warn('[PostHog] Could not get replay URL:', err.message)
      }

      console.log(
        '[PostHog] Session token set for correlation:',
        token.substring(0, 8) + '...'
      )
    }
  }

  // Core logging function
  const logEvent = (eventName, properties = {}) => {
    if (!window.posthog) {
      console.warn('[PostHog] Not initialized, skipping event:', eventName)
      return
    }

    const eventData = {
      ...properties,
      nva_session_token: posthogSessionToken,
      // Include cumulative token stats for debugging
      session_total_tokens: sessionTokenStats.totalTokens,
      session_response_count: sessionTokenStats.responseCount,
      nva_model: window.SWIRL_CONFIG?.MODEL_ID,
      nva_source: 'frontend',
      timestamp: new Date().toISOString()
    }

    window.posthog.capture(eventName, eventData)
    console.log(
      `[PostHog] ${eventName}:`,
      JSON.stringify(properties).substring(0, 200)
    )
  }

  // Session Events
  const logSessionStarted = data => {
    logEvent('session_started', {
      model_id: data.modelId,
      model_name: data.modelName,
      replay_url: posthogReplayUrl,
      posthog_session_id: window.posthog?.get_session_id?.() || null
    })
  }

  const logSessionError = data => {
    logEvent('session_error', {
      error: data.error,
      stage: data.stage
    })
  }

  const logSessionEnded = data => {
    logEvent('session_ended', {
      duration_ms: data.durationMs,
      total_turns: data.totalTurns
    })
  }

  // WebRTC Events
  const logWebRTCConnecting = () => {
    logEvent('webrtc_connecting', {})
  }

  const logWebRTCConnected = data => {
    logEvent('webrtc_connected', {
      latency_ms: data.latencyMs
    })
  }

  const logWebRTCError = data => {
    logEvent('webrtc_error', {
      error: data.error,
      ice_state: data.iceState
    })
  }

  // Audio Events
  const logMicPermissionGranted = () => {
    logEvent('mic_permission_granted', {})
  }

  const logMicPermissionDenied = () => {
    logEvent('mic_permission_denied', {})
  }

  const logMicMuted = data => {
    logEvent('mic_muted', {
      by: data.by // 'user' or 'system'
    })
  }

  const logMicUnmuted = () => {
    logEvent('mic_unmuted', {})
  }

  // Conversation Events
  const logUserSpeechStarted = data => {
    logEvent('user_speech_started', {
      turn_number: data.turnNumber
    })
  }

  const logUserSpeechStopped = data => {
    logEvent('user_speech_stopped', {
      duration_ms: data.durationMs,
      turn_number: data.turnNumber
    })
  }

  const logUserTranscript = data => {
    logEvent('user_transcript', {
      text: data.text,
      turn_number: data.turnNumber
    })
  }

  const logAIResponseStarted = data => {
    logEvent('ai_response_started', {
      turn_number: data.turnNumber
    })
  }

  const logAIResponseText = data => {
    logEvent('ai_response_text', {
      text: data.text,
      turn_number: data.turnNumber
    })
  }

  const logAIResponseCompleted = data => {
    logEvent('ai_response_completed', {
      duration_ms: data.durationMs,
      turn_number: data.turnNumber,
      // Token usage from response.done
      input_tokens: data.inputTokens,
      output_tokens: data.outputTokens,
      total_tokens: data.totalTokens,
      // Detailed token breakdown
      input_text_tokens: data.inputTextTokens,
      input_audio_tokens: data.inputAudioTokens,
      input_cached_tokens: data.inputCachedTokens,
      output_text_tokens: data.outputTextTokens,
      output_audio_tokens: data.outputAudioTokens
    })
  }

  // Token Usage Event - detailed tracking
  const logTokenUsage = data => {
    logEvent('tokens_used', {
      turn_number: data.turnNumber,
      context: data.context || 'response',
      // Summary
      input_tokens: data.inputTokens,
      output_tokens: data.outputTokens,
      total_tokens: data.totalTokens,
      // Input breakdown
      input_text_tokens: data.inputTextTokens,
      input_audio_tokens: data.inputAudioTokens,
      input_cached_tokens: data.inputCachedTokens,
      // Output breakdown
      output_text_tokens: data.outputTextTokens,
      output_audio_tokens: data.outputAudioTokens
    })
  }

  const logAIInterrupted = data => {
    logEvent('ai_interrupted', {
      reason: data.reason,
      turn_number: data.turnNumber
    })
  }

  // Tool Events
  const logToolCallRequested = data => {
    logEvent('tool_call_requested', {
      tool_name: data.toolName,
      args: data.args,
      call_id: data.callId
    })
  }

  const logToolCallCompleted = data => {
    logEvent('tool_call_completed', {
      tool_name: data.toolName,
      duration_ms: data.durationMs,
      success: data.success,
      call_id: data.callId
    })
  }

  const logToolCallError = data => {
    logEvent('tool_call_error', {
      tool_name: data.toolName,
      error: data.error,
      call_id: data.callId
    })
  }

  // Debug/Error Events - for extensive debugging
  const logDebugError = data => {
    logEvent('debug_error', {
      category: data.category, // 'webrtc', 'api', 'audio', 'tool', 'session'
      error: data.error,
      error_stack: data.errorStack,
      context: data.context,
      turn_number: data.turnNumber,
      // Include full session stats for debugging
      session_stats: { ...sessionTokenStats }
    })
  }

  const logOpenAIError = data => {
    logEvent('openai_error', {
      error_type: data.errorType,
      error_code: data.errorCode,
      error_message: data.errorMessage,
      turn_number: data.turnNumber,
      session_stats: { ...sessionTokenStats }
    })
  }

  // UI Events
  const logModalOpened = data => {
    logEvent('modal_opened', {
      trigger: data.trigger // 'nudge' or 'prompt'
    })
  }

  const logModalClosed = data => {
    logEvent('modal_closed', {
      duration_ms: data.durationMs,
      turns_count: data.turnsCount
    })
  }

  const logMediaDisplayed = data => {
    logEvent('media_displayed', {
      type: data.type, // 'images', 'videos', 'reviews'
      count: data.count
    })
  }

  // eslint-disable-next-line no-unused-vars
  const logBookingSlotSelected = data => {
    logEvent('booking_slot_selected', {
      date: data.date,
      time: data.time
    })
  }

  const logLocationSelected = data => {
    logEvent('location_selected', {
      location_name: data.locationName
    })
  }

  // ===================================================
  // TRIGGER UTILITIES (EMBEDDED)
  // ===================================================

  /**
   * Throttle utility - limits function calls to once per interval
   */
  window.SWIRL_THROTTLE = function(func, limit) {
    let inThrottle
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  }

  /**
   * Debounce utility - delays function call until after wait time
   */
  window.SWIRL_DEBOUNCE = function(func, delay) {
    let timeoutId
    return function(...args) {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => func.apply(this, args), delay)
    }
  }

  // ===================================================
  // PAGE-SPECIFIC TRIGGER SYSTEM
  // ===================================================

  /**
   * Load trigger file via script injection
   * Static URL from CONFIG.triggerJsUrl
   */
  async function loadPageTriggers() {
    try {
      // Inject trigger JS file
      const script = document.createElement('script')
      script.src = CONFIG.triggerJsUrl
      script.async = true

      script.onload = () => {
        console.log('[Swirl AI] ✅ Triggers loaded')

        // Initialize triggers (trigger JS will call window.SWIRL_INIT_TRIGGERS)
        if (window.SWIRL_INIT_TRIGGERS) {
          window.SWIRL_INIT_TRIGGERS({
            updatePrompt: updatePrompt
          })
        }
      }

      script.onerror = () => {
        console.log('[Swirl AI] ℹ️ Failed to load triggers')
      }

      document.head.appendChild(script)
    } catch (error) {
      console.log('[Swirl AI] ℹ️ Error loading triggers:', error.message)
    }
  }

  /**
   * Update prompt bubble
   * @param {string|null} promptText - Prompt text to show, or null to show default
   */
  let pendingNudgePrompt = null // The AI prompt to send, separate from the display text

  function updatePrompt(promptText, aiPrompt) {
    pendingNudgePrompt = aiPrompt || null // Store AI-specific prompt if provided
    const promptTextEl = document.getElementById('swirl-ai-prompt-text')
    const promptBubble = document.getElementById('swirl-ai-prompt-bubble')
    const promptContent = document.getElementById('swirl-ai-prompt-content')

    if (!promptTextEl || !promptBubble || !promptContent) return

    // Don't update if modal is open
    if (modalOpen) return

    // Use default text if promptText is null/undefined/empty
    const textToShow = promptText || CONFIG.defaultPromptText

    // Add thinking state
    promptBubble.classList.remove('visible')
    promptBubble.classList.add('thinking')

    // Update prompt text after thinking animation
    setTimeout(() => {
      promptTextEl.innerHTML = textToShow

      // Update multiline classes
      const isMultiline = textToShow.length > 30
      if (isMultiline) {
        promptContent.classList.add('multiline')
        promptBubble.classList.add('multiline')
        promptTextEl.classList.add('multiline')
      } else {
        promptContent.classList.remove('multiline')
        promptBubble.classList.remove('multiline')
        promptTextEl.classList.remove('multiline')
      }

      // Show with animation
      promptBubble.classList.remove('thinking')
      promptBubble.classList.add('visible')

      console.log('[Swirl AI] 💬 Prompt updated:', textToShow)
    }, CONFIG.thinkingAnimationDuration)
  }

  // ===================================================
  // UI CONSTRUCTION
  // ===================================================

  function buildFloatingNudge() {
    const container = document.createElement('div')
    container.className = 'swirl-ai-prompt-container'
    container.setAttribute('role', 'button')
    container.setAttribute('tabindex', '0')
    container.setAttribute('aria-label', 'Ask Lennox AI')

    container.innerHTML = `
      <!-- AI Icon Group with blur effect -->
      <div class="swirl-ai-prompt-icon-group">
        <div class="swirl-ai-prompt-icon-blur"></div>
        <div class="swirl-ai-prompt-icon">
          <img src="${CONFIG.iconGifPath}" alt="Lennox AI" />
        </div>
      </div>

      <!-- Prompt Bubble (overlaps icon) -->
      <div class="swirl-ai-prompt-bubble" id="swirl-ai-prompt-bubble">
        <div class="swirl-ai-prompt-content" id="swirl-ai-prompt-content">
          <span class="swirl-ai-prompt-text" id="swirl-ai-prompt-text">${CONFIG.defaultPromptText}</span>
          <div class="swirl-ai-prompt-arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(container)

    // Event listeners for opening the modal
    container.addEventListener('click', handlePromptClickWithAutoSend)
    container.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handlePromptClickWithAutoSend()
      }
    })

    console.log('[Swirl AI] ✅ Floating nudge injected')
  }

  function buildVoiceAgentModal() {
    const modal = document.createElement('div')
    modal.className = 'swirl-ai-voice-modal'
    modal.id = 'swirl-ai-voice-modal'

    modal.innerHTML = `
      <!-- Modal Header -->
      <div class="swirl-ai-voice-header">
        <!-- Menu Button (Left) -->
        <button class="swirl-ai-voice-menu-btn" aria-label="Menu" style="opacity: 0 !important;">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5H16M2 9H16M2 13.5H16" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Title (Center) -->
        <h1 class="swirl-ai-voice-title">Lennox AI</h1>

        <!-- Close/Down Button (Right) -->
        <button class="swirl-ai-voice-close-btn" id="swirl-ai-close-btn" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M19 9L12 16L5 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Test Mode Banner (only visible when ?test= in URL) -->
      ${
        isTestMode
          ? `
      <div class="swirl-ai-test-banner" id="swirl-ai-test-banner">
        <span class="swirl-ai-test-label">TEST</span>
        <input type="text" class="swirl-ai-test-input" id="swirl-ai-test-input" placeholder="Custom session ID (optional)" />
      </div>
      `
          : ''
      }

      <!-- Content Area (Chat Messages) -->
      <div class="swirl-ai-voice-content">
        <!-- Centered AI Icon (initially visible) -->
        <div class="swirl-ai-voice-icon-container" id="swirl-ai-voice-icon-container">
          <video
            id="swirl-ai-voice-video"
            class="swirl-ai-voice-icon-gif"
            autoplay
            loop
            muted
            playsinline
            alt="Lennox AI">
            <source src="${CONFIG.voiceVideoStates.default}" type="video/mp4">
          </video>
          <div class="swirl-ai-status-message" style="display: none;"></div>
        </div>

        <!-- Chat Messages Container -->
        <div class="swirl-ai-chat-messages" id="swirl-ai-chat-messages">
          <!-- Loading Overlay - Permanent, hidden by default -->
          <div class="swirl-ai-loading-overlay" id="swirl-ai-loading-overlay" style="display: none;">
            <div class="swirl-ai-loading-content">
              <svg class="swirl-ai-loading-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.66667 1.625C9.56413 1.625 10.2917 0.89746 10.2917 0H11.0417C11.0417 0.89746 11.7692 1.625 12.6667 1.625V2.375C11.7692 2.375 11.0417 3.10254 11.0417 4H10.2917C10.2917 3.10254 9.56413 2.375 8.66667 2.375V1.625ZM0 6C2.20914 6 4 4.20914 4 2H5.33333C5.33333 4.20914 7.1242 6 9.33333 6V7.33333C7.1242 7.33333 5.33333 9.1242 5.33333 11.3333H4C4 9.1242 2.20914 7.33333 0 7.33333V6ZM2.58401 6.66667C3.45811 7.15173 4.18162 7.8752 4.66667 8.74933C5.15171 7.8752 5.87522 7.15173 6.74933 6.66667C5.87522 6.1816 5.15171 5.45813 4.66667 4.58401C4.18162 5.45813 3.45811 6.1816 2.58401 6.66667ZM10.8333 8C10.8333 9.1966 9.86327 10.1667 8.66667 10.1667V11.1667C9.86327 11.1667 10.8333 12.1367 10.8333 13.3333H11.8333C11.8333 12.1367 12.8034 11.1667 14 11.1667V10.1667C12.8034 10.1667 11.8333 9.1966 11.8333 8H10.8333Z" fill="#D9D9D9"/>
                <path d="M8.66667 1.625C9.56413 1.625 10.2917 0.89746 10.2917 0H11.0417C11.0417 0.89746 11.7692 1.625 12.6667 1.625V2.375C11.7692 2.375 11.0417 3.10254 11.0417 4H10.2917C10.2917 3.10254 9.56413 2.375 8.66667 2.375V1.625ZM0 6C2.20914 6 4 4.20914 4 2H5.33333C5.33333 4.20914 7.1242 6 9.33333 6V7.33333C7.1242 7.33333 5.33333 9.1242 5.33333 11.3333H4C4 9.1242 2.20914 7.33333 0 7.33333V6ZM2.58401 6.66667C3.45811 7.15173 4.18162 7.8752 4.66667 8.74933C5.15171 7.8752 5.87522 7.15173 6.74933 6.66667C5.87522 6.1816 5.15171 5.45813 4.66667 4.58401C4.18162 5.45813 3.45811 6.1816 2.58401 6.66667ZM10.8333 8C10.8333 9.1966 9.86327 10.1667 8.66667 10.1667V11.1667C9.86327 11.1667 10.8333 12.1367 10.8333 13.3333H11.8333C11.8333 12.1367 12.8034 11.1667 14 11.1667V10.1667C12.8034 10.1667 11.8333 9.1966 11.8333 8H10.8333Z" fill="url(#paint0_linear_14299_21689)"/>
                <path d="M8.66667 1.625C9.56413 1.625 10.2917 0.89746 10.2917 0H11.0417C11.0417 0.89746 11.7692 1.625 12.6667 1.625V2.375C11.7692 2.375 11.0417 3.10254 11.0417 4H10.2917C10.2917 3.10254 9.56413 2.375 8.66667 2.375V1.625ZM0 6C2.20914 6 4 4.20914 4 2H5.33333C5.33333 4.20914 7.1242 6 9.33333 6V7.33333C7.1242 7.33333 5.33333 9.1242 5.33333 11.3333H4C4 9.1242 2.20914 7.33333 0 7.33333V6ZM2.58401 6.66667C3.45811 7.15173 4.18162 7.8752 4.66667 8.74933C5.15171 7.8752 5.87522 7.15173 6.74933 6.66667C5.87522 6.1816 5.15171 5.45813 4.66667 4.58401C4.18162 5.45813 3.45811 6.1816 2.58401 6.66667ZM10.8333 8C10.8333 9.1966 9.86327 10.1667 8.66667 10.1667V11.1667C9.86327 11.1667 10.8333 12.1367 10.8333 13.3333H11.8333C11.8333 12.1367 12.8034 11.1667 14 11.1667V10.1667C12.8034 10.1667 11.8333 9.1966 11.8333 8H10.8333Z" fill="url(#paint1_linear_14299_21689)"/>
                <path d="M8.66667 1.625C9.56413 1.625 10.2917 0.89746 10.2917 0H11.0417C11.0417 0.89746 11.7692 1.625 12.6667 1.625V2.375C11.7692 2.375 11.0417 3.10254 11.0417 4H10.2917C10.2917 3.10254 9.56413 2.375 8.66667 2.375V1.625ZM0 6C2.20914 6 4 4.20914 4 2H5.33333C5.33333 4.20914 7.1242 6 9.33333 6V7.33333C7.1242 7.33333 5.33333 9.1242 5.33333 11.3333H4C4 9.1242 2.20914 7.33333 0 7.33333V6ZM2.58401 6.66667C3.45811 7.15173 4.18162 7.8752 4.66667 8.74933C5.15171 7.8752 5.87522 7.15173 6.74933 6.66667C5.87522 6.1816 5.15171 5.45813 4.66667 4.58401C4.18162 5.45813 3.45811 6.1816 2.58401 6.66667ZM10.8333 8C10.8333 9.1966 9.86327 10.1667 8.66667 10.1667V11.1667C9.86327 11.1667 10.8333 12.1367 10.8333 13.3333H11.8333C11.8333 12.1367 12.8034 11.1667 14 11.1667V10.1667C12.8034 10.1667 11.8333 9.1966 11.8333 8H10.8333Z" fill="url(#paint2_linear_14299_21689)"/>
                <defs>
                <linearGradient id="paint0_linear_14299_21689" x1="7" y1="0" x2="7" y2="13.3333" gradientUnits="userSpaceOnUse">
                <stop stop-color="#2496DB"/>
                <stop offset="1" stop-color="#0FC6F9"/>
                </linearGradient>
                <linearGradient id="paint1_linear_14299_21689" x1="7" y1="0" x2="7" y2="13.3333" gradientUnits="userSpaceOnUse">
                <stop stop-color="#75DDF9"/>
                <stop offset="1" stop-color="#A170EC"/>
                </linearGradient>
                <linearGradient id="paint2_linear_14299_21689" x1="7" y1="0" x2="7" y2="13.3333" gradientUnits="userSpaceOnUse">
                <stop stop-color="#75DDF9"/>
                <stop offset="1" stop-color="#537CE3"/>
                </linearGradient>
                </defs>
              </svg>
              <p class="swirl-ai-loading-text" id="swirl-ai-loading-text"></p>
            </div>
          </div>
          <!-- AI responses will be added here -->
        </div>
      </div>

      <!-- Footer Container (User Prompt Text + Controls) -->
      <div class="swirl-ai-voice-footer-container">
        <!-- User Prompt Text (Toast Box Above Footer) - Only shows user's mic input -->
        <div class="swirl-ai-user-prompt-text" id="swirl-ai-user-prompt-text" style="display: none;"></div>

        <!-- Footer Controls (Message Icon + Voice Input + Mic Button) -->
        <div class="swirl-ai-voice-footer">
          <!-- Message Icon Button (Left) -->
          <button class="swirl-ai-voice-message-btn" aria-label="Type message" id="swirl-ai-message-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- Voice Input Container (Soundwave bars + Mic button together) -->
          <div class="swirl-ai-voice-input-container" id="swirl-ai-voice-input-container">
            <!-- Soundwave Bars (Animated during recording) -->
            <div class="swirl-ai-voice-soundwave-bars" id="swirl-ai-soundwave-bars">
              <div class="swirl-ai-voice-bar"></div>
              <div class="swirl-ai-voice-bar"></div>
              <div class="swirl-ai-voice-bar"></div>
              <div class="swirl-ai-voice-bar"></div>
              <div class="swirl-ai-voice-bar"></div>
            </div>

            <!-- Wave Animation (Visible ONLY when user is speaking - recognizing mode) -->
            <div class="swirl-ai-voice-wave-animation" id="swirl-ai-wave-animation" style="display: none;">
              <img src="https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/wave-animation.png" alt="Voice wave" />
            </div>

            <!-- Microphone Button -->
            <button class="swirl-ai-voice-mic-btn" id="swirl-ai-mic-btn" aria-label="Toggle microphone">
              <!-- Unmuted Icon (default) -->
              <svg class="swirl-ai-mic-icon-unmuted" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C10.34 2 9 3.34 9 5V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V5C15 3.34 13.66 2 12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 10V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 19V23" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 23H16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <!-- Muted Icon (with slash) -->
              <svg class="swirl-ai-mic-icon-muted" width="24" height="24" viewBox="0 0 24 24" fill="none" style="display: none;">
                <path d="M12 2C10.34 2 9 3.34 9 5V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V5C15 3.34 13.66 2 12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 10V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 19V23" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 23H16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Diagonal slash line -->
                <line x1="3" y1="3" x2="21" y2="21" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <!-- Text Input Container (Hidden by default, shown in text mode) -->
          <div class="swirl-ai-text-input-container" id="swirl-ai-text-input-container" style="display: none;">
            <input
              type="text"
              class="swirl-ai-text-input"
              id="swirl-ai-text-input"
              placeholder="Have questions? Ask here! 🤔"
              aria-label="Type message"
            />
            <button class="swirl-ai-text-send-btn" id="swirl-ai-text-send-btn" aria-label="Send message">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M18.3333 1.66667L9.16667 10.8333" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.3333 1.66667L12.5 18.3333L9.16667 10.8333L1.66667 7.5L18.3333 1.66667Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- Voice Toggle Button (Right side of footer, shown only in text mode) -->
          <button class="swirl-ai-voice-toggle-btn" id="swirl-ai-voice-toggle-btn" aria-label="Switch to voice mode" style="display: none;">
            <img src="https://nudge-voice-plugin.s3.ap-south-1.amazonaws.com/plugin/assets/voice-toggle-icon.svg" alt="Voice mode" />
          </button>
        </div>
        </div>
      </div>

      <!-- Connection Loader Screen -->
      <div class="swirl-ai-connection-loader" id="swirl-ai-connection-loader">
        <div class="swirl-ai-loader-header">
          <div></div>
          <span class="swirl-ai-loader-title">Lennox AI</span>
          <button class="swirl-ai-loader-close-btn" id="swirl-ai-loader-close-btn" aria-label="Minimise">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M19 9L12 16L5 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <video class="swirl-ai-loader-orb-img" autoplay loop muted playsinline>
          <source src="${CONFIG.voiceVideoStates.thinking}" type="video/mp4">
        </video>
        <div class="swirl-ai-loader-phrases" id="swirl-ai-loader-phrases">
          <p class="swirl-ai-loader-phrase active">Hold tight, getting things ready.</p>
          <p class="swirl-ai-loader-phrase">Ask me like you'd ask a human.</p>
          <p class="swirl-ai-loader-phrase">I'll help you find the right Lennox system.</p>
        </div>
        <a href="https://goswirl.ai" target="_blank" rel="noopener noreferrer" class="swirl-ai-powered-badge swirl-ai-powered-badge--loader" aria-label="Powered by Swirl AI">
          <span class="swirl-ai-powered-text">Powered by</span>
          <img src="${
            CONFIG.s3AssetsUrl
          }/swirl.png" class="swirl-ai-powered-icon" alt="Swirl AI" />
        </a>
      </div>
    `

    document.body.appendChild(modal)

    // Create YouTube Video Player Modal
    const videoModal = document.createElement('div')
    videoModal.id = 'swirl-ai-video-modal'
    videoModal.className = 'swirl-ai-video-modal'
    videoModal.style.display = 'none'
    videoModal.innerHTML = `
      <div class="swirl-ai-video-modal-backdrop"></div>
      <div class="swirl-ai-video-modal-container">
        <!-- Close Button -->
        <button class="swirl-ai-video-modal-close" id="swirl-ai-video-modal-close" aria-label="Close video">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <path d="M22.5 7.5L7.5 22.5M7.5 7.5L22.5 22.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <!-- Video Player Wrapper -->
        <div class="swirl-ai-video-player-wrapper">
          <!-- Swiper Container -->
          <div class="swirl-ai-video-swiper-container swiper">
            <div class="swiper-wrapper" id="swirl-ai-video-swiper-wrapper">
              <!-- Video slides will be dynamically added here -->
            </div>
          </div>

          <!-- Navigation Arrows -->
          <button class="swirl-ai-video-nav-prev" id="swirl-ai-video-nav-prev" aria-label="Previous video">
            <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
              <circle cx="22.5" cy="22.5" r="22.5" fill="rgba(0,0,0,0.5)"/>
              <path d="M25 15L17 22.5L25 30" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="swirl-ai-video-nav-next" id="swirl-ai-video-nav-next" aria-label="Next video">
            <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
              <circle cx="22.5" cy="22.5" r="22.5" fill="rgba(0,0,0,0.5)"/>
              <path d="M20 15L28 22.5L20 30" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- Round Thumbnail Pagination -->
        <div class="swirl-ai-video-pagination" id="swirl-ai-video-pagination">
          <!-- Thumbnails will be dynamically added here -->
        </div>
      </div>
    `

    document.body.appendChild(videoModal)

    // Create Image Viewer Modal
    const imageModal = document.createElement('div')
    imageModal.id = 'swirl-ai-image-modal'
    imageModal.className = 'swirl-ai-image-modal'
    imageModal.style.display = 'none'
    imageModal.innerHTML = `
      <div class="swirl-ai-image-modal-backdrop"></div>
      <div class="swirl-ai-image-modal-container">
        <!-- Close Button -->
        <button class="swirl-ai-image-modal-close" id="swirl-ai-image-modal-close" aria-label="Close image">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <path d="M22.5 7.5L7.5 22.5M7.5 7.5L22.5 22.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <!-- Image Viewer Wrapper -->
        <div class="swirl-ai-image-viewer-wrapper">
          <!-- Swiper Container -->
          <div class="swirl-ai-image-swiper-container swiper">
            <div class="swiper-wrapper" id="swirl-ai-image-swiper-wrapper">
              <!-- Image slides will be dynamically added here -->
            </div>
          </div>

          <!-- Navigation Arrows -->
          <button class="swirl-ai-image-nav-prev" id="swirl-ai-image-nav-prev" aria-label="Previous image">
            <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
              <circle cx="22.5" cy="22.5" r="22.5" fill="rgba(0,0,0,0.5)"/>
              <path d="M25 15L17 22.5L25 30" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="swirl-ai-image-nav-next" id="swirl-ai-image-nav-next" aria-label="Next image">
            <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
              <circle cx="22.5" cy="22.5" r="22.5" fill="rgba(0,0,0,0.5)"/>
              <path d="M20 15L28 22.5L20 30" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- Round Thumbnail Pagination -->
        <div class="swirl-ai-image-pagination" id="swirl-ai-image-pagination">
          <!-- Thumbnails will be dynamically added here -->
        </div>
      </div>
    `

    document.body.appendChild(imageModal)

    // Add event listeners
    const closeBtn = document.getElementById('swirl-ai-close-btn')
    const micBtn = document.getElementById('swirl-ai-mic-btn')

    closeBtn.addEventListener('click', closeModal)
    micBtn.addEventListener('click', toggleMicrophone)
    document
      .getElementById('swirl-ai-loader-close-btn')
      ?.addEventListener('click', closeModal)

    // Text/Voice mode toggle buttons
    const messageBtn = document.getElementById('swirl-ai-message-btn')
    const voiceToggleBtn = document.getElementById('swirl-ai-voice-toggle-btn')
    const textInput = document.getElementById('swirl-ai-text-input')
    const textSendBtn = document.getElementById('swirl-ai-text-send-btn')

    messageBtn.addEventListener('click', switchToTextMode)
    voiceToggleBtn.addEventListener('click', switchToVoiceMode)
    textSendBtn.addEventListener('click', handleTextMessageSend)
    textInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleTextMessageSend()
      }
    })

    // Video modal close button
    const videoModalCloseBtn = document.getElementById(
      'swirl-ai-video-modal-close'
    )
    videoModalCloseBtn.addEventListener('click', closeVideoModal)

    // Image modal close button
    const imageModalCloseBtn = document.getElementById(
      'swirl-ai-image-modal-close'
    )
    imageModalCloseBtn.addEventListener('click', closeImageModal)

    console.log('[Swirl AI] ✅ Voice Agent Modal built')
  }

  // ===================================================
  // PROMPT SHUFFLING
  // ===================================================

  // shufflePrompt() function removed - using simplified trigger system

  function showPromptWithAnimation() {
    const promptBubble = document.getElementById('swirl-ai-prompt-bubble')
    if (!promptBubble) return

    setTimeout(() => {
      promptBubble.classList.add('visible')
    }, CONFIG.initDelay)
  }

  // ===================================================
  // VIEWPORT-BASED SECTION DETECTION
  // ===================================================

  // eslint-disable-next-line no-unused-vars
  function initializeInteractionDetection() {
    console.log(
      '[Swirl AI] 🖱️ Interaction detection initialized (clicks, touches)'
    )

    // Detect clicks (desktop + mobile taps)
    document.addEventListener(
      'click',
      e => {
        // Skip if clicking on Swirl AI modal elements
        if (
          e.target.closest('#swirl-ai-modal') ||
          e.target.closest('#swirl-ai-fab')
        ) {
          return
        }

        // Debounce: wait 1000ms after last interaction (to allow swiper animation to complete)
        if (interactionDebounce) clearTimeout(interactionDebounce)
        interactionDebounce = setTimeout(() => {
          if (!modalOpen) {
            console.log(
              '[Swirl AI] 🖱️ Click interaction detected - waiting for animation to complete...'
            )
            const visibleSection = detectVisibleSection()

            if (visibleSection) {
              if (visibleSection !== activeSection) {
                console.log(
                  `[Swirl AI] 📍 Section changed via click: ${activeSection ||
                    'none'} → ${visibleSection}`
                )
              } else {
                console.log(
                  `[Swirl AI] 📍 Same section, but viewport content changed - re-scoring prompts`
                )
              }

              // Clear existing dwell timer
              if (sectionDwellTimer) {
                clearTimeout(sectionDwellTimer)
              }

              // Wait for dwell time before updating prompts
              // IMPORTANT: Always call handleSectionChange even if section didn't change
              // because viewport content might have changed (carousel slide, tabs, etc.)
              sectionDwellTimer = setTimeout(() => {
                handleSectionChange(visibleSection)
              }, CONFIG.sectionDwellTime)
            } else {
              console.log(
                '[Swirl AI] ℹ️ No visible section detected from click'
              )
            }
          }
        }, 1000)
      },
      true
    )

    // Detect mobile swipes (touchend = finger lifted)
    document.addEventListener(
      'touchend',
      e => {
        // Skip if touching Swirl AI modal elements
        if (
          e.target.closest('#swirl-ai-modal') ||
          e.target.closest('#swirl-ai-fab')
        ) {
          return
        }

        // Debounce: wait 1000ms after last interaction (to allow swiper animation to complete)
        if (interactionDebounce) clearTimeout(interactionDebounce)
        interactionDebounce = setTimeout(() => {
          if (!modalOpen) {
            console.log(
              '[Swirl AI] 👆 Touch interaction detected - waiting for animation to complete...'
            )
            const visibleSection = detectVisibleSection()

            if (visibleSection) {
              if (visibleSection !== activeSection) {
                console.log(
                  `[Swirl AI] 📍 Section changed via touch: ${activeSection ||
                    'none'} → ${visibleSection}`
                )
              } else {
                console.log(
                  `[Swirl AI] 📍 Same section, but viewport content changed - re-scoring prompts`
                )
              }

              // Clear existing dwell timer
              if (sectionDwellTimer) {
                clearTimeout(sectionDwellTimer)
              }

              // Wait for dwell time before updating prompts
              // IMPORTANT: Always call handleSectionChange even if section didn't change
              // because viewport content might have changed (carousel slide, tabs, etc.)
              sectionDwellTimer = setTimeout(() => {
                handleSectionChange(visibleSection)
              }, CONFIG.sectionDwellTime)
            } else {
              console.log(
                '[Swirl AI] ℹ️ No visible section detected from touch'
              )
            }
          }
        }, 1000)
      },
      { passive: true }
    )
  }

  // eslint-disable-next-line no-unused-vars
  function onScrollDebounced() {
    // Clear existing timer
    if (scrollStopTimer) {
      clearTimeout(scrollStopTimer)
    }

    // Wait for scroll to stop
    scrollStopTimer = setTimeout(() => {
      const visibleSection = detectVisibleSection()

      if (visibleSection && visibleSection !== activeSection) {
        console.log(
          `[Swirl AI] 📍 Section changed: ${activeSection ||
            'none'} → ${visibleSection}`
        )

        // Clear existing dwell timer
        if (sectionDwellTimer) {
          clearTimeout(sectionDwellTimer)
        }

        // Wait for dwell time before updating prompts
        sectionDwellTimer = setTimeout(() => {
          handleSectionChange(visibleSection)
        }, CONFIG.sectionDwellTime)
      }
    }, CONFIG.scrollStopDelay)
  }

  function detectVisibleSection() {
    // Get all text content visible in the viewport
    const viewportContent = extractViewportContent()

    if (!viewportContent) {
      console.log('[Swirl AI] ⚠️ No content found in viewport')
      return null
    }

    console.log(
      `[Swirl AI] 🔍 Analyzing viewport content (${viewportContent.length} chars)`
    )

    // Match content against section keywords
    const matchedSection = matchContentToSection(viewportContent)

    if (matchedSection) {
      console.log(`[Swirl AI] 🎯 Content matched to section: ${matchedSection}`)
    } else {
      console.log(
        '[Swirl AI] ℹ️ No section match found for current viewport content'
      )
    }

    return matchedSection
  }

  function extractViewportContent() {
    const viewportHeight = window.innerHeight
    const viewportTop = window.scrollY + CONFIG.skipTopPixels
    const viewportBottom =
      window.scrollY + viewportHeight - CONFIG.skipBottomPixels

    // Parse exclude selectors
    const excludeSelectors = CONFIG.excludeSelectors
      ? CONFIG.excludeSelectors.split(',').map(s => s.trim())
      : []

    // Get all text-containing elements
    const allElements = document.querySelectorAll('body *')
    let visibleText = ''

    allElements.forEach(element => {
      // Skip script, style, and our own plugin elements
      if (
        element.tagName === 'SCRIPT' ||
        element.tagName === 'STYLE' ||
        element.id?.includes('swirl-ai') ||
        element.classList?.contains('swirl-ai')
      ) {
        return
      }

      // Skip elements matching exclude selectors
      if (excludeSelectors.length > 0) {
        const shouldExclude = excludeSelectors.some(selector => {
          try {
            return element.matches(selector) || element.closest(selector)
          } catch (e) {
            return false
          }
        })
        if (shouldExclude) {
          return
        }
      }

      const rect = element.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY
      const elementBottom = elementTop + rect.height

      // Check if element is in viewport (both vertically AND horizontally visible)
      const isInViewportVertically =
        elementBottom > viewportTop && elementTop < viewportBottom

      // Horizontal visibility: element must be at least 70% visible (not just partially visible)
      const visibleLeft = Math.max(0, rect.left)
      const visibleRight = Math.min(window.innerWidth, rect.right)
      const visibleWidth = visibleRight - visibleLeft
      const elementWidth = rect.width
      const horizontalVisibilityPercent =
        elementWidth > 0 ? visibleWidth / elementWidth : 0
      const isInViewportHorizontally = horizontalVisibilityPercent >= 0.7 // At least 70% visible

      const isInViewport = isInViewportVertically && isInViewportHorizontally

      if (isInViewport) {
        // Get direct text content (not from children)
        const text = Array.from(element.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ')

        if (text) {
          visibleText += ' ' + text
        }
      }
    })

    // eslint-disable-next-line no-unused-vars
    const keywords = visibleText
      .toLowerCase()
      .trim()
      .split(' ')
      .slice(0, 10)
      .join(' ')
    console.log(`[Swirl AI] 📝 Viewport Keywords: "${visibleText}..."`)

    return visibleText.toLowerCase().trim()
  }

  function matchContentToSection(content) {
    if (!content || !sectionPrompts) return null

    const scores = {}

    // Score each section based on keyword matches
    // eslint-disable-next-line no-unused-vars
    for (const [sectionKey, config] of Object.entries(sectionPrompts)) {
      const keywords = config.keywords || []
      let score = 0

      keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase()

        // Count occurrences of keyword in content
        const regex = new RegExp(
          keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g'
        )
        const matches = (content.match(regex) || []).length

        if (matches > 0) {
          // Weight by priority
          const priorityMultiplier = config.priority === 'high' ? 2 : 1
          score += matches * priorityMultiplier
        }
      })

      if (score > 0) {
        scores[sectionKey] = score
      }
    }

    console.log('[Swirl AI] 📊 Section scores:', scores)

    // Return section with highest score
    if (Object.keys(scores).length > 0) {
      const bestMatch = Object.entries(scores).reduce((a, b) =>
        b[1] > a[1] ? b : a
      )
      return bestMatch[0].toUpperCase()
    }

    return null
  }

  function scoreAndSortPrompts(prompts, viewportContent) {
    // Extract viewport keywords (clean words, 2+ chars, no common words)
    const commonWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'from',
      'have',
      'are',
      'was',
      'will',
      'can',
      'want',
      'see',
      'how',
      'other',
      'more',
      'about',
      'what',
      'when',
      'where',
      'who',
      'why',
      'compare',
      'vs',
      'want'
    ])
    const viewportWords = viewportContent
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length >= 2 && !commonWords.has(w))

    console.log(
      `[Swirl AI] 🔑 Extracted viewport keywords: [${viewportWords
        .slice(0, 10)
        .join(', ')}]`
    )

    // Score each prompt based on keyword overlap with viewport
    const promptsWithScores = prompts.map(prompt => {
      let score = 0

      // Extract words from prompt text and trigger
      // Handle both string prompts and object prompts
      const promptText = (typeof prompt === 'string'
        ? prompt
        : prompt.text || ''
      ).toLowerCase()
      const trigger = (typeof prompt === 'object'
        ? prompt.trigger || ''
        : ''
      ).toLowerCase()

      // Extract base trigger word (remove suffixes like -interact, -mode, etc.)
      const baseTrigger = trigger.split('-')[0]

      // Count how many viewport keywords appear in the prompt or trigger
      viewportWords.forEach(keyword => {
        // Check prompt text
        if (promptText.includes(keyword)) {
          score += 10
        }

        // Check full trigger
        if (trigger.includes(keyword)) {
          score += 15 // Higher weight for trigger match
        }

        // Check base trigger (e.g., "v2l" from "v2l-interact")
        if (baseTrigger && baseTrigger === keyword) {
          score += 20 // Highest weight for exact base trigger match
        }

        // Partial match in trigger (e.g., "terrain" matches "terrain-interact")
        if (
          baseTrigger &&
          baseTrigger.includes(keyword) &&
          keyword.length >= 3
        ) {
          score += 15
        }
      })

      return { prompt, score }
    })

    // Sort by score (highest first)
    promptsWithScores.sort((a, b) => b.score - a.score)

    // Log scores for debugging
    const scoreLog = promptsWithScores
      .map(p => {
        const promptText =
          typeof p.prompt === 'string' ? p.prompt : p.prompt.text || ''
        return `"${promptText.substring(0, 40)}..." = ${p.score}`
      })
      .join(', ')
    console.log(`[Swirl AI] 🎯 Prompt scores: ${scoreLog}`)

    // Return sorted prompts (without scores)
    return promptsWithScores.map(p => p.prompt)
  }

  function handleSectionChange(newSection) {
    activeSection = newSection

    // Try to match section to prompts
    const matchedPrompts = matchSectionToPrompts(newSection)

    if (matchedPrompts && matchedPrompts.length > 0) {
      // Filter prompts by persona (default: PERFORMANCE)
      const currentPersona = 'PERFORMANCE' // Can be dynamic later
      const personaFiltered = matchedPrompts.filter(
        p => !p.persona || p.persona === currentPersona
      )

      // Use filtered prompts, fallback to all if none match
      let filteredPrompts =
        personaFiltered.length > 0 ? personaFiltered : matchedPrompts

      // ===== NEW: Score individual prompts based on viewport content =====
      // Always score if we have multiple prompts (even if just 2)
      if (filteredPrompts.length > 1) {
        console.log(
          '[Swirl AI] 🔍 Scoring prompts based on current viewport content...'
        )
        const viewportContent = extractViewportContent()
        filteredPrompts = scoreAndSortPrompts(filteredPrompts, viewportContent)
      } else {
        console.log('[Swirl AI] ℹ️ Only 1 prompt found, skipping scoring')
      }

      // Apply maxPromptsToShow limit (take only first N prompts after scoring)
      if (
        CONFIG.maxPromptsToShow > 0 &&
        filteredPrompts.length > CONFIG.maxPromptsToShow
      ) {
        filteredPrompts = filteredPrompts.slice(0, CONFIG.maxPromptsToShow)
      }

      currentPrompts = filteredPrompts
      currentPromptIndex = 0

      // Shuffle logic removed - using simplified trigger system

      // Update prompt with animation if modal is closed
      if (!modalOpen) {
        updatePromptWithThinkingAnimation()
      }
    } else {
      // No prompts found - show default text
      currentPrompts = [{ text: CONFIG.defaultPromptText }]
      currentPromptIndex = 0

      // Shuffle logic removed - using simplified trigger system

      // Update to default prompt
      if (!modalOpen) {
        updatePromptWithThinkingAnimation()
      }
    }
  }

  function matchSectionToPrompts(sectionName) {
    if (!sectionName || !sectionPrompts) return null

    // Direct match (case-insensitive)
    const directMatch = Object.keys(sectionPrompts).find(
      key => key.toUpperCase() === sectionName.toUpperCase()
    )

    if (directMatch) {
      return sectionPrompts[directMatch].prompts
    }

    // Keyword matching
    const sectionNameLower = sectionName.toLowerCase()

    // eslint-disable-next-line no-unused-vars
    for (const [key, config] of Object.entries(sectionPrompts)) {
      const keywords = config.keywords || []

      // Check if section name contains any keyword
      const keywordMatch = keywords.some(
        keyword =>
          sectionNameLower.includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(sectionNameLower)
      )

      if (keywordMatch) {
        return config.prompts
      }
    }

    return null
  }

  // shufflePromptsArray() function removed - using simplified trigger system

  function updatePromptWithThinkingAnimation() {
    const promptText = document.getElementById('swirl-ai-prompt-text')
    const promptBubble = document.getElementById('swirl-ai-prompt-bubble')
    const promptContent = document.getElementById('swirl-ai-prompt-content')

    if (!promptText || !promptBubble || !promptContent) return

    // Don't update if modal is open
    if (modalOpen) return

    // Add thinking state
    promptBubble.classList.remove('visible')
    promptBubble.classList.add('thinking')

    // Update prompt text after thinking animation
    setTimeout(() => {
      const newPrompt = currentPrompts[currentPromptIndex]
      const promptTextStr = newPrompt?.text || newPrompt || ''

      promptText.innerHTML = promptTextStr

      // Update multiline classes
      const isMultiline = promptTextStr.length > 30
      if (isMultiline) {
        promptContent.classList.add('multiline')
        promptBubble.classList.add('multiline')
        promptText.classList.add('multiline')
      } else {
        promptContent.classList.remove('multiline')
        promptBubble.classList.remove('multiline')
        promptText.classList.remove('multiline')
      }

      // Show with animation
      promptBubble.classList.remove('thinking')
      promptBubble.classList.add('visible')

      console.log('[Swirl AI] 💬 Prompt updated:', promptTextStr)
    }, CONFIG.thinkingAnimationDuration)
  }

  // ===================================================
  // OLD TRACKING FUNCTIONS REMOVED
  // Trigger logic disabled for Lennox (no trigger file configured)
  // (Removed: initializeCursorTracking, initializeScrollBackDetection,
  //  initializeButtonClickTracking, initializeCalculatorTracking,
  //  triggerEnhancedPrompt, getSectionFromElement, throttle, debounce)
  // ===================================================

  // ===================================================
  // PROMPT CLICK AUTO-SEND (INDEPENDENT MODULE)
  // ===================================================

  /**
   * FEATURE: Auto-send clicked prompt to AI chat
   *
   * TOGGLE: Set CONFIG.enablePromptAutoSend = false to disable
   * IMPACT: Zero - feature is completely independent
   */

  let pendingPromptToSend = null

  /**
   * Intercepts prompt click to capture text before modal opens
   * If feature is disabled, acts as passthrough to openModal()
   */
  function handlePromptClickWithAutoSend() {
    // Feature disabled? Just open modal normally
    if (!CONFIG.enablePromptAutoSend) {
      console.log(
        '[Swirl AI] Prompt auto-send disabled - opening modal normally'
      )
      openModal()
      return
    }

    // Feature enabled - capture prompt text (including default)
    const promptTextElement = document.getElementById('swirl-ai-prompt-text')
    const promptText = promptTextElement?.textContent?.trim()

    // Always send a real user prompt (no frontend-only intro turn).
    pendingPromptToSend =
      pendingNudgePrompt ||
      promptText ||
      'I want help choosing the right Lennox system for my home.'
    console.log(
      `[Swirl AI] 📌 Captured prompt for AI: "${pendingPromptToSend}"`
    )

    // Open modal as usual
    openModal()
  }

  /**
   * Checks for pending prompt and triggers AI greeting or sends nudge question
   * Called from handleDataChannelOpen()
   */
  function checkAndSendPendingPrompt() {
    // Feature disabled? Do nothing
    if (!CONFIG.enablePromptAutoSend) {
      return
    }

    // No pending prompt? Do nothing
    if (!pendingPromptToSend) {
      return
    }

    // Wait for session to stabilize
    setTimeout(() => {
      if (!pendingPromptToSend) return

      console.log(
        `[Swirl AI] 📤 Sending prompt as user question: "${pendingPromptToSend}"`
      )
      resetNudge4Flow()
      sendNudgeAsUserQuestion(pendingPromptToSend)

      pendingPromptToSend = null // Clear after triggering

      // Safety fallback: if turn detection + mic are still not re-enabled after 30s,
      // force-enable them. Prevents permanent lockout if greeting flow fails silently.
      setTimeout(() => {
        if (isAIGreeting) {
          console.warn(
            '[Swirl AI] ⚠️ Safety fallback: greeting flag still set after 30s — forcing mic unmute + turn detection'
          )
          isAIGreeting = false
          unmuteMicrophone()
          enableTurnDetectionSafely()
        }
      }, 30000)
    }, 500)
  }

  /**
   * Sends the nudge text as a user question and triggers AI to answer
   * This maintains the UX flow: user question at bottom, AI answer above
   */
  function sendNudgeAsUserQuestion(questionText) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(
        '[Swirl AI] ❌ Cannot send nudge question - DataChannel not ready'
      )
      return
    }

    try {
      // Mark as a new turn so clearOnFirstEvent() fires and clears the loading overlay
      handleNewUserQuestion()

      // Set greeting flag so response.done handler re-enables turn detection and unmutes mic
      isAIGreeting = true

      // Mute microphone to prevent feedback loop (mic picking up AI audio)
      muteMicrophone()

      // In text mode, ensure remote audio is muted to prevent audio playback
      if (currentInputMode === 'text' && remoteAudioEl) {
        remoteAudioEl.muted = true
        console.log('[Swirl AI] 🔇 Remote audio muted for nudge in text mode')
      }

      // Show the nudge question as user's message in the chat UI
      // Voice mode: centered toast, Text mode: right-aligned in chat
      if (currentInputMode === 'voice') {
        showUserTranscript(questionText)
      } else {
        appendUserMessageInChat(questionText)
      }

      // Show loading status
      showLoadingStatus()

      // Let Realtime model handle the nudge directly via tool calling.
      const userMessage = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: questionText
            }
          ]
        }
      }
      dataChannel.send(JSON.stringify(userMessage))
      dataChannel.send(JSON.stringify({ type: 'response.create' }))

      console.log(
        '[Swirl AI] ✅ Nudge question sent directly to Realtime model'
      )
    } catch (error) {
      console.error('[Swirl AI] ❌ Error sending nudge question:', error)
    }
  }

  function renderSelectionSupportCards(uiComponents = []) {
    const qualification = uiComponents.find(
      c => c?.type === 'qualification_cards'
    )
    if (
      qualification &&
      Array.isArray(qualification.options) &&
      qualification.options.length > 0
    ) {
      // Skip rendering qualification cards if home info is already complete
      if (backendHomeInfoComplete) {
        console.log(
          '[Swirl AI] Skipping qualification card — home info already complete'
        )
        return
      }
      // Skip if the field being asked is already set in backendHomeInfo
      const field = qualification.field
      if (field && backendHomeInfo && backendHomeInfo[field]) {
        console.log(
          `[Swirl AI] Skipping qualification card for '${field}' — already set to '${backendHomeInfo[field]}'`
        )
        return
      }
      const messagesContainer = document.querySelector(
        '.swirl-ai-chat-messages'
      )
      if (!messagesContainer) return

      // Remove ALL old qualification cards (clean slate for each step)
      const step = qualification.step || 0
      messagesContainer
        .querySelectorAll('.swirl-ai-selection-support')
        .forEach(node => {
          const nodeStep = Number(node.getAttribute('data-step') || 0)
          // Remove all cards from previous steps (always clean up)
          if (nodeStep <= step) {
            node.remove()
          }
        })

      const card = document.createElement('div')
      card.className = 'swirl-ai-response-container swirl-ai-selection-support'
      card.setAttribute('data-field', qualification.field || '')
      card.setAttribute('data-step', String(step))

      const layout = qualification.layout || 'icon_row'
      const titleMap = {
        mode: 'What Are You Looking For?',
        location: 'Where Will This Unit Be Installed?',
        size: 'How Big Is The Space?'
      }
      const title =
        titleMap[qualification.field] ||
        (qualification.field
          ? `Choose ${qualification.field}`
          : 'Choose an option')

      if (layout === 'icon_row') {
        const optionGrid = qualification.options
          .map((opt, idx) => {
            const optionId = opt.value || opt.id || ''
            const icon = HOME_QUALIFIER_ICONS[optionId] || ''
            return `
            <div class="swirl-qa-option-card swirl-qa-option-card--icon" data-qa-index="${idx}" data-qa-value="${optionId}">
              <div class="swirl-qa-option-icon">${icon}</div>
              <div class="swirl-qa-option-label">${opt.label || optionId}</div>
              <div class="swirl-qa-option-radio"></div>
            </div>
          `
          })
          .join('')

        card.innerHTML = `
          <div class="swirl-qa-card-shell swirl-qa-card-shell--icon">
            <div class="swirl-qa-title">${title}</div>
            <div class="swirl-qa-options-grid">
              ${optionGrid}
            </div>
          </div>
        `

        // Attach click handlers to each option card
        messagesContainer.appendChild(card)
        const optionCards = card.querySelectorAll('.swirl-qa-option-card')
        optionCards.forEach((optCard, idx) => {
          optCard.addEventListener('click', () => {
            const value = optCard.getAttribute('data-qa-value')
            handleQualificationCardClick(
              qualification.field,
              value,
              qualification.options[idx]
            )
          })
        })
      } else if (layout === 'icon_list') {
        const iconListRows = qualification.options
          .map((opt, idx) => {
            const optionId = opt.value || opt.id || ''
            const icon = HOME_QUALIFIER_ICONS[optionId] || ''
            return `
            <div class="swirl-qa-option-card swirl-qa-option-card--icon-list" data-qa-index="${idx}" data-qa-value="${optionId}">
              ${
                icon ? `<div class="swirl-qa-icon-list-icon">${icon}</div>` : ''
              }
              <div class="swirl-qa-icon-list-label">${opt.label ||
                optionId}</div>
            </div>
          `
          })
          .join('')

        card.innerHTML = `
          <div class="swirl-qa-card-shell swirl-qa-card-shell--icon-list">
            <div class="swirl-qa-options-list">
              ${iconListRows}
            </div>
          </div>
        `

        messagesContainer.appendChild(card)
        const iconListCards = card.querySelectorAll('.swirl-qa-option-card')
        iconListCards.forEach((optCard, idx) => {
          optCard.addEventListener('click', () => {
            const value = optCard.getAttribute('data-qa-value')
            handleQualificationCardClick(
              qualification.field,
              value,
              qualification.options[idx]
            )
          })
        })
      } else {
        const stackedRows = qualification.options
          .map(
            (opt, idx) => `
          <div class="swirl-qa-option-card swirl-qa-option-card--stacked" data-qa-index="${idx}" data-qa-value="${opt.value ||
              opt.id ||
              ''}">
            <div class="swirl-qa-radio-circle"></div>
            <div class="swirl-qa-radio-label">${opt.label ||
              opt.value ||
              ''}</div>
          </div>
        `
          )
          .join('')

        card.innerHTML = `
          <div class="swirl-qa-card-shell swirl-qa-card-shell--stacked">
            <div class="swirl-qa-title">${title}</div>
            <div class="swirl-qa-options-list">
              ${stackedRows}
            </div>
          </div>
        `

        // Attach click handlers to each option card
        messagesContainer.appendChild(card)
        const optionCards = card.querySelectorAll('.swirl-qa-option-card')
        optionCards.forEach((optCard, idx) => {
          optCard.addEventListener('click', () => {
            const value = optCard.getAttribute('data-qa-value')
            handleQualificationCardClick(
              qualification.field,
              value,
              qualification.options[idx]
            )
          })
        })
      }

      messagesContainer.scrollTop = messagesContainer.scrollHeight
      return
    }

    const selection = uiComponents.find(c => c?.type === 'selection_cards')
    if (
      !selection ||
      !Array.isArray(selection.options) ||
      selection.options.length === 0
    )
      return

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const existing = messagesContainer.querySelector(
      `.swirl-ai-selection-support[data-field="${selection.field || ''}"]`
    )
    if (existing) existing.remove()

    const card = document.createElement('div')
    card.className = 'swirl-ai-response-container swirl-ai-selection-support'
    card.setAttribute('data-field', selection.field || '')
    card.innerHTML = `
      <div style="background:#f8f8fa;border:1px solid #ececf0;border-radius:12px;padding:10px 12px;margin-top:6px;">
        <div style="font-size:11px;color:#6e6e73;font-weight:600;margin-bottom:8px;">${
          selection.field ? `Options (${selection.field})` : 'Options'
        }</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${selection.options
            .map(
              opt =>
                `<span style="padding:5px 10px;border-radius:999px;background:#fff;border:1px solid #dcdce2;font-size:12px;color:#1d1d1f;">${opt}</span>`
            )
            .join('')}
        </div>
      </div>
    `
    messagesContainer.appendChild(card)
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  function applyBackendTurnUiComponents(uiComponents = []) {
    if (!Array.isArray(uiComponents) || uiComponents.length === 0) return

    renderSelectionSupportCards(uiComponents)

    // eslint-disable-next-line no-unused-vars
    for (const component of uiComponents) {
      if (!component || typeof component !== 'object') continue

      if (
        component.type === 'product_cards' &&
        Array.isArray(component.cards) &&
        component.cards.length > 0
      ) {
        pendingProductCards = component.cards
        continue
      }

      if (component.type === 'journey_media') {
        const mediaPayload = {
          ...(Array.isArray(component.youtube_references) &&
            component.youtube_references.length > 0 && {
              youtube_references: component.youtube_references
            }),
          ...(Array.isArray(component.reviews) &&
            component.reviews.length > 0 && {
              reviews: component.reviews
            }),
          ...(Array.isArray(component.images) &&
            component.images.length > 0 && {
              images: component.images
            })
        }

        if (Object.keys(mediaPayload).length > 0) {
          pendingMediaEnrichment = {
            ...pendingMediaEnrichment,
            ...mediaPayload,
            has_media: true
          }
        }
        continue
      }

      if (component.type === 'booking_slots') {
        pendingBookingSlotsTriggerFromTurn = true
        continue
      }

      if (
        component.type === 'competitor_comparison' &&
        component.lennox_card &&
        component.competitor_card
      ) {
        displayCompetitorComparisonCard(
          component.lennox_card,
          component.competitor_card
        )
      }
    }
  }

  // Mutes the microphone to prevent feedback during AI greeting/response
  // This is critical to prevent the infinite loop where mic picks up AI audio
  function muteMicrophone() {
    if (!localStream) return

    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = false
      console.log('[Swirl AI] 🔇 Microphone muted for greeting')
    }
  }

  // Unmutes the microphone after AI greeting/response is complete
  function unmuteMicrophone() {
    if (!localStream) return

    // Don't unmute if user had manually muted
    if (userMutedMic) {
      console.log('[Swirl AI] 🔇 Mic stays muted (user preference)')
      return
    }

    // Don't unmute if in text mode
    if (currentInputMode === 'text') {
      console.log('[Swirl AI] 🔇 Mic stays muted (text mode)')
      return
    }

    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = true
      console.log('[Swirl AI] 🔊 Microphone unmuted')
    }
  }

  // Waits for actual silence on the remote audio stream (AI's output)
  // This detects when AI actually stops speaking, not just when generation completes
  function waitForRemoteAudioSilence(callback) {
    let silenceCount = 0
    const requiredSilenceFrames = 20 // ~0.66 seconds of silence at 30fps
    let checkCount = 0
    const maxChecks = 600 // Max ~20 seconds of waiting

    const checkAudioLevel = () => {
      checkCount++

      // Safety timeout
      if (checkCount >= maxChecks) {
        console.log('[Swirl AI] ⏱️ Audio wait timeout, proceeding anyway')
        callback()
        return
      }

      // Check remote audio analyzer (AI's output)
      if (remoteAudioAnalyser) {
        const dataArray = new Uint8Array(remoteAudioAnalyser.frequencyBinCount)
        remoteAudioAnalyser.getByteFrequencyData(dataArray)

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

        if (average < 3) {
          // Very quiet - count as silence
          silenceCount++
          if (silenceCount >= requiredSilenceFrames) {
            console.log(
              '[Swirl AI] 🔇 Remote audio silence detected, AI finished speaking'
            )
            callback()
            return
          }
        } else {
          // Reset silence counter if audio detected
          silenceCount = 0
        }
      } else {
        // No analyzer available, use fallback delay
        console.log('[Swirl AI] ⚠️ No remote analyzer, using fallback delay')
        setTimeout(callback, 3000)
        return
      }

      // Check again in ~33ms (30fps)
      setTimeout(checkAudioLevel, 33)
    }

    // Start checking after response.done (generation complete, audio still streaming)
    setTimeout(checkAudioLevel, 100)
  }

  // Safely re-enables turn detection after greeting/nudge response
  // Checks connection state before sending
  function enableTurnDetectionSafely() {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(
        '[Swirl AI] ⚠️ Cannot re-enable turn detection - DataChannel not ready'
      )
      return
    }

    const enableTurnDetection = {
      type: 'session.update',
      session: {
        turn_detection: {
          ...sessionConfig.turn_detection,
          create_response: true
        }
      }
    }
    dataChannel.send(JSON.stringify(enableTurnDetection))
    console.log(`[Swirl AI] 🔊 Turn detection updated (create_response=true)`)
  }

  /**
   * Triggers the AI to speak a greeting message
   * Uses response.create with instructions override - no fake user message needed
   * Note: Turn detection is already disabled in handleDataChannelOpen when greeting is pending
   */
  // eslint-disable-next-line no-unused-vars
  function triggerAIGreeting(greetingText) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(
        '[Swirl AI] ❌ Cannot trigger greeting - DataChannel not ready'
      )
      return
    }

    console.log(`[Swirl AI] 📤 Triggering AI greeting: "${greetingText}"`)

    try {
      // Set greeting flag - turn detection will be re-enabled after response.done
      isAIGreeting = true

      // Mute microphone to prevent feedback loop (mic picking up AI audio)
      muteMicrophone()

      // In text mode, ensure remote audio is muted to prevent audio playback
      if (currentInputMode === 'text' && remoteAudioEl) {
        remoteAudioEl.muted = true
        console.log(
          '[Swirl AI] 🔇 Remote audio muted for greeting in text mode'
        )
      }

      if (greetingText === '__LENNOX_INTRO__') {
        // Step 1: AI speaks intro line only (tool_choice none — cannot call tools or improvise structure)
        isAIGreeting = true
        pendingLennoxIntroQuestion = true
        handleNewUserQuestion()
        muteMicrophone()
        showLoadingStatus()
        dataChannel.send(
          JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text', 'audio'],
              tool_choice: 'none',
              instructions:
                'Say only this, word for word: "Lennox has been making premium AC systems for over a century, built for efficiency, quiet operation, and long-term reliability. Here are the two models we have for you." Stop immediately after. No questions, no tools.'
            }
          })
        )
        // Step 2: fetch and render product cards directly from backend — no AI involvement
        fetch(CONFIG.toolsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: 'show_products',
            tool_args: { model_ids: ['xc21', 'el16xc1'] },
            call_id: 'nudge_intro_products_' + Date.now(),
            session_token: sessionToken
          })
        })
          .then(r => r.json())
          .then(data => {
            if (data?.result?.cards?.length > 0)
              displayLennoxProductCards(data.result.cards)
          })
          .catch(e =>
            console.error('[Swirl AI] Failed to load intro product cards:', e)
          )
      } else {
        const responseCreate = {
          type: 'response.create',
          response: {
            instructions: `Say exactly this greeting to start the conversation: "${greetingText}". Be natural and friendly. Do not add anything else or ask follow-up questions - just deliver this greeting.`
          }
        }
        dataChannel.send(JSON.stringify(responseCreate))
      }

      console.log('[Swirl AI] ✅ AI greeting triggered successfully')
    } catch (error) {
      console.error('[Swirl AI] ❌ Error triggering AI greeting:', error)
    }
  }

  /**
   * Sends a text message to AI via WebRTC DataChannel
   * Independent function that can be called from anywhere
   */
  function sendTextMessageToAI(messageText) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error('[Swirl AI] ❌ Cannot send text - DataChannel not ready')
      return false
    }

    if (!messageText || messageText.trim() === '') {
      console.error('[Swirl AI] ❌ Cannot send empty message')
      return false
    }

    console.log(`[Swirl AI] 📤 Sending text message: "${messageText}"`)
    detectAndSaveZip(messageText)

    try {
      // Mark as new conversation turn
      handleNewUserQuestion()

      // Show user message in chat (only in voice mode - text mode already appended it)
      if (currentInputMode === 'voice') {
        showUserTranscript(messageText)
      }

      // Show loading status with random phrase
      showLoadingStatus()

      const textMessage = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: messageText
            }
          ]
        }
      }

      dataChannel.send(JSON.stringify(textMessage))
      dataChannel.send(JSON.stringify({ type: 'response.create' }))
      console.log(
        '[Swirl AI] ✅ Text message sent to Realtime model (tool-calling mode)'
      )
      return true
    } catch (error) {
      console.error('[Swirl AI] ❌ Error sending text message:', error)
      return false
    }
  }

  /**
   * Alias for sendTextMessageToAI - used by card click handlers
   */
  function sendGenericUserMessage(messageText) {
    return sendTextMessageToAI(messageText)
  }

  /**
   * Triggers the AI to speak unprompted — no fake user message.
   * Uses response.create with a per-response instruction so the AI speaks
   * in its own voice with full context, without polluting conversation history.
   */
  function triggerAISpeak(instruction) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(
        '[triggerAISpeak] DataChannel not open — state:',
        dataChannel?.readyState
      )
      return
    }
    // Cancel any in-flight response before starting a new one.
    // Without this, response.create sent while the model is still generating
    // gets dropped silently — leaving the loading overlay stuck forever.
    dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
    setTimeout(() => {
      if (!dataChannel || dataChannel.readyState !== 'open') return
      // Guard: if the user has started speaking or the AI is already mid-response
      // from a real user turn, abort. A stale delayed triggerAISpeak firing here
      // would inject a decontextualised response.create that causes the AI to
      // hallucinate a recovery/error message (e.g. "looks like we hit a snag").
      if (isListening || isAISpeaking) {
        console.warn(
          '[triggerAISpeak] Suppressed — user is speaking or AI is already responding'
        )
        return
      }
      dataChannel.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: instruction,
            tool_choice: 'none'
          }
        })
      )
    }, 80)
  }

  /**
   * Handles qualification card click (mode, location, size)
   * Sends selection to AI and marks card as selected
   */
  function handleQualificationCardClick(field, value, option) {
    console.log('[Swirl AI] 📋 Qualification card clicked:', field, '=', value)

    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error('[Swirl AI] ❌ Cannot send - DataChannel not ready')
      return
    }

    // Build selection message
    const fieldLabel =
      field === 'mode'
        ? 'comfort need'
        : field === 'location'
        ? 'location'
        : field === 'size'
        ? 'size'
        : field
    const optionLabel = option?.label || value
    const selectionMessage = `I select ${optionLabel} for my ${fieldLabel}`

    // Stop current AI speech if speaking
    const wasAISpeaking = isAISpeaking
    if (isAISpeaking) {
      console.log('[Swirl AI] 🛑 Qualification card: Interrupting AI speech')
      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (error) {
        console.warn('[Swirl AI] ⚠️ Cancel request failed:', error)
      }
      isAISpeaking = false
    }

    // Send selection message
    if (wasAISpeaking) {
      pendingMessageAfterCancel = selectionMessage
      console.log(
        '[Swirl AI] ⏳ Qualification selection queued - will send after' +
          ' cancellation'
      )
    } else {
      console.log('[Swirl AI] ✅ Sending qualification selection immediately')
      sendGenericUserMessage(selectionMessage)
    }

    // Visual feedback: highlight selected card
    const container = document.querySelector(
      '.swirl-ai-selection-support[data-field="' + field + '"]'
    )
    if (container) {
      const cards = container.querySelectorAll('.swirl-qa-option-card')
      cards.forEach(card => {
        const cardValue = card.getAttribute('data-qa-value')
        if (cardValue === value) {
          card.style.background =
            'linear-gradient(160deg, rgba(58, 155, 255, 0.65) 0%,' +
            ' rgba(38, 115, 215, 0.65) 100%)'
          card.style.borderColor = 'rgba(136, 200, 255, 0.6)'
          card.style.boxShadow =
            '0 8px 20px rgba(58, 155, 255, 0.3),' +
            ' inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        } else {
          card.style.opacity = '0.6'
        }
      })
    }
  }

  /**
   * Clears any pending prompt (called on modal close)
   */
  function clearPendingPrompt() {
    if (pendingPromptToSend) {
      console.log('[Swirl AI] 🧹 Clearing pending prompt')
      pendingPromptToSend = null
    }
  }

  // ===================================================
  // CONNECTION LOADER
  // ===================================================

  let loaderTextTimer = null
  let currentLoaderPhraseIndex = 0

  const showConnectionLoader = () => {
    const loader = document.getElementById('swirl-ai-connection-loader')
    if (!loader) return
    if (isConnected) return
    console.log('[Swirl AI] 🔄 Showing connection loader')

    if (loaderTextTimer) {
      clearInterval(loaderTextTimer)
      loaderTextTimer = null
    }

    const orbImg = loader.querySelector('.swirl-ai-loader-orb-img')
    if (orbImg) {
      orbImg.style.transition = 'none'
      orbImg.style.transform = ''
      void orbImg.offsetHeight
      orbImg.style.transition = ''
    }

    currentLoaderPhraseIndex = 0
    setLoaderPhraseIndex(0, false)
    loader.classList.remove('hiding')
    loader.classList.add('visible')

    const phraseCount =
      document.querySelectorAll(
        '#swirl-ai-loader-phrases .swirl-ai-loader-phrase'
      ).length || 1
    loaderTextTimer = setInterval(() => {
      currentLoaderPhraseIndex = (currentLoaderPhraseIndex + 1) % phraseCount
      setLoaderPhraseIndex(currentLoaderPhraseIndex, true)
    }, 2800)
  }

  const setLoaderPhraseIndex = (index, animate) => {
    const phrases = document.querySelectorAll(
      '#swirl-ai-loader-phrases .swirl-ai-loader-phrase'
    )
    if (!phrases.length) return

    if (!animate) {
      phrases.forEach(p => {
        p.style.transition = 'none'
      })
    }

    phrases.forEach((p, i) => p.classList.toggle('active', i === index))

    if (!animate) {
      phrases[0]?.offsetHeight
      phrases.forEach(p => {
        p.style.transition = ''
      })
    }
  }

  const hideConnectionLoader = () => {
    const loader = document.getElementById('swirl-ai-connection-loader')
    if (!loader) return
    console.log('[Swirl AI] ✅ Hiding connection loader')

    if (loaderTextTimer) {
      clearInterval(loaderTextTimer)
      loaderTextTimer = null
    }

    loader.classList.remove('visible')
    loader.classList.add('hiding')
  }

  // ===================================================
  // MODAL OPENING & CLOSING
  // ===================================================

  function setModalDynamicHeight() {
    const modal = document.getElementById('swirl-ai-voice-modal')
    if (!modal) return

    // Set explicit height to handle mobile browser URL bar
    const vh = window.innerHeight
    modal.style.height = `${vh}px`
  }

  // Track modal open time for duration calculation
  let modalOpenTime = null

  function openModal() {
    console.log('[Swirl AI] 🎤 Opening Voice Agent Modal...')
    modalOpen = true
    modalOpenTime = Date.now()
    // PostHog: Log modal opened
    logModalOpened({ trigger: pendingPromptToSend ? 'prompt' : 'nudge' })

    let modal = document.getElementById('swirl-ai-voice-modal')

    // Build modal if it doesn't exist
    if (!modal) {
      buildVoiceAgentModal()
      modal = document.getElementById('swirl-ai-voice-modal')
    }

    // Save scroll position and disable body scroll
    scrollPosition = window.scrollY
    document.body.classList.add('swirl-ai-modal-open')

    // Set dynamic height for mobile browsers
    setModalDynamicHeight()

    // Show modal with animation
    modal.classList.add('active', 'opening')
    modal.classList.remove('closing')

    // Ensure bars are visible by default (remove recognizing class if it exists)
    const voiceInputContainer = document.getElementById(
      'swirl-ai-voice-input-container'
    )
    if (voiceInputContainer) {
      // Ensure correct mode UI is displayed (default: voice mode)
      const textContainer = document.getElementById(
        'swirl-ai-text-input-container'
      )
      const messageBtn = document.getElementById('swirl-ai-message-btn')
      const voiceToggleBtn = document.getElementById(
        'swirl-ai-voice-toggle-btn'
      )
      const voiceIconContainer = document.getElementById(
        'swirl-ai-voice-icon-container'
      )

      if (currentInputMode === 'voice') {
        if (voiceInputContainer) voiceInputContainer.style.display = 'flex'
        if (textContainer) textContainer.style.display = 'none'
        if (messageBtn) messageBtn.style.display = 'flex'
        if (voiceToggleBtn) voiceToggleBtn.style.display = 'none'
        if (voiceIconContainer) voiceIconContainer.style.display = 'flex'
      } else {
        if (voiceInputContainer) voiceInputContainer.style.display = 'none'
        if (textContainer) textContainer.style.display = 'flex'
        if (messageBtn) messageBtn.style.display = 'none'
        if (voiceToggleBtn) voiceToggleBtn.style.display = 'flex'
        if (voiceIconContainer) voiceIconContainer.style.display = 'none'
      }
      voiceInputContainer.classList.remove('recognizing')
    }

    // Shuffle logic removed - using simplified trigger system

    // Disable text input and send button until connection is ready
    const textInput = document.getElementById('swirl-ai-text-input')
    const textSendBtn = document.getElementById('swirl-ai-text-send-btn')
    if (textInput) {
      textInput.disabled = true
      textInput.placeholder = 'Connecting...'
    }
    if (textSendBtn) {
      textSendBtn.disabled = true
      textSendBtn.style.opacity = '0.5'
      textSendBtn.style.cursor = 'not-allowed'
    }

    // Show connecting status
    updateStatusMessage('Connecting...')

    // Set video to default state on modal open
    setVoiceVideoState('default')

    // Show connection loader while WebRTC connects
    showConnectionLoader()

    // Connect WebRTC when modal opens
    connectWebRTC()

    console.log('[Swirl AI] ✅ Modal opened (WebRTC connecting...)')
  }
  // ===================================================
  // TEXT/VOICE MODE SWITCHING
  // ===================================================

  function switchToTextMode() {
    console.log('[Swirl AI] Switching to text mode')
    currentInputMode = 'text'

    // Hide voice input container, show text input container
    const voiceContainer = document.getElementById(
      'swirl-ai-voice-input-container'
    )
    const textContainer = document.getElementById(
      'swirl-ai-text-input-container'
    )
    const messageBtn = document.getElementById('swirl-ai-message-btn')
    const voiceToggleBtn = document.getElementById('swirl-ai-voice-toggle-btn')
    const voiceIconContainer = document.getElementById(
      'swirl-ai-voice-icon-container'
    )

    if (voiceContainer) voiceContainer.style.display = 'none'
    if (textContainer) textContainer.style.display = 'flex'
    if (messageBtn) messageBtn.style.display = 'none'
    if (voiceToggleBtn) voiceToggleBtn.style.display = 'flex'
    if (voiceIconContainer) voiceIconContainer.style.display = 'none'

    // Mute microphone in text mode - directly disable without affecting userMutedMic flag
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack && audioTrack.enabled) {
        audioTrack.enabled = false
        console.log('[Swirl AI] Microphone muted for text mode')

        // Update UI to show muted state
        const micBtn = document.querySelector('.swirl-ai-voice-mic-btn')
        const unmutedIcon = document.querySelector('.swirl-ai-mic-icon-unmuted')
        const mutedIcon = document.querySelector('.swirl-ai-mic-icon-muted')
        if (micBtn && unmutedIcon && mutedIcon) {
          micBtn.classList.add('muted')
          micBtn.classList.remove('active')
          unmutedIcon.style.display = 'none'
          mutedIcon.style.display = 'block'
        }
      }
    }

    // Focus on text input
    const textInput = document.getElementById('swirl-ai-text-input')
    if (textInput) {
      setTimeout(() => textInput.focus(), 100)
    }

    console.log('[Swirl AI] Text mode activated')
  }

  async function switchToVoiceMode() {
    console.log('[Swirl AI] Switching to voice mode')

    // Check if user has real microphone permission
    if (!hasRealMicrophone) {
      console.log('[Swirl AI] ⚠️ No microphone permission - requesting access')
      // updateStatusMessage('Requesting microphone permission...')

      // Request microphone permission again
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true }
          }
        })

        console.log('[Swirl AI] ✅ Microphone permission granted!')
        hasRealMicrophone = true

        // Replace the silent track with real microphone
        if (peerConnection && localStream) {
          // Remove old silent track
          const oldTrack = localStream.getAudioTracks()[0]
          const sender = peerConnection
            .getSenders()
            .find(s => s.track === oldTrack)
          if (sender) {
            const newTrack = newStream.getAudioTracks()[0]
            await sender.replaceTrack(newTrack)
            console.log(
              '[WebRTC] ✅ Replaced silent track with real microphone'
            )
          }

          // Update localStream reference
          localStream = newStream

          // Setup audio visualization for the new stream
          setupAudioVisualization()
        }

        logMicPermissionGranted()
      } catch (error) {
        console.log('[Swirl AI] ❌ Microphone permission denied again')
        updateStatusMessage('Microphone denied - staying in text mode')
        logMicPermissionDenied()
        return // Don't switch to voice mode, stay in text mode
      }
    }

    currentInputMode = 'voice'

    // Show voice input container, hide text input container
    const voiceContainer = document.getElementById(
      'swirl-ai-voice-input-container'
    )
    const textContainer = document.getElementById(
      'swirl-ai-text-input-container'
    )
    const messageBtn = document.getElementById('swirl-ai-message-btn')
    const voiceToggleBtn = document.getElementById('swirl-ai-voice-toggle-btn')
    const voiceIconContainer = document.getElementById(
      'swirl-ai-voice-icon-container'
    )

    if (voiceContainer) voiceContainer.style.display = 'flex'
    if (textContainer) textContainer.style.display = 'none'
    if (messageBtn) messageBtn.style.display = 'flex'
    if (voiceToggleBtn) voiceToggleBtn.style.display = 'none'
    if (voiceIconContainer) voiceIconContainer.style.display = 'flex'

    // Unmute microphone when switching back to voice mode - directly enable without affecting userMutedMic flag
    if (localStream && !userMutedMic) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack && !audioTrack.enabled) {
        audioTrack.enabled = true
        console.log('[Swirl AI] Microphone unmuted for voice mode')

        // Update UI to show unmuted state
        const micBtn = document.querySelector('.swirl-ai-voice-mic-btn')
        const unmutedIcon = document.querySelector('.swirl-ai-mic-icon-unmuted')
        const mutedIcon = document.querySelector('.swirl-ai-mic-icon-muted')
        if (micBtn && unmutedIcon && mutedIcon) {
          micBtn.classList.remove('muted')
          micBtn.classList.add('active')
          unmutedIcon.style.display = 'block'
          mutedIcon.style.display = 'none'
        }
      }
    }

    // Clear text input
    const textInput = document.getElementById('swirl-ai-text-input')
    if (textInput) textInput.value = ''

    console.log('[Swirl AI] Voice mode activated')
  }

  function handleTextMessageSend() {
    const textInput = document.getElementById('swirl-ai-text-input')
    if (!textInput) return

    const messageText = textInput.value.trim()
    if (!messageText) {
      console.log('[Swirl AI] Cannot send empty message')
      return
    }

    console.log(`[Swirl AI] Sending text message: "${messageText}"`)

    // Append user message in chat (right-aligned) for text mode
    appendUserMessageInChat(messageText)

    // Send text message using existing function
    const success = sendTextMessageToAI(messageText)

    if (success !== false) {
      // Clear input on successful send
      textInput.value = ''
    }
  }

  function closeModal() {
    console.log('[Swirl AI] 🔽 Closing Voice Agent Modal...')
    hideConnectionLoader()
    // PostHog: Log modal closed with duration and turns
    const modalDuration = modalOpenTime ? Date.now() - modalOpenTime : 0
    logModalClosed({
      durationMs: modalDuration,
      turnsCount: currentConversationTurn
    })
    logSessionEnded({
      durationMs: modalDuration,
      totalTurns: currentConversationTurn
    })
    modalOpen = false

    const modal = document.getElementById('swirl-ai-voice-modal')
    if (!modal) return

    // Restore body scroll
    document.body.classList.remove('swirl-ai-modal-open')
    window.scrollTo(0, scrollPosition)

    // 🎯 FEATURE HOOK: Clear any pending prompt
    clearPendingPrompt()

    // Close animation
    modal.classList.add('closing')
    modal.classList.remove('opening')

    setTimeout(() => {
      modal.classList.remove('active', 'closing')
    }, 400)

    // Cleanup WebRTC
    cleanupWebRTC()

    // Clear conversation messages after 1 second delay (after modal closes)
    setTimeout(() => {
      clearPreviousConversation()
      currentConversationTurn = 0
      homeInfoCollected = false
      qualificationStepsContainer = null
      qualificationStylesInjected = false
      backendHomeInfo = { mode: null, location: null, size: null }
      backendHomeInfoComplete = false
      pendingTurnUiComponents = null
      pendingBookingSlotsTriggerFromTurn = false
      bookingSlotsFetchInFlight = false
      console.log('[Swirl AI] 🧹 Cleared conversation for next session')
    }, 1000)

    // Reset to voice mode when modal closes
    currentInputMode = 'voice'

    // Shuffle logic removed - using simplified trigger system

    console.log('[Swirl AI] ✅ Modal closed')
  }

  // ===================================================
  // CONVERSATION TURN MANAGEMENT
  // ===================================================

  function clearPreviousConversation() {
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const allChildren = Array.from(messagesContainer.children)

    allChildren.forEach(child => {
      // Keep the voice icon container and loading overlay
      if (
        child.classList.contains('swirl-ai-voice-icon-container') ||
        child.classList.contains('swirl-ai-loading-overlay')
      ) {
        return
      }
      // Keep qualification cards while home info is still incomplete
      if (
        !backendHomeInfoComplete &&
        child.classList.contains('swirl-ai-selection-support')
      ) {
        return
      }
      // Keep the qualification steps card while qualification is still in progress
      if (
        qualificationStepsContainer &&
        child.querySelector('#hq-steps-container')
      ) {
        return
      }
      // Keep final visit-confirmed card as terminal state
      if (
        child.classList.contains('lx-visit-confirmed-card') ||
        child.querySelector('.lx-visit-confirmed-card')
      ) {
        return
      }
      // Remove everything else
      child.remove()
    })

    console.log(
      `[Swirl AI] 🧹 Cleared previous conversation (turn ${currentConversationTurn})`
    )
  }

  function handleNewUserQuestion() {
    currentConversationTurn++
    isFirstEventInTurn = true
    assistantTranscriptFinalizedThisTurn = false
    progressiveMediaShownThisTurn = false
    pendingProductCards = null
    pendingMediaEnrichment = null
    pendingTurnUiComponents = null

    // Qualification cards stay visible — they are replaced only when the next
    // qualification card renders (inside renderSelectionSupportCards) or removed
    // once home info is complete. This prevents the flash-and-disappear bug.

    console.log(
      `[Swirl AI] 📝 New conversation turn: ${currentConversationTurn}`
    )
  }

  function clearOnFirstEvent() {
    if (isFirstEventInTurn) {
      hideLoadingStatus()

      // Only clear previous conversation in voice mode
      // In text mode, keep all messages in chat history
      if (currentInputMode === 'voice') {
        clearPreviousConversation()
        console.log(
          `[Swirl AI] 🎯 First event in turn ${currentConversationTurn} - cleared previous content (voice mode)`
        )
      } else {
        console.log(
          `[Swirl AI] 🎯 First event in turn ${currentConversationTurn} - keeping chat history (text mode)`
        )
      }

      isFirstEventInTurn = false
    }
  }

  function showLoadingStatus() {
    const overlay = document.getElementById('swirl-ai-loading-overlay')
    const loadingText = document.getElementById('swirl-ai-loading-text')
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')

    if (!overlay || !loadingText || !messagesContainer) return

    // Pick random phrase
    const randomPhrase =
      FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)]

    // Update text
    loadingText.textContent = randomPhrase

    // Set video to thinking state
    setVoiceVideoState('thinking')

    // Show overlay
    overlay.style.display = 'flex'

    // Make container unscrollable
    messagesContainer.classList.add('loading')

    console.log(`[Swirl AI] 💭 Loading status: "${randomPhrase}"`)
  }

  function hideLoadingStatus() {
    const overlay = document.getElementById('swirl-ai-loading-overlay')
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')

    if (!overlay) return

    // Hide overlay
    overlay.style.display = 'none'

    // Make container scrollable again
    if (messagesContainer) {
      messagesContainer.classList.remove('loading')
    }

    // Transition from thinking to speaking state (first text chunk arrived)
    setVoiceVideoState('speaking')

    console.log('[Swirl AI] ✅ Loading status hidden')
  }

  // ===================================================
  // YOUTUBE VIDEO MODAL
  // ===================================================

  function openVideoModal(videos, startIndex = 0) {
    console.log('[Swirl AI] 📹 Opening video modal', { videos, startIndex })

    currentVideoData = videos
    currentVideoIndex = startIndex

    const modal = document.getElementById('swirl-ai-video-modal')
    if (!modal) return

    // Stop the AI speaking so the user can watch without voice-over
    if (isAISpeaking && dataChannel?.readyState === 'open') {
      console.log('[Swirl AI] 🛑 User opened video — cancelling AI speech')
      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (e) {}
      if (remoteAudioEl) {
        remoteAudioEl.pause()
        remoteAudioEl.currentTime = 0
      }
      isAISpeaking = false
    }

    // Mute microphone to prevent video audio from being sent to AI channel
    muteMicrophone()

    // Load YouTube API if not loaded
    loadYouTubeAPI()
      .then(() => {
        // Build video slides
        buildVideoSlides()

        // Show modal
        modal.style.display = 'block'

        // Initialize player after modal is visible
        setTimeout(() => {
          initializeVideoPlayer()
        }, 100)
      })
      .catch(err => {
        console.error('[Swirl AI] Failed to load YouTube API:', err)
      })
  }

  function closeVideoModal() {
    console.log('[Swirl AI] 📹 Closing video modal')

    const modal = document.getElementById('swirl-ai-video-modal')
    if (!modal) return

    // Stop video - add safety checks
    if (youtubePlayer && typeof youtubePlayer.stopVideo === 'function') {
      try {
        youtubePlayer.stopVideo()
      } catch (e) {
        console.warn('[Swirl AI] Could not stop video:', e)
      }
    }

    if (youtubePlayer && typeof youtubePlayer.destroy === 'function') {
      try {
        youtubePlayer.destroy()
      } catch (e) {
        console.warn('[Swirl AI] Could not destroy player:', e)
      }
    }
    youtubePlayer = null

    // Clear progress interval
    if (updateProgressInterval) {
      clearInterval(updateProgressInterval)
      updateProgressInterval = null
    }

    // Destroy swiper
    if (videoSwiper && typeof videoSwiper.destroy === 'function') {
      try {
        videoSwiper.destroy()
      } catch (e) {
        console.warn('[Swirl AI] Could not destroy swiper:', e)
      }
    }
    videoSwiper = null

    // Hide modal
    modal.style.display = 'none'
    document.body.style.overflow = ''

    // Unmute microphone when video modal closes
    unmuteMicrophone()

    // Clear data
    currentVideoData = []
    currentVideoIndex = 0
  }

  // ===================================================
  // IMAGE MODAL FUNCTIONS
  // ===================================================

  function openImageModal(images, startIndex = 0) {
    console.log('[Swirl AI] 🖼️ Opening image modal', { images, startIndex })

    currentImageData = images
    currentImageIndex = startIndex

    const modal = document.getElementById('swirl-ai-image-modal')
    if (!modal) return

    // Build image slides
    buildImageSlides()

    // Show modal
    modal.style.display = 'block'
    document.body.style.overflow = 'hidden'

    // Initialize Swiper after modal is visible
    setTimeout(() => {
      initializeImageSwiper()
    }, 100)
  }

  function closeImageModal() {
    console.log('[Swirl AI] 🖼️ Closing image modal')

    const modal = document.getElementById('swirl-ai-image-modal')
    if (!modal) return

    // Destroy swiper
    if (imageSwiper && typeof imageSwiper.destroy === 'function') {
      try {
        imageSwiper.destroy()
      } catch (e) {
        console.warn('[Swirl AI] Could not destroy image swiper:', e)
      }
    }
    imageSwiper = null

    // Hide modal
    modal.style.display = 'none'
    document.body.style.overflow = ''

    // Clear data
    currentImageData = []
    currentImageIndex = 0
  }

  function buildImageSlides() {
    const wrapper = document.getElementById('swirl-ai-image-swiper-wrapper')
    const pagination = document.getElementById('swirl-ai-image-pagination')

    if (!wrapper || !pagination) return

    // Clear existing
    wrapper.innerHTML = ''
    pagination.innerHTML = ''

    // Build slides
    currentImageData.forEach((image, index) => {
      const imageUrl = image.url || image
      const imageAlt =
        image.alt || image.title || image.description || 'Vehicle Image'

      // Create slide
      const slide = document.createElement('div')
      slide.className = 'swiper-slide'
      slide.innerHTML = `
        <div class="swirl-ai-image-slide-content">
          <img src="${imageUrl}" alt="${imageAlt}" class="swirl-ai-modal-image" />
          ${
            image.title
              ? `<div class="swirl-ai-image-caption">${image.title}</div>`
              : ''
          }
        </div>
      `
      wrapper.appendChild(slide)

      // Create thumbnail for pagination
      const thumb = document.createElement('div')
      thumb.className = `swirl-ai-image-thumb ${
        index === currentImageIndex ? 'active' : ''
      }`
      thumb.innerHTML = `<img src="${imageUrl}" alt="${imageAlt}" />`
      thumb.addEventListener('click', () => {
        if (imageSwiper) {
          imageSwiper.slideTo(index)
        }
      })
      pagination.appendChild(thumb)
    })
  }

  function initializeImageSwiper() {
    loadSwiperLibrary()
      .then(() => {
        const container = document.querySelector(
          '.swirl-ai-image-swiper-container'
        )
        if (!container) return

        imageSwiper = new Swiper(container, {
          slidesPerView: 1,
          spaceBetween: 0,
          initialSlide: currentImageIndex,
          navigation: {
            nextEl: '#swirl-ai-image-nav-next',
            prevEl: '#swirl-ai-image-nav-prev'
          },
          on: {
            slideChange: function() {
              currentImageIndex = this.activeIndex
              updateImageThumbnails()
            }
          }
        })

        console.log('[Swirl AI] ✅ Image Swiper initialized')
      })
      .catch(() => {})
  }

  function updateImageThumbnails() {
    const thumbnails = document.querySelectorAll('.swirl-ai-image-thumb')
    thumbnails.forEach((thumb, index) => {
      if (index === currentImageIndex) {
        thumb.classList.add('active')
      } else {
        thumb.classList.remove('active')
      }
    })
  }

  // ===================================================
  // VIDEO MODAL FUNCTIONS
  // ===================================================

  function buildVideoSlides() {
    const wrapper = document.getElementById('swirl-ai-video-swiper-wrapper')
    const pagination = document.getElementById('swirl-ai-video-pagination')

    if (!wrapper || !pagination) return

    // Clear existing
    wrapper.innerHTML = ''
    pagination.innerHTML = ''

    // Build slides
    currentVideoData.forEach((video, index) => {
      // Create slide
      const slide = document.createElement('div')
      slide.className = 'swiper-slide'
      slide.innerHTML = `
        <div class="swirl-ai-yt-player-container">
          <div id="swirl-ai-yt-player-${index}" class="swirl-ai-yt-player"></div>
          <div class="swirl-ai-yt-overlay"></div>
          <div class="swirl-ai-yt-controls" id="swirl-ai-yt-controls-${index}">
            <div class="swirl-ai-yt-progress-container" id="swirl-ai-yt-progress-container-${index}">
              <div class="swirl-ai-yt-progress-bar">
                <div class="swirl-ai-yt-progress-fill" id="swirl-ai-yt-progress-fill-${index}"></div>
              </div>
            </div>
            <div class="swirl-ai-yt-controls-bottom">
              <button class="swirl-ai-yt-btn-play" id="swirl-ai-yt-btn-play-${index}" aria-label="Play/Pause">
                <svg class="swirl-ai-yt-icon-play" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M8 5V19L19 12L8 5Z" fill="white"/>
                </svg>
                <svg class="swirl-ai-yt-icon-pause" width="24" height="24" viewBox="0 0 24 24" fill="none" style="display:none;">
                  <path d="M6 4H10V20H6V4ZM14 4H18V20H14V4Z" fill="white"/>
                </svg>
              </button>
              <div class="swirl-ai-yt-time">
                <span id="swirl-ai-yt-current-time-${index}">0:00</span>
                <span>/</span>
                <span id="swirl-ai-yt-duration-${index}">0:00</span>
              </div>
              <button class="swirl-ai-yt-btn-mute" id="swirl-ai-yt-btn-mute-${index}" aria-label="Mute/Unmute">
                <svg class="swirl-ai-yt-icon-volume" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9V15H7L12 20V4L7 9H3Z" fill="white"/>
                  <path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.02C15.48 15.29 16.5 13.77 16.5 12Z" fill="white"/>
                </svg>
                <svg class="swirl-ai-yt-icon-muted" width="24" height="24" viewBox="0 0 24 24" fill="none" style="display:none;">
                  <path d="M3 9V15H7L12 20V4L7 9H3Z" fill="white"/>
                  <line x1="16" y1="8" x2="22" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <line x1="22" y1="8" x2="16" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `
      wrapper.appendChild(slide)

      // Create pagination thumbnail
      const thumb = document.createElement('div')
      thumb.className = 'swirl-ai-video-pagination-thumb'
      if (index === currentVideoIndex) {
        thumb.classList.add('active')
      }
      thumb.style.backgroundImage = `url(${video.thumbnail_url ||
        video.thumbnail})`
      thumb.onclick = () => goToVideo(index)
      pagination.appendChild(thumb)
    })
  }

  function initializeVideoPlayer() {
    // Prevent multiple simultaneous initializations
    if (isInitializingPlayer) {
      console.log('[Swirl AI] ⏳ Player already initializing, skipping...')
      return
    }

    isInitializingPlayer = true

    const video = currentVideoData[currentVideoIndex]
    const videoId = video.videoId || video.video_id
    const startTime = video.startTime || video.start_time || 0

    console.log('[Swirl AI] 🎬 Initializing YouTube player', {
      videoId,
      startTime
    })

    // Create player
    youtubePlayer = new YT.Player(`swirl-ai-yt-player-${currentVideoIndex}`, {
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        fs: 0,
        start: Math.floor(startTime)
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange
      }
    })

    // Setup custom controls
    setupVideoControls()

    // Initialize Swiper (only once)
    if (!videoSwiper) {
      initializeVideoSwiper()
    }

    // Reset flag after a delay
    setTimeout(() => {
      isInitializingPlayer = false
    }, 500)
  }

  function onPlayerReady(event) {
    console.log('[Swirl AI] ✅ YouTube player ready')
    event.target.playVideo()

    // Start progress update interval
    updateProgressInterval = setInterval(() => {
      updateVideoProgress()
    }, 100)
  }

  function onPlayerStateChange(event) {
    const playBtn = document.getElementById(
      `swirl-ai-yt-btn-play-${currentVideoIndex}`
    )
    const playIcon = playBtn?.querySelector('.swirl-ai-yt-icon-play')
    const pauseIcon = playBtn?.querySelector('.swirl-ai-yt-icon-pause')

    if (event.data === YT.PlayerState.PLAYING) {
      if (playIcon) playIcon.style.display = 'none'
      if (pauseIcon) pauseIcon.style.display = 'block'
    } else {
      if (playIcon) playIcon.style.display = 'block'
      if (pauseIcon) pauseIcon.style.display = 'none'
    }
  }

  function setupVideoControls() {
    const playBtn = document.getElementById(
      `swirl-ai-yt-btn-play-${currentVideoIndex}`
    )
    const muteBtn = document.getElementById(
      `swirl-ai-yt-btn-mute-${currentVideoIndex}`
    )
    const progressContainer = document.getElementById(
      `swirl-ai-yt-progress-container-${currentVideoIndex}`
    )

    if (playBtn) {
      playBtn.onclick = () => {
        if (
          !youtubePlayer ||
          typeof youtubePlayer.getPlayerState !== 'function'
        )
          return

        if (youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
          if (typeof youtubePlayer.pauseVideo === 'function') {
            youtubePlayer.pauseVideo()
          }
        } else {
          if (typeof youtubePlayer.playVideo === 'function') {
            youtubePlayer.playVideo()
          }
        }
      }
    }

    if (muteBtn) {
      muteBtn.onclick = () => {
        if (!youtubePlayer || typeof youtubePlayer.isMuted !== 'function')
          return

        const volumeIcon = muteBtn.querySelector('.swirl-ai-yt-icon-volume')
        const mutedIcon = muteBtn.querySelector('.swirl-ai-yt-icon-muted')

        if (youtubePlayer.isMuted()) {
          if (typeof youtubePlayer.unMute === 'function') {
            youtubePlayer.unMute()
          }
          if (volumeIcon) volumeIcon.style.display = 'block'
          if (mutedIcon) mutedIcon.style.display = 'none'
        } else {
          if (typeof youtubePlayer.mute === 'function') {
            youtubePlayer.mute()
          }
          if (volumeIcon) volumeIcon.style.display = 'none'
          if (mutedIcon) mutedIcon.style.display = 'block'
        }
      }
    }

    if (progressContainer) {
      progressContainer.onclick = e => {
        if (
          !youtubePlayer ||
          typeof youtubePlayer.getDuration !== 'function' ||
          typeof youtubePlayer.seekTo !== 'function'
        )
          return

        const rect = progressContainer.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        const duration = youtubePlayer.getDuration()
        youtubePlayer.seekTo(duration * percent)
      }
    }
  }

  function updateVideoProgress() {
    if (!youtubePlayer || !youtubePlayer.getCurrentTime) return

    const currentTime = youtubePlayer.getCurrentTime()
    const duration = youtubePlayer.getDuration()

    if (!duration) return

    const percent = (currentTime / duration) * 100

    const progressFill = document.getElementById(
      `swirl-ai-yt-progress-fill-${currentVideoIndex}`
    )
    if (progressFill) {
      progressFill.style.width = `${percent}%`
    }

    const currentTimeEl = document.getElementById(
      `swirl-ai-yt-current-time-${currentVideoIndex}`
    )
    const durationEl = document.getElementById(
      `swirl-ai-yt-duration-${currentVideoIndex}`
    )

    if (currentTimeEl) {
      currentTimeEl.textContent = formatVideoTime(currentTime)
    }
    if (durationEl) {
      durationEl.textContent = formatVideoTime(duration)
    }
  }

  function formatVideoTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function initializeVideoSwiper() {
    loadSwiperLibrary()
      .then(() => {
        videoSwiper = new Swiper('.swirl-ai-video-swiper-container', {
          slidesPerView: 1,
          spaceBetween: 0,
          navigation: {
            nextEl: '#swirl-ai-video-nav-next',
            prevEl: '#swirl-ai-video-nav-prev'
          },
          on: {
            slideChange: function() {
              goToVideo(this.activeIndex)
            }
          }
        })

        // Go to initial video
        videoSwiper.slideTo(currentVideoIndex, 0)
      })
      .catch(() => {})
  }

  function goToVideo(index) {
    if (index === currentVideoIndex) return

    console.log('[Swirl AI] 📹 Switching to video', index)

    // Clear any pending initialization
    if (playerInitTimeout) {
      clearTimeout(playerInitTimeout)
      playerInitTimeout = null
    }

    // Stop current player with safety checks
    if (youtubePlayer && typeof youtubePlayer.stopVideo === 'function') {
      try {
        youtubePlayer.stopVideo()
      } catch (e) {
        console.warn('[Swirl AI] Could not stop video:', e)
      }
    }

    if (youtubePlayer && typeof youtubePlayer.destroy === 'function') {
      try {
        youtubePlayer.destroy()
      } catch (e) {
        console.warn('[Swirl AI] Could not destroy player:', e)
      }
    }
    youtubePlayer = null

    // Clear interval
    if (updateProgressInterval) {
      clearInterval(updateProgressInterval)
      updateProgressInterval = null
    }

    // Reset initialization flag
    isInitializingPlayer = false

    // Update index
    currentVideoIndex = index

    // Update pagination
    document
      .querySelectorAll('.swirl-ai-video-pagination-thumb')
      .forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index)
      })

    // Slide to video (don't trigger if called from swiper event)
    if (videoSwiper && videoSwiper.activeIndex !== index) {
      videoSwiper.slideTo(index, 0)
    }

    // Debounce initialization - wait for rapid slides to finish
    playerInitTimeout = setTimeout(() => {
      initializeVideoPlayer()
    }, 300)
  }

  // ===================================================
  // WEBRTC CONNECTION
  // ===================================================

  async function connectWebRTC() {
    if (isConnected) return

    // Reset session state for a fresh conversation
    checkoutPending = false
    orderCompleted = false
    lastShownLennoxCards = []
    lastMentionedCard = null
    resetNudge4Flow()

    const connectionStartTime = Date.now()

    try {
      updateStatusMessage('Connecting...')
      logWebRTCConnecting()

      // 1. Get ephemeral token and session config from server
      console.log('[WebRTC] Fetching session token...')
      const response = await fetch(CONFIG.sessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        throw new Error('Failed to get session token')
      }

      const {
        client_secret,
        session_config,
        session_token,
        model
      } = await response.json()
      sessionConfig = session_config
      sessionToken = session_token
      currentModelId = model?.id === 'unified' ? null : model?.id // Set initial model if not unified
      console.log('[WebRTC] ✅ Got session token')

      // Store session token for nudge observer to use for conversation-aware nudges
      try {
        localStorage.setItem('swirl_last_session_token', session_token)
      } catch (e) {
        /* silent */
      }
      if (currentModelId) {
        console.log(
          `[WebRTC] 🚗 Initial model loaded: ${model.name} (${currentModelId})`
        )
      }

      // TOKEN DEBUG: Initialize context tracker with session baseline
      if (DEBUG_TOKENS) {
        conversationContextTracker.reset()
        // Store system prompt for full context logging
        conversationContextTracker.systemPrompt =
          sessionConfig.instructions || ''
        // Estimate system prompt tokens
        const instructionsLength = sessionConfig.instructions?.length || 0
        conversationContextTracker.systemPromptTokens = Math.ceil(
          instructionsLength / 4
        )
        // Estimate tools definitions tokens (rough estimate ~250 tokens per tool)
        const toolCount = sessionConfig.tool_names?.length || 0
        conversationContextTracker.toolDefinitionsTokens = toolCount * 250

        console.log('\n' + '═'.repeat(70))
        console.log('🚀 SESSION INITIALIZED - TOKEN BASELINE')
        console.log('═'.repeat(70))
        console.log(
          `System instructions: ${instructionsLength.toLocaleString()} chars (~${conversationContextTracker.systemPromptTokens.toLocaleString()} tokens)`
        )
        console.log(
          `Tool definitions: ${toolCount} tools (~${conversationContextTracker.toolDefinitionsTokens.toLocaleString()} tokens)`
        )
        console.log(
          `BASELINE: ~${(
            conversationContextTracker.systemPromptTokens +
            conversationContextTracker.toolDefinitionsTokens
          ).toLocaleString()} tokens before any conversation`
        )
        console.log('═'.repeat(70) + '\n')
      }

      // Test mode: Check for custom session ID
      let posthogSessionId = session_token
      if (isTestMode) {
        const testInput = document.getElementById('swirl-ai-test-input')
        const customSessionId = testInput?.value?.trim()
        if (customSessionId) {
          posthogSessionId = customSessionId
          console.log(
            '[WebRTC] 🧪 Using custom session ID for PostHog:',
            customSessionId
          )
        }
        // Update input to show actual session ID being used and lock it
        if (testInput) {
          testInput.value = posthogSessionId
          testInput.disabled = true
          testInput.style.opacity = '0.8'
        }
      }

      // PostHog: Set session token for correlation and log session started
      setPosthogSessionToken(posthogSessionId)
      logSessionStarted({
        modelId: model?.id || window.SWIRL_CONFIG.MODEL_ID,
        modelName: model?.name || window.SWIRL_CONFIG.MODEL_ID
      })

      // 2. Get microphone access
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isChrome =
        /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent)

      // Enhanced audio constraints with advanced noise suppression
      const audioConstraints = {
        // Standard constraints (all browsers)
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },

        // Minimize latency for real-time voice
        latency: { ideal: 0 },

        // iOS-specific voice isolation (uses Apple Neural Engine - VERY effective!)
        ...(isIOS && {
          voiceIsolation: { ideal: true }
        }),

        // Chrome-specific advanced noise suppression features
        ...(isChrome && {
          googNoiseSuppression: { ideal: true },
          googHighpassFilter: { ideal: true },
          googAutoGainControl2: { ideal: true },
          googEchoCancellation: { ideal: true },
          googNoiseSuppression2: { ideal: true }
        }),

        // Mobile-specific optimizations
        ...(isMobile && {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          sampleSize: { ideal: 16 }
        })
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            'getUserMedia unavailable — insecure context or unsupported browser'
          )
        }
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        })
        console.log(
          '[WebRTC] ✅ Got microphone access with enhanced noise suppression'
        )

        // Log applied audio settings for debugging
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
          const settings = audioTrack.getSettings()
          console.log('[WebRTC] 🎙️ Audio settings:', {
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
            sampleRate: settings.sampleRate,
            channelCount: settings.channelCount,
            ...(isIOS && { voiceIsolation: 'requested' }),
            ...(isChrome && { chromeFeaturesEnabled: true })
          })
        }

        logMicPermissionGranted()
        hasRealMicrophone = true // User granted mic permission
      } catch (micError) {
        logMicPermissionDenied()
        hasRealMicrophone = false // User denied mic permission
        console.log(
          '[WebRTC] ⚠️ Microphone access denied - creating silent audio track for text-only mode'
        )

        // Create a silent audio track (required by OpenAI Realtime API)
        // This allows WebRTC connection to work even without mic permission
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const destination = audioContext.createMediaStreamDestination()
        oscillator.connect(destination)
        oscillator.start()

        // Create a silent stream from the destination
        localStream = destination.stream

        // Immediately mute the track (it's silent anyway, but this ensures no audio input)
        const silentTrack = localStream.getAudioTracks()[0]
        if (silentTrack) {
          silentTrack.enabled = false
        }

        console.log('[WebRTC] ✅ Created silent audio track')

        // Automatically switch to text mode if mic permission is denied
        // Set mode IMMEDIATELY to prevent race condition with greeting audio
        currentInputMode = 'text'

        // CRITICAL: Mute remote audio element IMMEDIATELY to prevent any audio playback
        if (remoteAudioEl) {
          remoteAudioEl.muted = true
          console.log('[WebRTC] 🔇 Remote audio muted for text mode')
        }

        updateStatusMessage('Microphone denied - Text mode enabled')
        setTimeout(() => {
          switchToTextMode()
        }, 100)

        // Don't throw error - continue with text-only mode using silent track
      }

      // Setup audio visualization (only if we have real mic)
      if (
        localStream &&
        localStream.getAudioTracks()[0]?.label !==
          'MediaStreamAudioDestinationNode'
      ) {
        setupAudioVisualization()
      }

      // 3. Create peer connection
      const rtcConfig = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      }
      peerConnection = new RTCPeerConnection(rtcConfig)

      // 4. Add local audio track (real mic or silent track)
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          peerConnection.addTrack(track, localStream)
        })
        console.log('[WebRTC] ✅ Added audio track to peer connection')
      }

      // 5. Handle remote audio
      peerConnection.ontrack = event => {
        console.log('[WebRTC] ✅ Received remote audio track')
        remoteAudioEl.srcObject = event.streams[0]

        // Create analyzer for remote audio to detect when AI stops speaking
        try {
          remoteAudioContext = new (window.AudioContext ||
            window.webkitAudioContext)()
          remoteAudioAnalyser = remoteAudioContext.createAnalyser()
          remoteAudioAnalyser.fftSize = 256

          const remoteSource = remoteAudioContext.createMediaStreamSource(
            event.streams[0]
          )
          remoteSource.connect(remoteAudioAnalyser)
          console.log('[WebRTC] ✅ Remote audio analyzer created')
        } catch (err) {
          console.warn(
            '[WebRTC] ⚠️ Could not create remote audio analyzer:',
            err.message
          )
        }
      }

      // 6. Create data channel for events
      dataChannel = peerConnection.createDataChannel('oai-events')
      dataChannel.onopen = handleDataChannelOpen
      dataChannel.onmessage = handleDataChannelMessage
      dataChannel.onerror = e =>
        console.error('[WebRTC] ❌ DataChannel error:', e)
      dataChannel.onclose = () => console.log('[WebRTC] DataChannel closed')

      // 7. Create and set local description (offer)
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      console.log('[WebRTC] Created offer')

      // 8. Send offer to OpenAI and get answer
      const sdpResponse = await fetch(CONFIG.realtimeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: offer.sdp,
          client_secret: client_secret?.value || client_secret,
          session_token: sessionToken
        })
      })

      if (!sdpResponse.ok) {
        throw new Error('Failed to connect to OpenAI')
      }

      // 9. Set remote description (answer)
      const { sdp: answerSdp } = await sdpResponse.json()
      if (!answerSdp) {
        throw new Error('Missing SDP answer from server')
      }
      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      })

      console.log('[WebRTC] ✅ Connection established!')
      isConnected = true

      // Enable text input and send button now that connection is ready
      const textInput = document.getElementById('swirl-ai-text-input')
      const textSendBtn = document.getElementById('swirl-ai-text-send-btn')
      if (textInput) {
        textInput.disabled = false
        textInput.placeholder = 'Have questions? Ask here! 🤔'
      }
      if (textSendBtn) {
        textSendBtn.disabled = false
        textSendBtn.style.opacity = '1'
        textSendBtn.style.cursor = 'pointer'
      }

      // PostHog: Log successful connection
      const connectionLatency = Date.now() - connectionStartTime
      logWebRTCConnected({ latencyMs: connectionLatency })
    } catch (error) {
      console.error('[WebRTC] ❌ Connection error:', error)
      updateStatusMessage('Connection failed: ' + error.message)
      isConnected = false
      hideConnectionLoader()

      // PostHog: Log connection error
      logWebRTCError({
        error: error.message,
        iceState: peerConnection?.iceConnectionState || 'unknown'
      })
      logSessionError({
        error: error.message,
        stage: 'webrtc_connection'
      })
    }
  }

  function handleDataChannelOpen() {
    console.log('[WebRTC] DataChannel open - sending session config')

    // Hide connection loader when realtime data channel is ready
    hideConnectionLoader()

    // Check if we have a pending greeting - if so, disable turn detection initially
    const hasPendingGreeting =
      CONFIG.enablePromptAutoSend && pendingPromptToSend

    // Send session configuration
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: sessionConfig.instructions,
        voice: sessionConfig.voice,
        tools: sessionConfig.tools,
        // Disable turn detection if we have a pending greeting to prevent race condition
        turn_detection: hasPendingGreeting
          ? null
          : {
              ...sessionConfig.turn_detection,
              create_response: true
            },
        input_audio_transcription: sessionConfig.input_audio_transcription,
        tool_choice: 'auto',
        temperature: sessionConfig.temperature,
        max_response_output_tokens: 'inf'
      }
    }
    dataChannel.send(JSON.stringify(sessionUpdate))

    console.log('[Swirl AI] Session mode: realtime_tool_calling')

    if (hasPendingGreeting) {
      console.log(
        '[WebRTC] Turn detection disabled initially - AI greeting pending'
      )
    }

    // updateStatusMessage('Speak to continue')

    // Add active animation to mic button
    const micBtn = document.querySelector('.swirl-ai-voice-mic-btn')
    if (micBtn && localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack && audioTrack.enabled) {
        micBtn.classList.add('active')
      }
    }

    // 🎯 FEATURE HOOK: Auto-send clicked prompt (if enabled)
    checkAndSendPendingPrompt()
  }

  function handleDataChannelMessage(event) {
    try {
      const message = JSON.parse(event.data)

      // Log non-audio events
      if (
        message.type !== 'response.audio.delta' &&
        message.type !== 'input_audio_buffer.speech_started'
      ) {
        console.log('[WebRTC]', message.type, message)
      }

      switch (message.type) {
        case 'session.created':
        case 'session.updated':
          console.log('[WebRTC] ✅ Session ready')
          break

        case 'input_audio_buffer.speech_started':
          console.log('[WebRTC] 🎤 User started speaking')
          handleNewUserQuestion() // Mark new conversation turn
          handleUserSpeechStarted()
          // PostHog: Log user speech started
          logUserSpeechStarted({ turnNumber: currentConversationTurn })
          break

        case 'input_audio_buffer.speech_stopped':
          console.log('[WebRTC] 🛑 User stopped speaking')
          handleUserSpeechStopped()
          // PostHog: Log user speech stopped
          logUserSpeechStopped({ turnNumber: currentConversationTurn })
          // TOKEN DEBUG: Pre-register the user turn immediately so it appears in the
          // correct position in the tracker — before the AI response turn. The transcript
          // text is a placeholder and will be updated when transcription.completed fires.
          if (DEBUG_TOKENS) {
            conversationContextTracker.addTurn(
              'user',
              '(transcribing...)',
              'audio_transcript'
            )
          }
          break

        case 'conversation.item.input_audio_transcription.completed':
          console.log('[WebRTC] 📝 User said:', message.transcript)
          showUserTranscript(message.transcript)
          // PostHog: Log full user transcript
          logUserTranscript({
            text: message.transcript,
            turnNumber: currentConversationTurn
          })
          // Persist zip code if user mentioned one
          detectAndSaveZip(message.transcript)
          // Voice product selection → checkout (same as clicking Buy Now)
          detectVoiceProductSelection(message.transcript)
          // TOKEN DEBUG: Update the placeholder user turn with the real transcript text
          if (DEBUG_TOKENS && message.transcript) {
            conversationContextTracker.updateLastUserTurn(message.transcript)
            console.log(
              `[TOKEN DEBUG] 👤 User transcript: "${message.transcript.substring(
                0,
                50
              )}${message.transcript.length > 50 ? '...' : ''}" (~${Math.ceil(
                message.transcript.length / 4
              )} tokens)`
            )
          }
          break

        case 'response.created':
          console.log('[WebRTC] 🤖 AI response starting')
          handleAISpeechStarted()
          // PostHog: Log AI response started
          logAIResponseStarted({ turnNumber: currentConversationTurn })
          break

        case 'response.audio_transcript.delta':
          updateAssistantTranscript(message.delta)
          break

        case 'response.audio_transcript.done':
          console.log('[WebRTC] ✅ AI transcript complete')
          // PostHog: Log full AI response text
          logAIResponseText({
            text: currentAssistantMessage,
            turnNumber: currentConversationTurn
          })
          // TOKEN DEBUG: Track assistant response in context
          if (DEBUG_TOKENS && currentAssistantMessage) {
            conversationContextTracker.addTurn(
              'assistant',
              currentAssistantMessage,
              'audio_response'
            )
            console.log(
              `[TOKEN DEBUG] 🤖 Assistant response: "${currentAssistantMessage.substring(
                0,
                50
              )}${
                currentAssistantMessage.length > 50 ? '...' : ''
              }" (~${Math.ceil(currentAssistantMessage.length / 4)} tokens)`
            )
          }
          // Normalize transcript: collapse all apostrophe/quote variants and punctuation noise
          // so downstream checks work regardless of how the TTS engine encodes them.
          const normalizedMsg = currentAssistantMessage
            .replace(/[\u2018\u2019\u02BC\u0060']/g, "'") // curly/fancy apostrophes → straight
            .replace(/[\u2013\u2014]/g, '-') // en/em dash → hyphen
            .toLowerCase()

          // Whenever AI mentions a product by name in any message, keep lastMentionedCard current.
          // Also update lastConfirmedCard — it persists across grid clears as a checkout fallback.
          if (lastShownLennoxCards.length) {
            // eslint-disable-next-line no-unused-vars
            for (const card of lastShownLennoxCards) {
              const idLower = (card.id || '').toLowerCase()
              const titleWords = (card.title || '').toLowerCase().split(/\s+/)
              if (idLower && normalizedMsg.includes(idLower)) {
                lastMentionedCard = card
                lastConfirmedCard = card
                break
              }
              const hits = titleWords.filter(
                w => w.length > 3 && normalizedMsg.includes(w)
              )
              if (hits.length >= 2) {
                lastMentionedCard = card
                lastConfirmedCard = card
                break
              }
            }
          }
          // [TOOL-ONLY] All card rendering is now driven exclusively by tool call results
          // from handleToolCall(). No keyword/regex-based card triggers here.
          // Dealer cards, booking slots, visit confirmation, and checkout cards
          // are all rendered via their respective tool call responses.

          break

        case 'response.function_call_arguments.done':
          console.log('[WebRTC] 🔧 Tool call:', message.name)
          // PostHog: Log tool call requested (will log completion in handleToolCall)
          logToolCallRequested({
            toolName: message.name,
            args: message.arguments ? JSON.parse(message.arguments) : {},
            callId: message.call_id
          })
          handleToolCall(message)
          break

        case 'response.done':
          // Detect if this is a tool call completion or final answer
          const hasToolCalls =
            message.response?.output?.some(
              item => item.type === 'function_call'
            ) || false // Ensure boolean value

          // Only show message for final answer (not for tool calls)
          if (!hasToolCalls) updateStatusMessage('Speak to continue')

          // For nudge/greeting flow, delay mic unmuting to prevent audio loop
          // For normal flow, unmute immediately via handleAISpeechEnded()
          if (!isAIGreeting) {
            handleAISpeechEnded()
            // Wait for actual audio to finish before returning to default state
            waitForRemoteAudioSilence(() => {
              console.log('[Swirl AI] 🔇 AI audio finished (silence detected)')
              setVoiceVideoState('default')
            })
          } else {
            // Keep mic muted for nudge flow - will unmute after buffer period
            isAISpeaking = false
            console.log(
              '[Swirl AI] 🔇 Keeping mic muted for nudge response (preventing audio loop)'
            )
          }

          finalizeAssistantMessage()
          assistantTranscriptFinalizedThisTurn = true

          // Extract token usage from response.done message
          const responseUsage = message.response?.usage
          const usageData = {
            turnNumber: currentConversationTurn,
            inputTokens: responseUsage?.input_tokens || 0,
            outputTokens: responseUsage?.output_tokens || 0,
            totalTokens: responseUsage?.total_tokens || 0,
            inputTextTokens:
              responseUsage?.input_token_details?.text_tokens || 0,
            inputAudioTokens:
              responseUsage?.input_token_details?.audio_tokens || 0,
            inputCachedTokens:
              responseUsage?.input_token_details?.cached_tokens || 0,
            outputTextTokens:
              responseUsage?.output_token_details?.text_tokens || 0,
            outputAudioTokens:
              responseUsage?.output_token_details?.audio_tokens || 0
          }

          // Log token usage if available
          if (responseUsage) {
            // Update cumulative session stats
            updateSessionTokenStats(responseUsage)

            console.log('[WebRTC] 📊 Token usage:', {
              input: responseUsage.input_tokens,
              output: responseUsage.output_tokens,
              total: responseUsage.total_tokens,
              session_total: sessionTokenStats.totalTokens
            })
            logTokenUsage(usageData)

            // TOKEN DEBUG: Show detailed breakdown of what's consuming tokens
            if (DEBUG_TOKENS) {
              const inputDetails = responseUsage.input_token_details || {}
              const outputDetails = responseUsage.output_token_details || {}

              console.log('\n' + '═'.repeat(70))
              console.log(
                `📊 TURN ${usageData.turnNumber} - DETAILED TOKEN ANALYSIS`
              )
              console.log('═'.repeat(70))
              console.log(
                'INPUT TOKENS:',
                responseUsage.input_tokens?.toLocaleString()
              )
              console.log(
                '  ├─ Text tokens:   ',
                (inputDetails.text_tokens || 0).toLocaleString()
              )
              console.log(
                '  ├─ Audio tokens:  ',
                (inputDetails.audio_tokens || 0).toLocaleString()
              )
              console.log(
                '  └─ Cached tokens: ',
                (inputDetails.cached_tokens || 0).toLocaleString(),
                inputDetails.cached_tokens > 0 ? '✨ (savings!)' : ''
              )
              console.log('')
              console.log(
                'OUTPUT TOKENS:',
                responseUsage.output_tokens?.toLocaleString()
              )
              console.log(
                '  ├─ Text tokens:   ',
                (outputDetails.text_tokens || 0).toLocaleString()
              )
              console.log(
                '  └─ Audio tokens:  ',
                (outputDetails.audio_tokens || 0).toLocaleString()
              )
              console.log('─'.repeat(70))

              // Calculate token growth
              const prevInput =
                sessionTokenStats.totalInputTokens - responseUsage.input_tokens
              const tokenGrowth = responseUsage.input_tokens - prevInput
              if (usageData.turnNumber > 0 && prevInput > 0) {
                console.log(
                  `⚠️  INPUT TOKEN GROWTH: +${tokenGrowth.toLocaleString()} tokens from last turn`
                )
                console.log(
                  `   (Turn ${usageData.turnNumber -
                    1}: ${prevInput.toLocaleString()} → Turn ${
                    usageData.turnNumber
                  }: ${responseUsage.input_tokens.toLocaleString()})`
                )
              }

              console.log('')
              console.log('SESSION TOTALS:')
              console.log(
                '  Total input:  ',
                sessionTokenStats.totalInputTokens.toLocaleString()
              )
              console.log(
                '  Total output: ',
                sessionTokenStats.totalOutputTokens.toLocaleString()
              )
              console.log(
                '  Total cached: ',
                sessionTokenStats.totalCachedTokens.toLocaleString()
              )
              console.log('  Responses:    ', sessionTokenStats.responseCount)
              console.log('═'.repeat(70) + '\n')

              // Print the context breakdown (summary)
              conversationContextTracker.printContextBreakdown()

              // Print FULL context (detailed - shows what OpenAI sees)
              // This shows the accumulated conversation at this turn
              conversationContextTracker.printFullContext()

              // Send context to backend for file logging
              sendContextToBackend(usageData.turnNumber, responseUsage)
            }
          }

          // PostHog: Log AI response completed with token data
          logAIResponseCompleted(usageData)

          // Render queued qualification/selection UI from backend /turn.
          if (pendingTurnUiComponents?.length) {
            applyBackendTurnUiComponents(pendingTurnUiComponents)
            pendingTurnUiComponents = null
          }

          // Render queued product + media as soon as transcript is finalized on UI.
          // Order is strict: answer first, then qualification UI, then product card(s), then videos/reviews.
          if (pendingProductCards || pendingMediaEnrichment)
            flushQueuedProductAndMedia()

          // Deterministic fallback: if backend /turn asked to show available times but
          // transcript trigger path did not fire, fetch slots now.
          if (pendingBookingSlotsTriggerFromTurn) {
            setTimeout(() => {
              fetchAndDisplayBookingSlots('response.done-fallback')
            }, 150)
            pendingBookingSlotsTriggerFromTurn = false
          }

          // If this was the AI greeting/nudge response, re-enable turn detection and unmute mic
          if (isAIGreeting) {
            isAIGreeting = false
            console.log('[Swirl AI] ✅ AI greeting/nudge response complete')

            if (pendingLennoxIntroQuestion) {
              // Intro line just finished — wait for silence then ask the follow-up question
              pendingLennoxIntroQuestion = false
              waitForRemoteAudioSilence(() => {
                isAIGreeting = true // keep mic muted during question
                handleNewUserQuestion()
                dataChannel.send(
                  JSON.stringify({
                    type: 'response.create',
                    response: {
                      modalities: ['text', 'audio'],
                      tool_choice: 'none',
                      instructions:
                        'Say only this, word for word: "What\'s the top thing you\'re looking for in your new system?" Nothing before or after.'
                    }
                  })
                )
              })
            } else {
              // Wait for actual audio silence before unmuting mic and re-enabling turn detection.
              waitForRemoteAudioSilence(() => {
                console.log(
                  '[Swirl AI] 🔇 AI finished speaking — unmuting mic and enabling turn detection'
                )
                unmuteMicrophone()
                enableTurnDetectionSafely()
                setVoiceVideoState('default')
              })
            }
          }

          // Check if there's a pending message to send after cancellation
          if (pendingMessageAfterCancel) {
            console.log(
              '[Swirl AI] 📤 Sending pending message after cancellation'
            )
            const messageToSend = pendingMessageAfterCancel
            pendingMessageAfterCancel = null

            // Send the pending message after a brief delay
            setTimeout(() => {
              sendGenericUserMessage(messageToSend)
            }, 100)
          }

          break

        case 'response.cancelled':
          console.log('[WebRTC] 🛑 Response successfully cancelled')
          handleAISpeechEnded()
          // PostHog: Log AI interrupted
          logAIInterrupted({
            reason: 'user_speech',
            turnNumber: currentConversationTurn
          })

          // Clear audio buffer completely after successful cancellation
          if (remoteAudioEl && remoteAudioEl.srcObject) {
            console.log('[Swirl AI] 🧹 Clearing audio after cancellation')
            const stream = remoteAudioEl.srcObject

            // Temporarily disable tracks
            const audioTracks = stream.getAudioTracks()
            audioTracks.forEach(track => {
              track.enabled = false
            })

            remoteAudioEl.pause()
            remoteAudioEl.currentTime = 0

            // Re-enable after clearing
            setTimeout(() => {
              audioTracks.forEach(track => {
                track.enabled = true
              })
            }, 100)
          }

          // Send pending message if exists
          if (pendingMessageAfterCancel) {
            console.log(
              '[Swirl AI] 📤 Sending pending message after successful cancellation'
            )
            const messageToSend = pendingMessageAfterCancel
            pendingMessageAfterCancel = null

            setTimeout(() => {
              sendGenericUserMessage(messageToSend)
            }, 200)
          }
          break

        case 'error':
          // Ignore harmless cancellation errors (response already complete)
          if (message.error?.code === 'response_cancel_not_active') {
            console.log(
              '[WebRTC] ℹ️ Cancel request ignored - response already complete'
            )

            // If there's a pending message, send it immediately since response is done
            if (pendingMessageAfterCancel) {
              console.log(
                '[Swirl AI] 📤 Sending pending message (cancel was unnecessary)'
              )
              const messageToSend = pendingMessageAfterCancel
              pendingMessageAfterCancel = null

              setTimeout(() => {
                sendGenericUserMessage(messageToSend)
              }, 100)
            }
            break
          }

          console.error('[WebRTC] ❌ Error:', message.error)
          // PostHog: Log OpenAI error
          logOpenAIError({
            errorType: message.error?.type,
            errorCode: message.error?.code,
            errorMessage: message.error?.message,
            turnNumber: currentConversationTurn
          })
          showError(message.error?.message || 'An error occurred')
          break
      }
    } catch (error) {
      console.error('[WebRTC] ❌ Error parsing message:', error)
      // PostHog: Log debug error
      logDebugError({
        category: 'webrtc',
        error: error.message,
        errorStack: error.stack,
        context: 'message_parsing',
        turnNumber: currentConversationTurn
      })
    }
  }

  function handleUserSpeechStarted() {
    isListening = true

    // Check if audio is actually playing
    const isActuallyPlaying =
      remoteAudioEl && !remoteAudioEl.paused && remoteAudioEl.currentTime > 0

    // Cancel AI if speaking
    if (
      isAISpeaking &&
      isActuallyPlaying &&
      dataChannel?.readyState === 'open'
    ) {
      console.log(
        '[Swirl AI] 🛑 Interrupting AI speech - user started speaking'
      )

      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (error) {
        console.warn(
          '[Swirl AI] ⚠️ Cancel request failed (response may be already complete):',
          error
        )
      }

      // Immediately stop audio playback (but keep stream connected)
      if (remoteAudioEl) {
        remoteAudioEl.pause()
        remoteAudioEl.currentTime = 0
        // Don't disconnect srcObject - we need it for the next response!
      }

      // Force set flag to false
      isAISpeaking = false
    } else if (isAISpeaking) {
      // Flag is true but audio not playing - just reset the flag
      console.log('[Swirl AI] ℹ️ Resetting stale isAISpeaking flag')
      isAISpeaking = false
    }

    // ONLY when recognizing (user speaking): Add recognizing class to hide bars and show wave
    const voiceInputContainer = document.getElementById(
      'swirl-ai-voice-input-container'
    )
    if (voiceInputContainer) {
      voiceInputContainer.classList.add('recognizing')
    }
    // CSS will automatically: hide bars (.swirl-ai-voice-soundwave-bars), show wave (.swirl-ai-voice-wave-animation)

    // Set video to listening state
    setVoiceVideoState('listening')

    updateStatusMessage('Listening...')
  }

  function handleUserSpeechStopped() {
    isListening = false

    // Recognition stopped: Remove recognizing class to hide wave and show bars again
    const voiceInputContainer = document.getElementById(
      'swirl-ai-voice-input-container'
    )
    if (voiceInputContainer) {
      voiceInputContainer.classList.remove('recognizing')
    }
    // CSS will automatically: show bars (.swirl-ai-voice-soundwave-bars), hide wave (.swirl-ai-voice-wave-animation)

    // Show loading status with random phrase
    showLoadingStatus()

    updateStatusMessage('Processing...')
  }

  function handleAISpeechStarted() {
    isAISpeaking = true

    // Skip audio playback in text mode - mute the remote audio element
    if (currentInputMode === 'text') {
      console.log('[Swirl AI] Text mode active - muting audio playback')
      if (remoteAudioEl) {
        remoteAudioEl.muted = true
      }
      updateStatusMessage('AI responding...')
      return
    }

    // Unmute remote audio in voice mode (in case it was muted in text mode)
    if (remoteAudioEl) {
      remoteAudioEl.muted = false
    }

    // CRITICAL: Resume audio playback if it was previously paused (e.g., after barge-in/interruption)
    // After calling remoteAudioEl.pause(), browsers block autoplay, so we must explicitly call play()
    if (remoteAudioEl && remoteAudioEl.paused && remoteAudioEl.srcObject) {
      remoteAudioEl
        .play()
        .then(() => {
          console.log('[WebRTC] ▶️ Resumed audio playback for new AI response')
        })
        .catch(err => {
          console.warn(
            '[WebRTC] ⚠️ Could not resume audio playback:',
            err.message
          )
          // Retry once after short delay (handles timing issues with WebRTC stream)
          setTimeout(() => {
            if (
              remoteAudioEl &&
              remoteAudioEl.paused &&
              remoteAudioEl.srcObject
            ) {
              remoteAudioEl.play().catch(() => {})
            }
          }, 100)
        })
    }

    // Mute mic to prevent echo in voice mode (only if user hasn't manually muted)
    if (currentInputMode === 'voice' && localStream && !userMutedMic) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = false
        console.log('[WebRTC] Mic auto-muted during AI speech')
      }
    }

    // Note: Speaking state is already set in hideLoadingStatus() when first text arrives
    // This ensures speaking state shows as soon as response starts (even before audio plays)

    // updateStatusMessage('AI speaking...')
  }

  function handleAISpeechEnded(toolCall = false) {
    isAISpeaking = false

    // Note: Default state is set in waitForRemoteAudioSilence() callback
    // after audio actually finishes playing (not when text generation completes)

    // Different behavior based on input mode
    if (currentInputMode === 'text') {
      // In text mode: ensure mic stays muted, show text mode status
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
          audioTrack.enabled = false
          console.log('[WebRTC] Mic kept muted in text mode')
        }
      }
      // updateStatusMessage('Type your message...')
    } else {
      // In voice mode: re-enable mic
      if (localStream && !userMutedMic) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
          audioTrack.enabled = true
          const micBtn = document.querySelector('.swirl-ai-voice-mic-btn')
          if (micBtn) {
            micBtn.classList.add('active')
          }
        }
      }
      // updateStatusMessage('Your turn to speak...')
    }
  }

  function cleanupWebRTC() {
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      localStream = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    dataChannel = null
    isConnected = false
    sessionToken = null

    // Reset test mode input
    if (isTestMode) {
      const testInput = document.getElementById('swirl-ai-test-input')
      if (testInput) {
        testInput.value = ''
        testInput.disabled = false
        testInput.style.opacity = '1'
      }
    }

    userMutedMic = false
    isAISpeaking = false
    isListening = false
    pendingMessageAfterCancel = null
    resetNudge4Flow()

    // Reset text streaming
    stopSynchronizedTextReveal()
    transcriptQueue = []
    fullTranscript = ''
    displayedText = ''
    currentAssistantMessage = ''
    firstTranscriptTime = null
    audioPlayStartTime = null
    isAudioPlaying = false
  }

  // ===================================================
  // TOOL CALLING
  // ===================================================

  async function handleToolCall(message) {
    const functionName = message.name
    const callId = message.call_id
    const toolTurn = currentConversationTurn
    const toolStartTime = Date.now()

    console.log(`[WebRTC] 🔧 Tool call: ${functionName}`)

    try {
      let args
      try {
        args = JSON.parse(message.arguments)
      } catch (e) {
        args = message.arguments
      }

      const toolRequestBody = {
        tool_name: functionName,
        tool_args: args,
        call_id: callId,
        session_token: sessionToken,
        model_id: currentModelId
      }
      console.log('[WebRTC] 📤 Tool request payload:', {
        tool: functionName,
        call_id: callId,
        session: sessionToken?.slice(0, 8) || null,
        model_id: currentModelId || null,
        arg_keys: Object.keys(args && typeof args === 'object' ? args : {})
      })

      // Execute tool on server
      const response = await fetch(CONFIG.toolsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolRequestBody)
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      const responseData = await response.json()
      const result = responseData.result
      console.log('[WebRTC] 📥 Tool response summary:', {
        tool: functionName,
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
        booking_confirmed: !!result?.booking_confirmed
      })

      // Qualification tools must always render — the turn counter often increments
      // before the tool response arrives (card click → sendGenericUserMessage → new turn)
      // so they would always be considered "stale" and get dropped.
      const ALWAYS_RENDER_TOOLS = new Set([
        'show_comfort_needs',
        'show_installation_location',
        'show_space_size',
        'show_products',
        'suggest_sku',
        'collect_user_info',
        'confirm_user_info',
        'confirm_booking',
        'show_competitor_comparison'
      ])
      const isStaleToolResult =
        toolTurn !== currentConversationTurn &&
        !ALWAYS_RENDER_TOOLS.has(functionName)
      if (isStaleToolResult) {
        console.log(
          `[WebRTC] ⏭️ Ignoring stale UI render from ${functionName} (tool turn ${toolTurn}, current ${currentConversationTurn})`
        )
      }

      console.log('[WebRTC] 🔧 Tool result:', result?.success)
      const isJourneyMediaTool =
        functionName === 'show_journey_media' ||
        functionName === 'show_media_journey'

      // WebMCP checkout automation tool: execute UI action immediately
      if (result?.has_webmcp_action && result?.webmcp_action) {
        runWebMCPCheckoutAutomation(result.webmcp_action)
      }

      // Update active model context if backend returns one
      if (result?.model_id) {
        currentModelId = result.model_id
        console.log(
          `[WebRTC] 🔄 Model switched to: ${result.model_name} (${result.model_id})`
        )

        // Optional: Update UI indicator if you want to show current model
        updateModelIndicator(result.model_name)
      }

      // For show_journey_media: queue media and render after audio finishes
      // Rendering immediately races with AI audio still streaming — causes cards to be cleared
      if (!isStaleToolResult && isJourneyMediaTool) {
        if (
          result?.youtube_references?.length > 0 ||
          result?.reviews?.length > 0
        ) {
          pendingMediaEnrichment = {
            ...pendingMediaEnrichment,
            ...(result.youtube_references?.length > 0 && {
              youtube_references: result.youtube_references
            }),
            ...(result.reviews?.length > 0 && { reviews: result.reviews }),
            has_media: true
          }
          console.log(
            '[WebRTC] 📦 show_journey_media — queued for after audio silence'
          )
          if (assistantTranscriptFinalizedThisTurn) flushQueuedProductAndMedia()
        }
      }

      // Queue media content (images, videos, reviews) for rendering AFTER AI response
      const hasMediaContent =
        functionName !== 'show_journey_media' &&
        functionName !== 'show_media_journey' &&
        (result?.has_media ||
          result?.images?.length > 0 ||
          result?.youtube_references?.length > 0 ||
          (result?.reviews?.length > 0 && result?.show_reviews))

      if (!isStaleToolResult && hasMediaContent) {
        console.log(
          '[WebRTC] 📦 Queuing media for after AI response:',
          functionName
        )
        // Merge with existing pending media (in case multiple tools return media)
        pendingMediaEnrichment = {
          ...pendingMediaEnrichment,
          images: result.images || pendingMediaEnrichment?.images,
          youtube_references:
            result.youtube_references ||
            pendingMediaEnrichment?.youtube_references,
          reviews: result.reviews || pendingMediaEnrichment?.reviews,
          has_media: true
        }
      }

      // Display NON-media UI elements immediately (these need user interaction)
      // Render any backend-supplied ui_components first (qualification cards, slots, etc.)
      if (
        !isStaleToolResult &&
        Array.isArray(result?.ui_components) &&
        result.ui_components.length > 0
      ) {
        console.log(
          '[WebRTC] 🎴 Rendering ui_components from tool result:',
          result.ui_components.map(component => component?.type).filter(Boolean)
        )
        applyBackendTurnUiComponents(result.ui_components)
      }

      // Display Lennox product cards (UCP catalog) if available
      if (
        !isStaleToolResult &&
        result?.has_cards &&
        result?.cards?.length > 0
      ) {
        // Product cards mean qualification is done — remove qualification cards
        backendHomeInfoComplete = true
        homeInfoCollected = true
        const msgContainer = document.querySelector('.swirl-ai-chat-messages')
        if (msgContainer) {
          msgContainer
            .querySelectorAll('.swirl-ai-selection-support')
            .forEach(n => n.remove())
        }

        if (result?.is_comparison) {
          displayLennoxComparisonCards(result.cards)
        } else {
          pendingProductCards = result.cards
          console.log(
            '[WebRTC] 📦 Queued Lennox product cards for post-answer rendering'
          )
          if (assistantTranscriptFinalizedThisTurn) flushQueuedProductAndMedia()
        }
      }

      // Display competitor comparison card if available
      if (
        !isStaleToolResult &&
        result?.has_competitor_card &&
        result?.lennox_card &&
        result?.competitor_card
      ) {
        displayCompetitorComparisonCard(
          result.lennox_card,
          result.competitor_card
        )
      }

      // Display locations list if available (needs user selection)
      if (
        !isStaleToolResult &&
        result?.has_locations &&
        result?.locations &&
        result.locations.length > 0
      ) {
        displayLocations(result.locations)
      }

      // [NEW FLOW] Display visit-confirmed card from confirm_booking tool
      if (
        !isStaleToolResult &&
        result?.booking_confirmed &&
        result?.booking_summary
      ) {
        lastVisitBookingSummary = result.booking_summary
        const alreadyShown = !!document.querySelector(
          '.lx-visit-confirmed-card'
        )
        if (!alreadyShown) {
          displayVisitConfirmedCard({
            date: result.booking_summary.date || '',
            time: result.booking_summary.time || '',
            product: result.booking_summary.product || '',
            dealer: result.booking_summary.dealer || 'Hce Systems Inc',
            dealerCity: result.booking_summary.dealer_city || '',
            userName: result.booking_summary.user_name || '',
            userEmail: result.booking_summary.user_email || '',
            userPhone: result.booking_summary.user_phone || '',
            userAddress: result.booking_summary.user_address || ''
          })
        }
      }

      // Display booking slots if available (needs user selection)
      if (
        !isStaleToolResult &&
        result?.has_booking_slots &&
        result?.booking_slots
      ) {
        displayBookingSlots(result.booking_slots)
      }

      // Display next steps if available (post-booking)
      if (
        !isStaleToolResult &&
        result?.next_steps &&
        result.next_steps.length > 0
      ) {
        displayNextSteps(result.next_steps)
      }

      // Display predictive questions if available
      if (
        !isStaleToolResult &&
        result?.predictive_suggestions &&
        result.predictive_suggestions.length > 0
      ) {
        displayPredictiveQuestions(result.predictive_suggestions)
      }

      // Send result back to OpenAI
      // Apply token optimization if enabled (strips media data that's already shown in UI)
      const optimizedResult = optimizeToolResultForAI(result)
      const resultString = JSON.stringify(optimizedResult)
      const outputPayload = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: resultString
        }
      }

      // TOKEN DEBUG: Log what's being sent to OpenAI
      if (DEBUG_TOKENS) {
        console.log('\n' + '─'.repeat(50))
        console.log(`[TOKEN DEBUG] 🔧 TOOL RESULT → OpenAI: ${functionName}`)
        console.log('─'.repeat(50))
        console.log(
          `Total chars being sent: ${resultString.length.toLocaleString()}`
        )
        console.log(
          `Estimated tokens: ~${Math.ceil(
            resultString.length / 4
          ).toLocaleString()}`
        )
        console.log('Payload breakdown:', {
          success: result.success,
          context: result.context ? `${result.context.length} chars` : 'none',
          images: result.images?.length || 0,
          youtube_references: result.youtube_references?.length || 0,
          reviews: result.reviews?.length || 0,
          cards: result.cards?.length || 0,
          locations: result.locations?.length || 0,
          booking_slots: result.booking_slots?.length || 0
        })
        // Log the first 500 chars of the payload for inspection
        console.log(
          'Payload preview:',
          resultString.substring(0, 500) +
            (resultString.length > 500 ? '...' : '')
        )
        console.log('─'.repeat(50) + '\n')
      }

      logDataChannelMessage(outputPayload, 'SEND')
      dataChannel.send(JSON.stringify(outputPayload))

      // Always send continuation — AI must respond after every tool call
      dataChannel.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions:
              'Continue the conversation using the tool results. Do not repeat any question you already asked.'
          }
        })
      )

      console.log('[WebRTC] 🔧 ✅ Tool call complete')
      // PostHog: Log tool call completed
      logToolCallCompleted({
        toolName: functionName,
        durationMs: Date.now() - toolStartTime,
        success: true,
        callId: callId
      })
    } catch (error) {
      console.error('[WebRTC] 🔧 ❌ Tool call failed:', error)
      // PostHog: Log tool call error
      logToolCallError({
        toolName: functionName,
        error: error.message,
        callId: callId
      })

      // Send error back to OpenAI
      const errorOutput = {
        success: false,
        error: error.message,
        context: `Error: ${error.message}`
      }

      dataChannel.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(errorOutput)
          }
        })
      )

      // Request response even after error
      dataChannel.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio']
          }
        })
      )
    }
  }

  // ===================================================
  // MICROPHONE CONTROL
  // ===================================================

  function toggleMicrophone() {
    if (!localStream) return

    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      userMutedMic = !audioTrack.enabled

      console.log(
        `[WebRTC] 🎤 Microphone ${
          audioTrack.enabled ? 'unmuted' : 'muted'
        } by user`
      )
      // PostHog: Log mic mute/unmute
      if (audioTrack.enabled) {
        logMicUnmuted()
      } else {
        logMicMuted({ by: 'user' })
      }

      const micBtn = document.querySelector('.swirl-ai-voice-mic-btn')
      const unmutedIcon = document.querySelector('.swirl-ai-mic-icon-unmuted')
      const mutedIcon = document.querySelector('.swirl-ai-mic-icon-muted')

      if (micBtn && unmutedIcon && mutedIcon) {
        micBtn.classList.toggle('muted', !audioTrack.enabled)

        if (audioTrack.enabled) {
          // Unmuted state
          micBtn.classList.add('active')
          unmutedIcon.style.display = 'block'
          mutedIcon.style.display = 'none'
        } else {
          // Muted state
          micBtn.classList.remove('active')
          unmutedIcon.style.display = 'none'
          mutedIcon.style.display = 'block'
        }
      }

      hideStatusMessages()
    }
  }

  // ===================================================
  // AUDIO VISUALIZATION
  // ===================================================

  function setupAudioVisualization() {
    if (!localStream) return

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256

      const source = audioContext.createMediaStreamSource(localStream)
      source.connect(analyser)
    } catch (error) {
      console.error('[WebRTC] Audio visualization error:', error)
    }
  }

  // ===================================================
  // AUDIO SYNCHRONIZATION
  // ===================================================

  function setupAudioSyncListeners() {
    if (!remoteAudioEl) return

    remoteAudioEl.addEventListener('play', () => {
      console.log('[Sync] Audio started playing')
      isAudioPlaying = true
      audioPlayStartTime = Date.now()
      startSynchronizedTextReveal()
    })

    remoteAudioEl.addEventListener('pause', () => {
      console.log('[Sync] Audio paused')
      isAudioPlaying = false // Keep state consistent when audio is paused (e.g., during barge-in)
    })

    remoteAudioEl.addEventListener('ended', () => {
      console.log('[Sync] Audio ended')
      isAudioPlaying = false
      setTimeout(flushRemainingText, 200)
    })

    // Error handling for audio stream issues
    remoteAudioEl.addEventListener('error', e => {
      console.error('[Sync] Audio error:', e)
      isAudioPlaying = false
      // Try to recover by re-triggering play on next AI response
    })

    remoteAudioEl.addEventListener('stalled', () => {
      console.warn('[Sync] Audio stalled - stream may be buffering')
    })

    remoteAudioEl.addEventListener('waiting', () => {
      console.log('[Sync] Audio waiting for data')
    })
  }

  // ===================================================
  // TEXT STREAMING & RENDERING
  // ===================================================

  function renderMarkdown(element, text) {
    if (typeof marked === 'undefined') {
      element.textContent = text
      return
    }

    try {
      const html = marked.parse(text, {
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
      })
      element.innerHTML = html
      scrollToBottom()
    } catch (error) {
      element.textContent = text
    }
  }

  function updateAssistantTranscript(delta) {
    // Voice/text rendering rule: avoid em/en dashes in assistant responses.
    delta = (delta || '').replace(/[\u2013\u2014]/g, ' - ')
    const now = Date.now()

    if (!firstTranscriptTime) {
      firstTranscriptTime = now
    }

    transcriptQueue.push({
      text: delta,
      timestamp: now
    })

    fullTranscript += delta
    currentAssistantMessage += delta

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    let messageDiv = messagesContainer?.querySelector(
      '.swirl-ai-response-message.current'
    )

    if (!messageDiv) {
      // Clear previous conversation on first text event
      clearOnFirstEvent()

      hideStatusMessages()

      // Voice icon GIF stays visible at top (never hide it)

      messageDiv = document.createElement('div')
      messageDiv.className = 'swirl-ai-response-message current'
      messagesContainer?.appendChild(messageDiv)
    }

    if (!syncInterval) {
      startSynchronizedTextReveal()
    }
  }

  function startSynchronizedTextReveal() {
    if (syncInterval) return

    console.log('[Sync] Starting text reveal')

    syncInterval = setInterval(() => {
      const now = Date.now()
      let textToReveal = ''
      let itemsToProcess = 0

      for (let i = 0; i < transcriptQueue.length; i++) {
        const item = transcriptQueue[i]
        const itemAge = now - item.timestamp

        if (itemAge >= TEXT_DELAY_MS) {
          textToReveal += item.text
          itemsToProcess++
        } else {
          break
        }
      }

      if (itemsToProcess > 0) {
        transcriptQueue.splice(0, itemsToProcess)
        displayedText += textToReveal

        const messageDiv = document.querySelector(
          '.swirl-ai-response-message.current'
        )
        if (messageDiv) {
          renderMarkdown(messageDiv, displayedText)
        }
      }
    }, SYNC_INTERVAL_MS)
  }

  function stopSynchronizedTextReveal() {
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
    }
  }

  function flushRemainingText() {
    if (transcriptQueue.length > 0) {
      console.log('[Sync] Flushing remaining text')

      // eslint-disable-next-line no-unused-vars
      for (const item of transcriptQueue) {
        displayedText += item.text
      }
      transcriptQueue = []

      const messageDiv = document.querySelector(
        '.swirl-ai-response-message.current'
      )
      if (messageDiv) {
        renderMarkdown(messageDiv, displayedText)
      }
    }
  }

  function finalizeAssistantMessage() {
    stopSynchronizedTextReveal()
    flushRemainingText()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    const messageDiv = messagesContainer?.querySelector(
      '.swirl-ai-response-message.current'
    )
    if (messageDiv) messageDiv.classList.remove('current')

    currentAssistantMessage = ''
    transcriptQueue = []
    fullTranscript = ''
    displayedText = ''
    firstTranscriptTime = null
    audioPlayStartTime = null

    // updateStatusMessage('Speak to continue')
  }

  // ===================================================
  // CHAT UI FUNCTIONS - NEW FIGMA DESIGN
  // ===================================================

  // Update model indicator badge to show current active model
  function updateModelIndicator(modelName) {
    if (!modelName) return

    const modalContent = document.querySelector('.swirl-ai-voice-modal-content')
    if (!modalContent) return

    let indicator = document.getElementById('swirl-current-model-indicator')
    if (!indicator) {
      // Create indicator if doesn't exist
      indicator = document.createElement('div')
      indicator.id = 'swirl-current-model-indicator'
      indicator.style.cssText = `
        position: absolute;
        top: 60px;
        right: 20px;
        padding: 6px 12px;
        background: #1E40AF;
        color: white;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(30, 64, 175, 0.3);
      `
      modalContent.appendChild(indicator)
    }
    indicator.textContent = `Current: ${modelName}`
  }

  function showUserTranscript(text) {
    console.log('[Swirl AI] User transcript:', text)

    // Show user text in toast box (disappears after 2 seconds)
    const userPromptBox = document.getElementById('swirl-ai-user-prompt-text')
    if (userPromptBox) {
      userPromptBox.textContent = text
      userPromptBox.style.display = 'flex'

      // Hide after 2 seconds
      setTimeout(() => {
        userPromptBox.style.display = 'none'
      }, 2000)
    }
  }

  /**
   * Appends user message in chat container for text mode (right-aligned)
   * Used only in text mode - voice mode uses showUserTranscript instead
   */
  function appendUserMessageInChat(text) {
    console.log('[Swirl AI] Appending user message in chat (text mode):', text)

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    // Create user message div (right-aligned)
    const userMessageDiv = document.createElement('div')
    userMessageDiv.className = 'swirl-ai-user-message'
    userMessageDiv.textContent = text

    messagesContainer.appendChild(userMessageDiv)
    scrollToBottom()
  }

  function scrollToBottom() {
    if (currentInputMode === 'voice') return // No scrolling in voice mode
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  /**
   * Changes the voice agent video state
   * @param {string} state - One of: 'default', 'listening', 'thinking', 'speaking'
   */
  function setVoiceVideoState(state) {
    const videoElement = document.getElementById('swirl-ai-voice-video')
    if (!videoElement) {
      console.warn('[Swirl AI] Voice video element not found')
      return
    }

    const videoPath = CONFIG.voiceVideoStates[state]
    if (!videoPath) {
      console.warn(`[Swirl AI] Invalid video state: ${state}`)
      return
    }

    // Check if already showing this state
    const currentSrc = videoElement.querySelector('source')?.src
    if (currentSrc === videoPath) {
      return // Already showing this state
    }

    console.log(`[Swirl AI] 🎬 Changing video state to: ${state}`)

    // Change video source
    const sourceElement = videoElement.querySelector('source')
    if (sourceElement) {
      sourceElement.src = videoPath
      videoElement.load() // Reload video with new source
      videoElement.play().catch(err => {
        console.warn('[Swirl AI] Video autoplay blocked:', err)
      })
    }
  }

  // ===================================================
  // LENNOX PRODUCT CARDS (UCP Catalog)
  // ===================================================

  // Show a single highlighted product card after voice confirmation — Buy Now triggers checkout
  function showVoiceConfirmedProductCard(card) {
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer || !card) return

    const seerLabel = card.seer2
      ? `${card.seer2} SEER2`
      : card.seer
      ? `${card.seer} SEER`
      : ''

    const wrapper = document.createElement('div')
    wrapper.className = 'swirl-ai-response-container'
    wrapper.innerHTML = `
      <style>
        @keyframes lx-chosen-in {
          0%   { opacity:0; transform:translateY(16px) scale(0.97); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        .lx-chosen-card {
          background: rgba(255,255,255,0.10);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.06) inset;
          overflow: hidden;
          animation: lx-chosen-in 0.35s ease both;
          max-width: 280px;
          position: relative;
        }
        .lx-chosen-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          pointer-events: none;
        }
        .lx-chosen-badge {
          background: rgba(255,255,255,0.07);
          color: #d1d1d1;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 6px 14px;
          text-align: center;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lx-chosen-buy-btn {
          width: 100%;
          padding: 12px;
          background: rgba(255,255,255,0.18);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 50px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.4px;
          transition: all 0.25s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.15) inset;
        }
        .lx-chosen-buy-btn:hover {
          background: rgba(255,255,255,0.26);
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.2) inset;
          transform: translateY(-1px);
        }
      </style>
      <div class="lx-chosen-card" data-product-id="${card.id}">
        <div class="lx-chosen-badge">✓ Your Choice</div>
        <div style="background:linear-gradient(160deg,#22252d 0%,#1a1d23 100%);padding:16px;display:flex;align-items:center;justify-content:center;height:140px;border-bottom:1px solid rgba(255,255,255,0.05);">
          <img src="${resolveLennoxImageUrl(card.image_url, card.id)}" alt="${
      card.title
    }" style="max-height:120px;max-width:100%;object-fit:contain;" onerror="this.style.opacity='0'" />
        </div>
        <div style="padding:14px;">
          <div style="font-size:9px;color:#d1d1d1;margin-bottom:4px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${
            card.series
          }</div>
          <div style="font-size:15px;font-weight:600;color:#d1d1d1;margin-bottom:10px;line-height:1.3;">${
            card.title
          }</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">
            ${
              seerLabel
                ? `<span style="padding:3px 10px;border-radius:100px;font-size:11px;font-weight:500;background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.08);">${seerLabel}</span>`
                : ''
            }
            ${
              card.noise
                ? `<span style="padding:3px 10px;border-radius:100px;font-size:11px;font-weight:500;background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.07);">${card.noise} dB</span>`
                : ''
            }
            ${
              card.energy_star
                ? `<span style="padding:3px 10px;border-radius:100px;font-size:11px;font-weight:500;background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.07);">Energy Star</span>`
                : ''
            }
          </div>
          ${
            card.rating != null
              ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
            <span style="color:#c9a84c;font-size:12px;letter-spacing:1px;">${'★'.repeat(
              Math.floor(card.rating)
            ) + '☆'.repeat(5 - Math.floor(card.rating))}</span>
            <span style="font-size:11px;color:#6b717d;">${card.rating}${
                  card.reviews != null
                    ? ` (${card.reviews.toLocaleString()})`
                    : ''
                }</span>
          </div>`
              : ''
          }
          <!-- [OLD FLOW] <button class="lx-chosen-buy-btn" data-id="${
            card.id
          }">Confirm Purchase</button> -->
          <!-- [NEW FLOW] Schedule visit button -->
          <button class="lx-chosen-buy-btn lx-schedule-btn" data-id="${
            card.id
          }">Schedule Your Visit</button>
        </div>
      </div>
    `

    // [OLD FLOW] Clicking Buy Now → checkout
    // wrapper.addEventListener('click', (e) => {
    //   const btn = e.target.closest('.lx-chosen-buy-btn')
    //   const cardEl = e.target.closest('.lx-chosen-card')
    //   if (btn) { e.stopPropagation(); initiateUCPCheckout(btn.dataset.id) }
    //   else if (cardEl) { initiateUCPCheckout(cardEl.dataset.productId) }
    // })

    // [NEW FLOW] Clicking "Schedule Your Visit" → confirm booking
    wrapper.addEventListener('click', e => {
      const btn = e.target.closest('.lx-schedule-btn')
      if (btn) {
        e.stopPropagation()
        initiateVisitBooking(btn.dataset.id)
      }
    })

    messagesContainer.appendChild(wrapper)
    scrollToBottom()
  }

  // ===================================================
  // DEALER CARDS — live zip lookup via Lennox API
  // ===================================================

  // eslint-disable-next-line no-unused-vars
  async function showDealerCards(zip) {
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    // If no zip captured yet, fall back to asking the AI to request it again
    if (!zip || !/^\d{5}$/.test(zip.trim())) {
      triggerAISpeak(
        `Ask the user for their 5-digit zip code so you can find authorized Lennox dealers near them.`
      )
      return
    }

    zip = zip.trim()

    // Inject dealer card styles once
    if (!document.getElementById('lx-dealer-styles')) {
      const style = document.createElement('style')
      style.id = 'lx-dealer-styles'
      style.textContent = `
        @keyframes lx-dealer-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        .lx-dealer-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .lx-dealer-card {
          background: rgba(255,255,255,0.10);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.07);
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
          animation: lx-dealer-in 0.35s cubic-bezier(0.25,1,0.5,1) both;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.06) inset;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .lx-dealer-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          pointer-events: none;
        }
        .lx-dealer-header { padding: 14px 14px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .lx-dealer-name { font-size: 13px; font-weight: 700; color: #d1d1d1; margin-bottom: 5px; line-height: 1.3; }
        .lx-dealer-address { font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; }
        .lx-dealer-footer { padding: 10px 14px 14px; margin-top: auto; }
        .lx-dealer-call {
          display: flex; align-items: center; justify-content: center; gap: 5px;
          width: 100%;
          padding: 10px 14px;
          background: rgba(255,255,255,0.18);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 50px;
          font-size: 12px; font-weight: 600;
          text-decoration: none;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.15) inset;
          transition: all 0.25s ease;
          letter-spacing: 0.3px;
        }
        .lx-dealer-call:hover {
          background: rgba(255,255,255,0.26);
          border-color: rgba(255,255,255,0.28);
          transform: translateY(-1px);
        }
        .lx-dealer-error { font-size: 13px; color: rgba(255,255,255,0.6); padding: 8px 0; }
      `
      document.head.appendChild(style)
    }

    // Show a loading placeholder while the API responds
    const wrapper = document.createElement('div')
    wrapper.className = 'swirl-ai-response-container'
    wrapper.innerHTML = `<div id="lx-dealers-result" style="min-height:40px;"></div>`
    messagesContainer.appendChild(wrapper)
    scrollToBottom()

    const resultEl = wrapper.querySelector('#lx-dealers-result')

    try {
      const res = await fetch(
        `${CONFIG.dealersUrl}?zip=${encodeURIComponent(zip)}`
      )
      const data = await res.json()

      if (data.empty || !data.dealers?.length) {
        resultEl.innerHTML = `<div class="lx-dealer-error">No dealers found near <strong style="color:#fff">${zip}</strong>.</div>`
        triggerAISpeak(
          `The zip code ${zip} didn't return any dealers nearby. Ask the user to double-check their zip code and try again.`
        )
        return
      }

      const topDealers = data.dealers.slice(0, 2)
      resultEl.innerHTML = `
        <div style="font-size:9px;color:#6b717d;font-weight:700;letter-spacing:1.5px;margin-bottom:12px;text-transform:uppercase;">Dealers near ${zip}</div>
        <div class="lx-dealer-grid">
          ${topDealers
            .map(
              (d, i) => `
            <div class="lx-dealer-card" style="animation-delay:${i * 0.06}s;">
              <div class="lx-dealer-header">
                <div class="lx-dealer-name">${d.name}</div>
                <div class="lx-dealer-address">${[d.address, d.city, d.state]
                  .filter(Boolean)
                  .join(', ')}${d.zip ? ' ' + d.zip : ''}</div>
                ${
                  d.distance
                    ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:5px;font-weight:500;">${d.distance} miles away</div>`
                    : ''
                }
              </div>
              <div class="lx-dealer-footer">
                ${
                  d.phone
                    ? `<a class="lx-dealer-call" href="tel:${d.phone}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Call
                </a>`
                    : `<a class="lx-dealer-call" href="#">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Directions
                </a>`
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `

      scrollToBottom()
      const names = topDealers.map(d => d.name).join(', ')
      triggerAISpeak(
        `Dealer cards are now showing — ${names} near ${zip}. In ONE warm sentence, invite the user to tap the closest one and give them a call. Do NOT call any tools.`
      )
    } catch (e) {
      resultEl.innerHTML = `<div class="lx-dealer-error">Something went wrong — please try again.</div>`
      console.error('[Lennox] Dealer fetch error:', e)
    }
  }

  // ===================================================
  // AUTONOMOUS PURCHASE — visual simulation + voice-driven flow
  // ===================================================

  // Slow visual button click simulation — scrolls to button, highlights, presses, then calls callback

  // Notify AI that a user clicked on a product card (interest, not purchase)
  function notifyAIOfCardInterest(card) {
    if (!card) return
    const productName = card.title || card.id
    const series = card.series ? ` (${card.series})` : ''
    console.log('[Lennox] 👆 Card interest click:', card.id)
    // Pin this card as the current selection — so if the AI responds with "let's get that sorted",
    // the checkout detection has the card ready without needing to re-parse the AI's words.
    lastMentionedCard = card
    lastConfirmedCard = card
    triggerAISpeak(
      `The customer just clicked on the ${productName}${series} card — they're interested. Speak as their advisor: acknowledge their choice warmly, share one specific compelling reason this is a great pick for them (energy efficiency, noise level, warranty, reliability — pick the most relevant), then naturally invite them to ask anything or take the next step. 1-2 sentences, confident and warm.`
    )
  }

  // Detect a 5-digit zip code in user message and persist it as the default
  function detectAndSaveZip(text) {
    if (!text) return
    const match = text.match(/\b(\d{5})\b/)
    if (match) userZipCode = match[1]
  }

  // Track which card the user is talking about — AI owns all confirmation logic
  function detectVoiceProductSelection(transcript) {
    if (!transcript || !lastShownLennoxCards.length) return
    const t = transcript.toLowerCase()

    let matchedCard = null

    // eslint-disable-next-line no-unused-vars
    for (const card of lastShownLennoxCards) {
      const idLower = (card.id || '').toLowerCase()
      const titleWords = (card.title || '').toLowerCase().split(/\s+/)
      const seriesLower = (card.series || '').toLowerCase()
      const tierLower = (card.price_display || '').toLowerCase()

      if (idLower && t.includes(idLower.replace(/-/g, ' '))) {
        matchedCard = card
        break
      }
      const titleHits = titleWords.filter(w => w.length > 3 && t.includes(w))
      if (titleHits.length >= 2) {
        matchedCard = card
        break
      }
      if (
        seriesLower &&
        seriesLower.split(' ').some(w => w.length > 4 && t.includes(w))
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('second') || t.includes('2nd') || t.includes('middle')) &&
        lastShownLennoxCards.indexOf(card) === 1
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('first') || t.includes('1st')) &&
        lastShownLennoxCards.indexOf(card) === 0
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('third') || t.includes('3rd')) &&
        lastShownLennoxCards.indexOf(card) === 2
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('last') || t.includes('fourth') || t.includes('4th')) &&
        lastShownLennoxCards.indexOf(card) === lastShownLennoxCards.length - 1
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('premium') ||
          t.includes('expensive') ||
          t.includes('best')) &&
        tierLower === '$$$$'
      ) {
        matchedCard = card
        break
      }
      if (
        (t.includes('budget') ||
          t.includes('cheapest') ||
          t.includes('affordable')) &&
        tierLower === '$'
      ) {
        matchedCard = card
        break
      }
    }

    // "that one" / "this one" with single card shown
    if (
      !matchedCard &&
      lastShownLennoxCards.length === 1 &&
      /\b(that|this) one\b/i.test(t)
    ) {
      matchedCard = lastShownLennoxCards[0]
    }

    if (matchedCard) {
      lastMentionedCard = matchedCard
      console.log('[Lennox] 🎙️ Tracking user interest in:', matchedCard.id)
    }
  }

  // eslint-disable-next-line no-unused-vars
  async function initiateUCPCheckout(productId) {
    console.log('[Lennox] Initiating UCP checkout for:', productId)

    // Silently stop AI if speaking — checkout runs independently, no AI interaction during flow
    if (isAISpeaking && dataChannel?.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (e) {}
      isAISpeaking = false
    }

    try {
      const createRes = await fetch(CONFIG.checkoutBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: 'USD',
          line_items: [{ item: { id: productId }, quantity: 1 }],
          payment: {}
        })
      })
      if (!createRes.ok) throw new Error('Failed to create checkout')
      const checkout = await createRes.json()
      const lineItemIds = checkout.line_items.map(li => li.id)

      const updateRes = await fetch(
        `${CONFIG.checkoutBaseUrl}/${checkout.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: checkout.id,
            currency: checkout.currency,
            line_items: checkout.line_items,
            payment: checkout.payment || {},
            buyer: {
              full_name: 'Lennox Customer',
              email: 'customer@lennox.com',
              phone_number: '+1-800-555-0100'
            },
            fulfillment: {
              methods: [
                {
                  type: 'shipping',
                  selected_destination_id: 'dest_1',
                  destinations: [
                    {
                      id: 'dest_1',
                      name: 'Lennox Customer',
                      address: {
                        street_address: '1600 Amphitheatre Pkwy',
                        address_locality: 'Mountain View',
                        address_region: 'CA',
                        postal_code: userZipCode,
                        address_country: 'US',
                        full_name: 'Lennox Customer'
                      }
                    }
                  ],
                  groups: [
                    {
                      line_item_ids: lineItemIds,
                      selected_option_id: 'std-ship'
                    }
                  ]
                }
              ]
            }
          })
        }
      )
      if (!updateRes.ok) throw new Error('Failed to update checkout')
      const updated = await updateRes.json()

      const item = updated.line_items?.[0]?.item || {}
      const dest = updated.fulfillment?.methods?.[0]?.destinations?.[0]

      // Show checkout as a viewport overlay modal — always visible, no scrolling needed
      const overlay = document.createElement('div')
      overlay.id = 'lennox-checkout-overlay'
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);'
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:min(420px,92vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.22);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="padding:18px 20px 14px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:16px;font-weight:700;color:#1d1d1f;">Review your order</span>
            <button id="lennox-overlay-close" style="background:none;border:none;font-size:20px;color:#86868b;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
          </div>

          <div style="padding:16px 20px;">
            <div style="display:flex;gap:14px;background:#f5f5f7;border-radius:14px;padding:14px;margin-bottom:16px;align-items:center;">
              <img src="${resolveLennoxImageUrl(
                item.image_url,
                item.id
              )}" style="width:72px;height:72px;object-fit:contain;border-radius:10px;background:#fff;flex-shrink:0;" onerror="this.style.opacity='0'" />
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;color:#86868b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Lennox</div>
                <div style="font-size:14px;font-weight:600;color:#1d1d1f;line-height:1.3;">${item.title ||
                  'Lennox AC Unit'}</div>
                <div style="font-size:12px;color:#86868b;margin-top:3px;">Qty: 1 &nbsp;·&nbsp; Return policy: Contact dealer</div>
              </div>
              <div style="font-size:13px;font-weight:600;color:#1d1d1f;flex-shrink:0;">Contact dealer</div>
            </div>

            <div style="border:1px solid #e8e8ed;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="padding:13px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f0f0f0;">
                <div style="width:36px;height:24px;background:#1d1d1f;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <span style="color:#fff;font-size:10px;font-weight:700;">VISA</span>
                </div>
                <div>
                  <div style="font-size:13px;font-weight:500;color:#1d1d1f;">Visa ••3297</div>
                </div>
              </div>
              <div style="padding:13px 16px;display:flex;align-items:flex-start;gap:12px;">
                <div style="width:36px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#86868b"/></svg>
                </div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:500;color:#1d1d1f;">Lennox Customer</div>
                  <div style="font-size:12px;color:#86868b;margin-top:2px;">${dest
                    ?.address?.street_address ||
                    '1600 Amphitheatre Pkwy'}, ${dest?.address
        ?.address_locality || 'Mountain View'}, ${dest?.address
        ?.address_region || 'CA'}</div>
                  <div style="font-size:12px;color:#86868b;margin-top:4px;display:flex;align-items:center;gap:4px;"><span>📦</span> USPS Standard · Arrives by ${new Date(
                    Date.now() + 4 * 86400000
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}</div>
                </div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #f0f0f0;margin-bottom:16px;">
              <span style="font-size:15px;font-weight:600;color:#1d1d1f;">Pay Lennox</span>
              <span style="font-size:17px;font-weight:700;color:#1d1d1f;">Contact dealer</span>
            </div>

            <button id="lennox-pay-btn-${
              checkout.id
            }" style="width:100%;padding:14px;background:#1d1d1f;color:#fff;border:none;border-radius:28px;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:0.1px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Pay with Google Pay
            </button>

            <div style="font-size:11px;color:#86868b;line-height:1.5;margin-top:12px;text-align:center;">By continuing, you agree to Lennox terms and return policy.</div>
          </div>
        </div>
      `
      const modal =
        document.getElementById('swirl-ai-voice-modal') || document.body
      modal.appendChild(overlay)

      // Close on backdrop click or X button
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove()
      })
      document
        .getElementById('lennox-overlay-close')
        ?.addEventListener('click', () => {
          overlay.remove()
        })

      document
        .getElementById(`lennox-pay-btn-${checkout.id}`)
        ?.addEventListener('click', async () => {
          try {
            const payBtn = document.getElementById(
              `lennox-pay-btn-${checkout.id}`
            )
            if (payBtn) {
              payBtn.disabled = true
              payBtn.textContent = 'Processing...'
            }

            const completeRes = await fetch(
              `${CONFIG.checkoutBaseUrl}/${checkout.id}/complete`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  payment_data: {
                    id: 'gpay_' + Date.now(),
                    handler_id: 'google_pay',
                    type: 'card',
                    brand: 'visa',
                    last_digits: '3297',
                    credential: {
                      type: 'card',
                      number: '4111111111111111',
                      expiry: '12/26',
                      cvv: '123'
                    }
                  }
                })
              }
            )
            if (!completeRes.ok) {
              const err = await completeRes.json().catch(() => ({}))
              throw new Error(
                err.detail || `Payment failed (${completeRes.status})`
              )
            }
            const completed = await completeRes.json()
            const orderId = completed.order_id || checkout.id
            const orderItem = completed.line_items?.[0]?.item || item
            const orderDest =
              completed.fulfillment?.methods?.[0]?.destinations?.[0] || dest
            const deliveryDate = new Date()
            deliveryDate.setDate(deliveryDate.getDate() + 4)
            const deliveryStr = deliveryDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })
            const addr = orderDest?.address || orderDest || {}
            const productName = orderItem?.title || 'Lennox AC Unit'
            const orderIdShort = orderId
              ? String(orderId)
                  .slice(0, 16)
                  .toUpperCase()
              : 'LNX-' +
                Date.now()
                  .toString(36)
                  .toUpperCase()
            const addrLine = addr?.street_address
              ? `${addr.street_address}, ${addr.address_locality}, ${
                  addr.address_region
                } ${addr.postal_code || ''}`.trim()
              : ''

            // Lock out product cards now — order is done
            orderCompleted = true
            lastShownLennoxCards = []
            lastMentionedCard = null

            // Step 1: close the checkout overlay
            overlay.remove()

            // Step 2: show order confirmation card in chat window, then have AI celebrate
            setTimeout(() => {
              const messagesContainer = document.querySelector(
                '.swirl-ai-chat-messages'
              )
              if (!messagesContainer) return

              const confirmCard = document.createElement('div')
              confirmCard.className = 'swirl-ai-response-container'
              confirmCard.innerHTML = `
              <style>
                @keyframes lx-confirm-in { 0%{opacity:0;transform:translateY(16px)} 100%{opacity:1;transform:none} }
                @keyframes lx-checkpop { 0%{transform:scale(0) rotate(-20deg);opacity:0} 65%{transform:scale(1.18) rotate(4deg);opacity:1} 100%{transform:scale(1) rotate(0);opacity:1} }
                @keyframes lx-ring-pop { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(1.75);opacity:0} }
              </style>
              <div style="background:#fff;border-radius:18px;width:min(360px,92%);box-shadow:0 4px 24px rgba(0,0,0,0.10);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;animation:lx-confirm-in 0.4s cubic-bezier(0.25,1,0.5,1) both;overflow:hidden;">
                <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:15px;font-weight:700;color:#1d1d1f;">Order confirmed</span>
                  <div style="position:relative;width:32px;height:32px;flex-shrink:0;">
                    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid rgba(52,199,89,0.45);animation:lx-ring-pop 1.5s ease-out 0.2s infinite;"></div>
                    <div style="width:32px;height:32px;border-radius:50%;background:#34c759;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(52,199,89,0.4);animation:lx-checkpop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                  </div>
                </div>
                <div style="padding:14px 18px;">
                  <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:2px;">Thank you. Your order has been confirmed.</div>
                  <div style="font-size:11px;color:#86868b;margin-bottom:14px;line-height:1.45;">A confirmation will be sent to your email.</div>

                  <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;"><span style="font-size:11px;color:#86868b;">Order number</span><span style="font-size:11px;font-weight:500;color:#007aff;">${orderIdShort}</span></div>
                    <div style="display:flex;justify-content:space-between;"><span style="font-size:11px;color:#86868b;">Delivery</span><span style="font-size:11px;font-weight:600;color:#1d1d1f;">Arrives by ${deliveryStr}</span></div>
                    ${
                      addrLine
                        ? `<div style="display:flex;justify-content:space-between;align-items:flex-start;"><span style="font-size:11px;color:#86868b;">Shipping to</span><span style="font-size:11px;font-weight:500;color:#1d1d1f;text-align:right;max-width:55%;">${addrLine}</span></div>`
                        : ''
                    }
                  </div>

                  <div style="display:flex;gap:12px;background:#f5f5f7;border-radius:12px;padding:12px;margin-bottom:14px;align-items:center;">
                    <img src="${resolveLennoxImageUrl(
                      orderItem?.image_url,
                      orderItem?.id
                    )}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;background:#fff;flex-shrink:0;" onerror="this.style.opacity='0'" />
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:10px;color:#86868b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Lennox</div>
                      <div style="font-size:13px;font-weight:600;color:#1d1d1f;line-height:1.3;">${productName}</div>
                      <div style="font-size:11px;color:#86868b;margin-top:2px;">Qty: 1</div>
                    </div>
                  </div>

                  <div style="background:#f5f5f7;border-radius:12px;padding:10px 12px;margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#86868b;margin-bottom:4px;"><span>Payment method</span><span>Visa ••3297</span></div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#86868b;margin-bottom:4px;"><span>Subtotal</span><span>Contact dealer</span></div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#86868b;margin-bottom:4px;"><span>Installation & shipping</span><span>Contact dealer</span></div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#1d1d1f;padding-top:6px;border-top:1px solid #e8e8ed;margin-top:2px;"><span>Total price</span><span>Contact dealer</span></div>
                  </div>

                  <div style="background:#f5f5f7;border-radius:12px;padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;">
                      <span style="font-size:12px;">📍</span>
                      <span style="font-size:11px;font-weight:600;color:#1d1d1f;">Your nearest Lennox dealers</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:0;">
                      <div style="padding:8px 0;border-bottom:1px solid #e8e8ed;">
                        <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:1px;">Air Sharks</div>
                        <div style="font-size:10px;color:#86868b;margin-bottom:4px;">1560 N 4th St #102, San Jose, CA 95112</div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px;">
                          <span style="padding:2px 6px;border-radius:20px;font-size:10px;font-weight:500;background:#fff3cd;color:#856404;border:1px solid #ffd966;">Premier Dealer</span>
                          <span style="padding:2px 6px;border-radius:20px;font-size:10px;font-weight:500;background:#f0fdf4;color:#22a04a;border:1px solid #bbf7d0;">NATE Certified</span>
                        </div>
                        <a href="tel:8777742757" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#007aff;color:#fff;border-radius:20px;font-size:11px;font-weight:600;text-decoration:none;">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                          877-774-2757
                        </a>
                      </div>
                      <div style="padding:8px 0 0;">
                        <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:1px;">D-Air Conditioning</div>
                        <div style="font-size:10px;color:#86868b;margin-bottom:4px;">San Jose / Bay Area</div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px;">
                          <span style="padding:2px 6px;border-radius:20px;font-size:10px;font-weight:500;background:#f5f5f7;color:#6e6e73;border:1px solid #e8e8ed;">Lennox Dealer</span>
                        </div>
                        <a href="tel:4083262151" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#007aff;color:#fff;border-radius:20px;font-size:11px;font-weight:600;text-decoration:none;">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                          (408) 326-2151
                        </a>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            `
              messagesContainer.appendChild(confirmCard)
              setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight
              }, 50)

              // AI celebrates after confirmation card is visible
              console.log(
                '[Lennox] 🎉 Triggering post-purchase congratulations. DataChannel state:',
                dataChannel?.readyState
              )
              triggerAISpeak(
                `The customer just completed their purchase of the ${productName}. The order confirmation is on screen. CRITICAL: Do NOT call any tools — no show_journey_media, no show_products, no videos, no reviews, no dealer locations. Speak only. Celebrate in one warm sentence, then give one short real-world tip based on the ${productName} specs — something genuinely useful before installation day (e.g. clearing space around the unit, checking electrical capacity, confirming ductwork). Specific to this product, not generic. STOP after 2 sentences — do not mention dealers, do not ask follow-up questions, do not add anything else.`
              )
            }, 1800)
          } catch (e) {
            console.error('[Lennox] Payment error:', e)
            const payBtn = document.getElementById(
              `lennox-pay-btn-${checkout.id}`
            )
            if (payBtn) {
              payBtn.disabled = false
              payBtn.textContent = 'Pay with Google Pay'
            }
          }
        })
    } catch (err) {
      console.error('[Lennox] Checkout error:', err)
      updateStatusMessage('Something went wrong — please try again.')
    }
  }

  // [NEW FLOW] initiateVisitBooking — called when user clicks "Schedule Your Visit"
  async function initiateVisitBooking(productId) {
    console.log('[Lennox] [NEW FLOW] Scheduling dealer visit for:', productId)

    // Silently stop AI if speaking
    if (isAISpeaking && dataChannel?.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (e) {}
      isAISpeaking = false
    }

    try {
      // Get the selected booking slot from the DOM
      const selectedPill = document.querySelector(
        '.swirl-ai-time-pill.selected'
      )
      const selectedCard = selectedPill?.closest('.swirl-ai-booking-slot-card')
      const selectedDate = selectedCard?.dataset.date || null
      const selectedTime = selectedPill?.dataset.time || null

      if (!selectedDate || !selectedTime) {
        console.warn('[Lennox] No time slot selected — prompting user')
        triggerAISpeak(
          'Ask the user to pick a date and time from the calendar above before confirming the visit.'
        )
        return
      }

      // Call confirm_booking tool via the tools endpoint (sessionToken is module-level var)
      const resp = await fetch(CONFIG.toolsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'confirm_booking',
          tool_args: {
            selected_date: selectedDate,
            selected_time: selectedTime,
            product_id: productId
          },
          call_id: 'visit_booking_' + Date.now(),
          session_token: sessionToken
        })
      })

      if (!resp.ok) throw new Error('Booking confirmation failed')
      const data = await resp.json()
      const summary = data?.result?.booking_summary || {}

      // Show Visit Confirmed card
      displayVisitConfirmedCard({
        date: summary.date || selectedDate,
        time: summary.time || selectedTime,
        product: summary.product || productId,
        dealer: summary.dealer || 'Hce Systems Inc',
        dealerCity: summary.dealer_city || '',
        userName: summary.user_name || '',
        userEmail: summary.user_email || '',
        userPhone: summary.user_phone || '',
        userAddress: summary.user_address || ''
      })

      // AI celebrates
      setTimeout(() => {
        triggerAISpeak(
          `The dealer visit is confirmed for ${summary.date} at ${summary.time}. CRITICAL: Do NOT call any tools. Say ONLY this exact sentence and nothing else: "Congrats, Your order is set. The dealer will call you 30 minutes before the scheduled visit."`
        )
      }, 1200)
    } catch (err) {
      console.error('[Lennox] Visit booking error:', err)
      triggerAISpeak(
        'There was an issue confirming the booking. Please try again.'
      )
    }
  }

  // [NEW FLOW] displayVisitConfirmedCard — shows booking confirmation with full user + booking details
  function displayVisitConfirmedCard({
    date,
    time,
    product,
    dealer,
    dealerCity,
    userName,
    userEmail,
    userPhone,
    userAddress
  }) {
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    if (messagesContainer.querySelector('.lx-visit-confirmed-card')) return

    const cardData =
      lastShownLennoxCards.find(c => c.id === product) || lastConfirmedCard
    const productImageUrl = resolveLennoxImageUrl(
      cardData?.image_url || '',
      product
    )
    const dealerFull = dealer + (dealerCity ? ', ' + dealerCity : '')

    const confirmCard = document.createElement('div')
    confirmCard.className =
      'swirl-ai-response-container lx-visit-confirmed-card'
    confirmCard.style.cssText =
      'display:flex;flex-direction:column;align-items:center;width:100%;'
    confirmCard.innerHTML = `
      <style>
        @keyframes lx-visit-in { 0%{opacity:0;transform:translateY(16px)} 100%{opacity:1;transform:none} }
        @keyframes lx-visit-checkpop { 0%{transform:scale(0) rotate(-20deg);opacity:0} 65%{transform:scale(1.18) rotate(4deg);opacity:1} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes lx-visit-ring { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(1.75);opacity:0} }
      </style>
      <div style="width:min(720px,100%);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;animation:lx-visit-in 0.4s cubic-bezier(0.25,1,0.5,1) both;">

        <!-- Header: confirmed label + name -->
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:20px;font-weight:700;line-height:24px;background:linear-gradient(180deg,#E2E2E2 0%,#9898A3 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px;">Visit Confirmed !</div>
          ${
            userName
              ? `<div style="font-size:44px;font-weight:600;line-height:44px;background:linear-gradient(180deg,#E2E2E2 0%,#9898A3 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${userName}</div>`
              : ''
          }
        </div>

        <!-- Product card -->
        <div style="border-radius:12px;background:rgba(255, 255, 255, 0.04);padding:16px;display:flex;gap:14px;align-items:stretch;margin-bottom:16px;">
          ${
            productImageUrl
              ? `<img src="${productImageUrl}" style="width:120px;height:120px;object-fit:contain;border-radius:10px;flex-shrink:0;" onerror="this.style.display='none'" />`
              : ''
          }
          <div style="display:flex;flex-direction:column;justify-content:center;gap:12px;flex:1;min-width:0;">
            <div style="font-size:18px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">${product}</div>
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:2px;"><rect x="3" y="4" width="18" height="18" rx="3" stroke="rgba(255,255,255,0.5)" stroke-width="1.8"/><path d="M3 9h18M8 2v4M16 2v4" stroke="rgba(255,255,255,0.5)" stroke-width="1.8" stroke-linecap="round"/></svg>
              <div>
                <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">Date &amp; Time</div>
                <div style="font-size:13px;font-weight:600;color:#fff;">${date} at ${time}</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:2px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="rgba(255,255,255,0.5)"/></svg>
              <div>
                <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">Dealer</div>
                <div style="font-size:13px;font-weight:600;color:#fff;">${dealerFull}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Your details -->
        ${
          userPhone || userEmail || userAddress
            ? `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div>
            <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1.5px;">Your Details</span>
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${
              userPhone
                ? `<div style="display:flex;align-items:center;gap:11px;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="rgba(255,255,255,0.55)"/></svg>
              <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9);">${userPhone}</span>
            </div>`
                : ''
            }
            ${
              userEmail
                ? `<div style="display:flex;align-items:center;gap:11px;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="rgba(255,255,255,0.55)"/></svg>
              <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9);">${userEmail}</span>
            </div>`
                : ''
            }
            ${
              userAddress
                ? `<div style="display:flex;align-items:flex-start;gap:11px;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:2px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="rgba(255,255,255,0.55)"/></svg>
              <span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9);line-height:1.4;">${userAddress}</span>
            </div>`
                : ''
            }
          </div>
        </div>`
            : ''
        }

        <!-- Note box -->
        <div style="border-radius: 12px;
border: 1.5px solid rgba(255, 255, 255, 0.20);
background: radial-gradient(174.69% 129.58% at 7.79% 5.87%, rgba(109, 158, 203, 0.52) 0%, rgba(200, 200, 200, 0.15) 100%);
box-shadow: 0 0 12px 5px rgba(206, 206, 206, 0.34);
padding: 8px 10px 12px;
14px;display:flex;align-items:flex-start
;gap:10px;">
         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path d="M5.41669 17.5H14.5834L17.0834 8.75L12.9167 10.8333L10 5L7.08335 10.8333L2.91669 8.75L5.41669 17.5Z" stroke="#D9D9D9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5.41669 17.5H14.5834L17.0834 8.75L12.9167 10.8333L10 5L7.08335 10.8333L2.91669 8.75L5.41669 17.5Z" stroke="url(#paint0_linear_15753_12344)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5.41669 17.5H14.5834L17.0834 8.75L12.9167 10.8333L10 5L7.08335 10.8333L2.91669 8.75L5.41669 17.5Z" stroke="url(#paint1_linear_15753_12344)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5.41669 17.5H14.5834L17.0834 8.75L12.9167 10.8333L10 5L7.08335 10.8333L2.91669 8.75L5.41669 17.5Z" stroke="url(#paint2_linear_15753_12344)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2.91669 8.75C3.60704 8.75 4.16669 8.19036 4.16669 7.5C4.16669 6.80964 3.60704 6.25 2.91669 6.25C2.22633 6.25 1.66669 6.80964 1.66669 7.5C1.66669 8.19036 2.22633 8.75 2.91669 8.75Z" fill="#D9D9D9"/>
  <path d="M2.91669 8.75C3.60704 8.75 4.16669 8.19036 4.16669 7.5C4.16669 6.80964 3.60704 6.25 2.91669 6.25C2.22633 6.25 1.66669 6.80964 1.66669 7.5C1.66669 8.19036 2.22633 8.75 2.91669 8.75Z" fill="url(#paint3_linear_15753_12344)"/>
  <path d="M2.91669 8.75C3.60704 8.75 4.16669 8.19036 4.16669 7.5C4.16669 6.80964 3.60704 6.25 2.91669 6.25C2.22633 6.25 1.66669 6.80964 1.66669 7.5C1.66669 8.19036 2.22633 8.75 2.91669 8.75Z" fill="url(#paint4_linear_15753_12344)"/>
  <path d="M2.91669 8.75C3.60704 8.75 4.16669 8.19036 4.16669 7.5C4.16669 6.80964 3.60704 6.25 2.91669 6.25C2.22633 6.25 1.66669 6.80964 1.66669 7.5C1.66669 8.19036 2.22633 8.75 2.91669 8.75Z" fill="url(#paint5_linear_15753_12344)"/>
  <path d="M10 5C10.6904 5 11.25 4.44036 11.25 3.75C11.25 3.05964 10.6904 2.5 10 2.5C9.30964 2.5 8.75 3.05964 8.75 3.75C8.75 4.44036 9.30964 5 10 5Z" fill="#D9D9D9"/>
  <path d="M10 5C10.6904 5 11.25 4.44036 11.25 3.75C11.25 3.05964 10.6904 2.5 10 2.5C9.30964 2.5 8.75 3.05964 8.75 3.75C8.75 4.44036 9.30964 5 10 5Z" fill="url(#paint6_linear_15753_12344)"/>
  <path d="M10 5C10.6904 5 11.25 4.44036 11.25 3.75C11.25 3.05964 10.6904 2.5 10 2.5C9.30964 2.5 8.75 3.05964 8.75 3.75C8.75 4.44036 9.30964 5 10 5Z" fill="url(#paint7_linear_15753_12344)"/>
  <path d="M10 5C10.6904 5 11.25 4.44036 11.25 3.75C11.25 3.05964 10.6904 2.5 10 2.5C9.30964 2.5 8.75 3.05964 8.75 3.75C8.75 4.44036 9.30964 5 10 5Z" fill="url(#paint8_linear_15753_12344)"/>
  <path d="M17.0833 8.75C17.7737 8.75 18.3333 8.19036 18.3333 7.5C18.3333 6.80964 17.7737 6.25 17.0833 6.25C16.393 6.25 15.8333 6.80964 15.8333 7.5C15.8333 8.19036 16.393 8.75 17.0833 8.75Z" fill="#D9D9D9"/>
  <path d="M17.0833 8.75C17.7737 8.75 18.3333 8.19036 18.3333 7.5C18.3333 6.80964 17.7737 6.25 17.0833 6.25C16.393 6.25 15.8333 6.80964 15.8333 7.5C15.8333 8.19036 16.393 8.75 17.0833 8.75Z" fill="url(#paint9_linear_15753_12344)"/>
  <path d="M17.0833 8.75C17.7737 8.75 18.3333 8.19036 18.3333 7.5C18.3333 6.80964 17.7737 6.25 17.0833 6.25C16.393 6.25 15.8333 6.80964 15.8333 7.5C15.8333 8.19036 16.393 8.75 17.0833 8.75Z" fill="url(#paint10_linear_15753_12344)"/>
  <path d="M17.0833 8.75C17.7737 8.75 18.3333 8.19036 18.3333 7.5C18.3333 6.80964 17.7737 6.25 17.0833 6.25C16.393 6.25 15.8333 6.80964 15.8333 7.5C15.8333 8.19036 16.393 8.75 17.0833 8.75Z" fill="url(#paint11_linear_15753_12344)"/>
  <defs>
    <linearGradient id="paint0_linear_15753_12344" x1="10" y1="5" x2="10" y2="17.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2496DB"/>
      <stop offset="1" stop-color="#0FC6F9"/>
    </linearGradient>
    <linearGradient id="paint1_linear_15753_12344" x1="10" y1="5" x2="10" y2="17.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#A170EC"/>
    </linearGradient>
    <linearGradient id="paint2_linear_15753_12344" x1="10" y1="5" x2="10" y2="17.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#537CE3"/>
    </linearGradient>
    <linearGradient id="paint3_linear_15753_12344" x1="2.91669" y1="6.25" x2="2.91669" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2496DB"/>
      <stop offset="1" stop-color="#0FC6F9"/>
    </linearGradient>
    <linearGradient id="paint4_linear_15753_12344" x1="2.91669" y1="6.25" x2="2.91669" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#A170EC"/>
    </linearGradient>
    <linearGradient id="paint5_linear_15753_12344" x1="2.91669" y1="6.25" x2="2.91669" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#537CE3"/>
    </linearGradient>
    <linearGradient id="paint6_linear_15753_12344" x1="10" y1="2.5" x2="10" y2="5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2496DB"/>
      <stop offset="1" stop-color="#0FC6F9"/>
    </linearGradient>
    <linearGradient id="paint7_linear_15753_12344" x1="10" y1="2.5" x2="10" y2="5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#A170EC"/>
    </linearGradient>
    <linearGradient id="paint8_linear_15753_12344" x1="10" y1="2.5" x2="10" y2="5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#537CE3"/>
    </linearGradient>
    <linearGradient id="paint9_linear_15753_12344" x1="17.0833" y1="6.25" x2="17.0833" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2496DB"/>
      <stop offset="1" stop-color="#0FC6F9"/>
    </linearGradient>
    <linearGradient id="paint10_linear_15753_12344" x1="17.0833" y1="6.25" x2="17.0833" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#A170EC"/>
    </linearGradient>
    <linearGradient id="paint11_linear_15753_12344" x1="17.0833" y1="6.25" x2="17.0833" y2="8.75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#75DDF9"/>
      <stop offset="1" stop-color="#537CE3"/>
    </linearGradient>
  </defs>
</svg>
          <span style="line-height: 16px;font-size:14px;font-weight:500;color:#E6E6EF;;line-height:1.5;"><strong style="font-weight:700;background: linear-gradient(180deg, #75DDF9 0%, #537CE3 100%),
            linear-gradient(180deg, #75DDF9 0%, #A170EC 100%),
            linear-gradient(180deg, #2496DB 0%, #0FC6F9 100%),
            #D9D9D9;

-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
color: transparent;
">NOTE</strong><br>Lennox dealer will call you about 30mins before your visit</span>
        </div>

      </div>
    `

    messagesContainer.appendChild(confirmCard)
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }, 50)
  }

  function displayLennoxProductCards(cards) {
    if (orderCompleted) return // Payment done — never show product cards again
    if (chosenCardScheduled) {
      // Chosen card already scheduled via timeout — suppress this grid entirely
      chosenCardScheduled = false
      return
    }
    if (checkoutPending) {
      // Checkout phrase already fired — show this as the "Your Choice" card instead of the grid
      checkoutPending = false
      showVoiceConfirmedProductCard(cards[0])
      return
    }
    console.log('[Lennox] Displaying product cards:', cards.length)
    lastShownLennoxCards = cards // Track for voice selection
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer || !cards.length) return

    const container = document.createElement('div')
    container.className = 'swirl-ai-response-container'

    container.innerHTML = `
      <style>
        @keyframes lennox-card-in {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .swirl-ai-lennox-cards-swiper .swiper-wrapper { align-items: stretch; }
        .swirl-ai-lennox-cards-swiper .swiper-slide { height: auto; }
        .swirl-lennox-card {
          background: rgba(255,255,255,0.10);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.07);
          overflow: hidden;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.06) inset;
          transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
          animation: lennox-card-in 0.35s ease both;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
          display: flex;
          flex-direction: column;

          position: relative;
        }
        .swirl-lennox-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          pointer-events: none;
        }
        .swirl-lennox-card:hover {
          transform: translateY(-3px);
          border-color: rgba(180,180,190,0.2);
          box-shadow: 0 4px 16px rgba(0,0,0,0.35), 0 20px 60px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1) inset;
        }
        .lennox-card-img-wrap {
          background: linear-gradient(160deg, #22252d 0%, #1a1d23 100%);
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
       flex:3;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .lennox-tag {
          padding: 3px 10px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1px;
        }
        .lennox-buy-btn {
          width: 100%;
          padding: 12px;
          background: rgba(255,255,255,0.18);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 50px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.4px;
          transition: all 0.25s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.15) inset;
        }
        .lennox-buy-btn:hover {
          background: rgba(255,255,255,0.26);
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.2) inset;
          transform: translateY(-1px);
        }
        .swirl-ai-cards-nav-prev, .swirl-ai-cards-nav-next {
          background: rgba(30,33,40,0.9) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.3) !important;
        }
      </style>
      <div class="swirl-ai-media-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>Recommended Products</span>
      </div>
      <div class="swirl-ai-cards-swiper-wrapper">
        <div class="swirl-ai-lennox-cards-swiper swiper">
          <div class="swiper-wrapper">
            ${cards
              .map((card, i) => {
                const seerLabel = card.seer2
                  ? `${card.seer2} SEER2`
                  : card.seer
                  ? `${card.seer} SEER`
                  : ''
                return `
                <div class="swiper-slide">
                  <div class="swirl-lennox-card" data-product-id="${
                    card.id
                  }" style="animation-delay:${i * 0.06}s;">
                    <div class="lennox-card-img-wrap">
                      <img src="${resolveLennoxImageUrl(
                        card.image_url,
                        card.id
                      )}" alt="${
                  card.title
                }" style="max-height:130px;max-width:100%;object-fit:contain;" onerror="this.style.opacity='0'" />
                    </div>
                    <div style="padding:18px 16px 16px;display:flex;flex-direction:column;flex:1;">
                      <div style="font-size:9px;color:#d1d1d1;margin-bottom:5px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${
                        card.series
                      }</div>
                      <div style="font-size:15px;font-weight:600;color:#d1d1d1;margin-bottom:12px;line-height:1.35;">${
                        card.title
                      }</div>
                      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                        ${
                          seerLabel
                            ? `<span class="lennox-tag" style="background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.08);">${seerLabel}</span>`
                            : ''
                        }
                        ${
                          card.noise
                            ? `<span class="lennox-tag" style="background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.07);">${card.noise} dB</span>`
                            : ''
                        }
                        ${
                          card.energy_star
                            ? `<span class="lennox-tag" style="background:rgba(255,255,255,0.04);color:#ffffff;border:1px solid rgba(255,255,255,0.07);">Energy Star</span>`
                            : ''
                        }
                      </div>
                      ${(() => {
                        const rating = card.rating ?? 4.5
                        const full = Math.floor(rating)
                        const half = rating % 1 >= 0.5 ? 1 : 0
                        const empty = 5 - full - half
                        const stars =
                          '★'.repeat(full) +
                          (half ? '½' : '') +
                          '☆'.repeat(empty)
                        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:13px;">
                        <span style="color:#c9a84c;font-size:12px;letter-spacing:1px;">${stars}</span>
                        <span style="font-size:11px;color:#6b717d;">${rating}${
                          card.reviews != null
                            ? ` (${card.reviews.toLocaleString()})`
                            : ''
                        }</span>
                      </div>`
                      })()}
                        <!-- [OLD FLOW] <button class="lennox-buy-btn">Buy Now</button> -->
                    </div>
                  </div>
                </div>
              `
              })
              .join('')}
          </div>
        </div>
        <button class="swirl-ai-cards-nav-prev" aria-label="Previous">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="rgba(30,33,40,0.95)"/><path d="M18 11L13 16L18 21" stroke="#e2e5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="swirl-ai-cards-nav-next" aria-label="Next">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="rgba(30,33,40,0.95)"/><path d="M14 11L19 16L14 21" stroke="#e2e5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `

    messagesContainer.appendChild(container)

    // Event delegation — survives Swiper DOM cloning
    container.addEventListener('click', e => {
      const card = e.target.closest('.swirl-lennox-card')
      if (card) {
        e.stopPropagation()
        const productId = card.dataset.productId
        const matchedCard = lastShownLennoxCards.find(c => c.id === productId)
        if (matchedCard) notifyAIOfCardInterest(matchedCard)
      }
    })

    loadSwiperLibrary()
      .then(() => {
        // eslint-disable-next-line no-new
        new Swiper(container.querySelector('.swirl-ai-lennox-cards-swiper'), {
          slidesPerView: 1.15,
          spaceBetween: 14,
          grabCursor: true,
          navigation: {
            nextEl: container.querySelector('.swirl-ai-cards-nav-next'),
            prevEl: container.querySelector('.swirl-ai-cards-nav-prev')
          },
          breakpoints: {
            640: { slidesPerView: 1.6 },
            768: { slidesPerView: 2.1 },
            1024: { slidesPerView: 2.4 }
          }
        })
      })
      .catch(() => {})

    scrollToBottom()

    // Videos/reviews are attached via the unified confidence-media flow.
    // Avoid legacy model-specific video injection here to prevent duplicate video carousels.
  }

  // eslint-disable-next-line no-unused-vars
  function maybeRenderProgressiveMedia() {
    if (progressiveMediaShownThisTurn) return
    if (!pendingMediaEnrichment) return

    const media = pendingMediaEnrichment
    const hasEarlyMedia =
      (media.images && media.images.length > 0) ||
      (media.youtube_references && media.youtube_references.length > 0) ||
      (media.reviews && media.reviews.length > 0)

    if (!hasEarlyMedia) return

    progressiveMediaShownThisTurn = true

    // Render confidence media immediately while AI is speaking.
    if (media.images?.length > 0) {
      displayMedia({ images: media.images })
    }
    if (media.youtube_references?.length > 0) {
      displayMedia({ youtube_references: media.youtube_references })
    }
    if (media.reviews?.length > 0) {
      const isLinkCards = media.reviews[0]?.url !== undefined
      if (isLinkCards) displayReviewLinks(media.reviews)
      else displayReviews({ reviews: media.reviews })
    }

    // Media has already rendered while AI is speaking.
    pendingMediaEnrichment = null
  }

  function flushQueuedProductAndMedia() {
    if (!pendingProductCards && !pendingMediaEnrichment) return

    console.log('[WebRTC] 🎬 Rendering queued product/media now')
    const queuedCards = pendingProductCards
    const media = pendingMediaEnrichment
    pendingProductCards = null
    pendingMediaEnrichment = null

    if (queuedCards?.length > 0) {
      displayLennoxProductCards(queuedCards)
    }

    if (media?.images?.length > 0) {
      displayMedia({ images: media.images })
    }

    if (media?.youtube_references?.length > 0) {
      displayMedia({ youtube_references: media.youtube_references })
    }

    if (media?.reviews?.length > 0) {
      const isLinkCards = media.reviews[0]?.url !== undefined
      if (isLinkCards) displayReviewLinks(media.reviews)
      else displayReviews({ reviews: media.reviews })
    }
  }

  // SVG icons for unit type and location qualifier cards
  const HOME_QUALIFIER_ICONS = {
    cooling: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M22 11H17.83L21.07 7.76L19.66 6.34L15 11H13V9L17.66 4.34L16.24 2.93L13 6.17V2H11V6.17L7.76 2.93L6.34 4.34L11 9V11H9L4.34 6.34L2.93 7.76L6.17 11H2V13H6.17L2.93 16.24L4.34 17.66L9 13H11V15L6.34 19.66L7.76 21.07L11 17.83V22H13V17.83L16.24 21.07L17.66 19.66L13 15V13H15L19.66 17.66L21.07 16.24L17.83 13H22V11Z" fill="white"/>
    </svg>`,
    heating: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
      <g clip-path="url(#heatClip)">
        <path d="M9.33331 5.83332C9.33331 4.59565 9.82498 3.40866 10.7001 2.53349C11.5753 1.65832 12.7623 1.16666 14 1.16666C15.2377 1.16666 16.4246 1.65832 17.2998 2.53349C18.175 3.40866 18.6666 4.59565 18.6666 5.83332V11.9642C20.0935 12.9577 21.166 14.3806 21.7281 16.0259C22.2902 17.6711 22.3125 19.4529 21.7919 21.1117C21.2712 22.7706 20.2348 24.22 18.8333 25.2489C17.4319 26.2779 15.7386 26.8328 14 26.8328C12.2613 26.8328 10.5681 26.2779 9.16664 25.2489C7.7652 24.22 6.72873 22.7706 6.20808 21.1117C5.68744 19.4529 5.70979 17.6711 6.27189 16.0259C6.83399 14.3806 7.9065 12.9577 9.33331 11.9642V5.83332ZM10.668 13.8775C9.64851 14.5869 8.8821 15.6032 8.48031 16.7785C8.07852 17.9537 8.06233 19.2265 8.43409 20.4116C8.80586 21.5967 9.54618 22.6322 10.5473 23.3673C11.5484 24.1025 12.758 24.4989 14 24.4989C15.242 24.4989 16.4516 24.1025 17.4527 23.3673C18.4538 22.6322 19.1941 21.5967 19.5659 20.4116C19.9376 19.2265 19.9214 17.9537 19.5197 16.7785C19.1179 15.6032 18.3514 14.5869 17.332 13.8775L16.3333 13.181V5.83332C16.3333 5.21448 16.0875 4.62099 15.6499 4.18341C15.2123 3.74582 14.6188 3.49999 14 3.49999C13.3811 3.49999 12.7876 3.74582 12.3501 4.18341C11.9125 4.62099 11.6666 5.21448 11.6666 5.83332V13.181L10.668 13.8775ZM12.8333 14.147V5.83332H15.1666V14.147C16.2639 14.4337 17.2193 15.1099 17.8544 16.0494C18.4896 16.989 18.761 18.1275 18.6182 19.2526C18.4753 20.3776 17.9278 21.4122 17.078 22.1631C16.2281 22.9141 15.134 23.33 14 23.3333C12.8633 23.3344 11.7654 22.9207 10.9121 22.1697C10.0589 21.4187 9.50909 20.3822 9.36589 19.2546C9.22268 18.127 9.49594 16.9859 10.1344 16.0455C10.7728 15.1051 11.7325 14.43 12.8333 14.147ZM14 21C14.6188 21 15.2123 20.7542 15.6499 20.3166C16.0875 19.879 16.3333 19.2855 16.3333 18.6667C16.3333 18.0478 16.0875 17.4543 15.6499 17.0167C15.2123 16.5792 14.6188 16.3333 14 16.3333C13.3811 16.3333 12.7876 16.5792 12.3501 17.0167C11.9125 17.4543 11.6666 18.0478 11.6666 18.6667C11.6666 19.2855 11.9125 19.879 12.3501 20.3166C12.7876 20.7542 13.3811 21 14 21Z" fill="white"/>
      </g>
      <defs><clipPath id="heatClip"><rect width="28" height="28" fill="white"/></clipPath></defs>
    </svg>`,
    heating_cooling: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="24" viewBox="0 0 26 24" fill="none">
      <g clip-path="url(#hcClip0)">
        <path d="M8.00006 4.7684C8.00006 3.70754 8.42149 2.69012 9.17163 1.93998C9.92178 1.18983 10.9392 0.768402 12.0001 0.768402C13.0609 0.768402 14.0783 1.18983 14.8285 1.93998C15.5786 2.69012 16.0001 3.70754 16.0001 4.7684V10.0234C17.223 10.875 18.1423 12.0946 18.6241 13.5049C19.1059 14.9151 19.1251 16.4423 18.6788 17.8642C18.2326 19.286 17.3442 20.5284 16.1429 21.4104C14.9417 22.2924 13.4903 22.768 12.0001 22.768C10.5098 22.768 9.05843 22.2924 7.8572 21.4104C6.65596 20.5284 5.76756 19.286 5.32129 17.8642C4.87502 16.4423 4.89418 14.9151 5.37598 13.5049C5.85778 12.0946 6.77708 10.875 8.00006 10.0234V4.7684ZM9.14406 11.6634C8.27023 12.2715 7.61331 13.1426 7.26892 14.15C6.92452 15.1573 6.91065 16.2483 7.2293 17.2641C7.54796 18.2799 8.18252 19.1674 9.04059 19.7975C9.89867 20.4277 10.9355 20.7675 12.0001 20.7675C13.0647 20.7675 14.1015 20.4277 14.9595 19.7975C15.8176 19.1674 16.4522 18.2799 16.7708 17.2641C17.0895 16.2483 17.0756 15.1573 16.7312 14.15C16.3868 13.1426 15.7299 12.2715 14.8561 11.6634L14.0001 11.0664V4.7684C14.0001 4.23797 13.7893 3.72926 13.4143 3.35419C13.0392 2.97912 12.5305 2.7684 12.0001 2.7684C11.4696 2.7684 10.9609 2.97912 10.5858 3.35419C10.2108 3.72926 10.0001 4.23797 10.0001 4.7684V11.0664L9.14406 11.6634ZM11.0001 11.8944V4.7684H13.0001V11.8944C13.9405 12.1401 14.7595 12.7198 15.3039 13.5251C15.8483 14.3304 16.081 15.3063 15.9585 16.2706C15.836 17.2349 15.3668 18.1217 14.6383 18.7654C13.9099 19.409 12.9721 19.7656 12.0001 19.7684C11.0258 19.7694 10.0847 19.4147 9.35333 18.771C8.622 18.1273 8.15073 17.2389 8.02798 16.2724C7.90523 15.3059 8.13945 14.3278 8.68667 13.5217C9.23389 12.7156 10.0565 12.137 11.0001 11.8944ZM12.0001 17.7684C12.5305 17.7684 13.0392 17.5577 13.4143 17.1826C13.7893 16.8075 14.0001 16.2988 14.0001 15.7684C14.0001 15.238 13.7893 14.7293 13.4143 14.3542C13.0392 13.9791 12.5305 13.7684 12.0001 13.7684C11.4696 13.7684 10.9609 13.9791 10.5858 14.3542C10.2108 14.7293 10.0001 15.238 10.0001 15.7684C10.0001 16.2988 10.2108 16.8075 10.5858 17.1826C10.9609 17.5577 11.4696 17.7684 12.0001 17.7684Z" fill="white"/>
      </g>
      <g clip-path="url(#hcClip1)">
        <path d="M23.8571 10.7295H19.6871L22.9271 7.48949L21.5171 6.06949L16.8571 10.7295H14.8571V8.72949L19.5171 4.06949L18.0971 2.65949L14.8571 5.89949V1.72949H12.8571V5.89949L9.61712 2.65949L8.19712 4.06949L12.8571 8.72949V10.7295H10.8571L6.19712 6.06949L4.78712 7.48949L8.02712 10.7295H3.85712V12.7295H8.02712L4.78712 15.9695L6.19712 17.3895L10.8571 12.7295H12.8571V14.7295L8.19712 19.3895L9.61712 20.7995L12.8571 17.5595V21.7295H14.8571V17.5595L18.0971 20.7995L19.5171 19.3895L14.8571 14.7295V12.7295H16.8571L21.5171 17.3895L22.9271 15.9695L19.6871 12.7295H23.8571V10.7295Z" fill="white"/>
      </g>
      <defs>
        <clipPath id="hcClip0"><rect width="12.8571" height="24" fill="white"/></clipPath>
        <clipPath id="hcClip1"><rect width="12" height="24" fill="white" transform="translate(13.8571)"/></clipPath>
      </defs>
    </svg>`,
    both: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="24" viewBox="0 0 26 24" fill="none">
      <g clip-path="url(#bothClip0)">
        <path d="M8.00006 4.7684C8.00006 3.70754 8.42149 2.69012 9.17163 1.93998C9.92178 1.18983 10.9392 0.768402 12.0001 0.768402C13.0609 0.768402 14.0783 1.18983 14.8285 1.93998C15.5786 2.69012 16.0001 3.70754 16.0001 4.7684V10.0234C17.223 10.875 18.1423 12.0946 18.6241 13.5049C19.1059 14.9151 19.1251 16.4423 18.6788 17.8642C18.2326 19.286 17.3442 20.5284 16.1429 21.4104C14.9417 22.2924 13.4903 22.768 12.0001 22.768C10.5098 22.768 9.05843 22.2924 7.8572 21.4104C6.65596 20.5284 5.76756 19.286 5.32129 17.8642C4.87502 16.4423 4.89418 14.9151 5.37598 13.5049C5.85778 12.0946 6.77708 10.875 8.00006 10.0234V4.7684ZM9.14406 11.6634C8.27023 12.2715 7.61331 13.1426 7.26892 14.15C6.92452 15.1573 6.91065 16.2483 7.2293 17.2641C7.54796 18.2799 8.18252 19.1674 9.04059 19.7975C9.89867 20.4277 10.9355 20.7675 12.0001 20.7675C13.0647 20.7675 14.1015 20.4277 14.9595 19.7975C15.8176 19.1674 16.4522 18.2799 16.7708 17.2641C17.0895 16.2483 17.0756 15.1573 16.7312 14.15C16.3868 13.1426 15.7299 12.2715 14.8561 11.6634L14.0001 11.0664V4.7684C14.0001 4.23797 13.7893 3.72926 13.4143 3.35419C13.0392 2.97912 12.5305 2.7684 12.0001 2.7684C11.4696 2.7684 10.9609 2.97912 10.5858 3.35419C10.2108 3.72926 10.0001 4.23797 10.0001 4.7684V11.0664L9.14406 11.6634ZM11.0001 11.8944V4.7684H13.0001V11.8944C13.9405 12.1401 14.7595 12.7198 15.3039 13.5251C15.8483 14.3304 16.081 15.3063 15.9585 16.2706C15.836 17.2349 15.3668 18.1217 14.6383 18.7654C13.9099 19.409 12.9721 19.7656 12.0001 19.7684C11.0258 19.7694 10.0847 19.4147 9.35333 18.771C8.622 18.1273 8.15073 17.2389 8.02798 16.2724C7.90523 15.3059 8.13945 14.3278 8.68667 13.5217C9.23389 12.7156 10.0565 12.137 11.0001 11.8944ZM12.0001 17.7684C12.5305 17.7684 13.0392 17.5577 13.4143 17.1826C13.7893 16.8075 14.0001 16.2988 14.0001 15.7684C14.0001 15.238 13.7893 14.7293 13.4143 14.3542C13.0392 13.9791 12.5305 13.7684 12.0001 13.7684C11.4696 13.7684 10.9609 13.9791 10.5858 14.3542C10.2108 14.7293 10.0001 15.238 10.0001 15.7684C10.0001 16.2988 10.2108 16.8075 10.5858 17.1826C10.9609 17.5577 11.4696 17.7684 12.0001 17.7684Z" fill="white"/>
      </g>
      <g clip-path="url(#bothClip1)">
        <path d="M23.8571 10.7295H19.6871L22.9271 7.48949L21.5171 6.06949L16.8571 10.7295H14.8571V8.72949L19.5171 4.06949L18.0971 2.65949L14.8571 5.89949V1.72949H12.8571V5.89949L9.61712 2.65949L8.19712 4.06949L12.8571 8.72949V10.7295H10.8571L6.19712 6.06949L4.78712 7.48949L8.02712 10.7295H3.85712V12.7295H8.02712L4.78712 15.9695L6.19712 17.3895L10.8571 12.7295H12.8571V14.7295L8.19712 19.3895L9.61712 20.7995L12.8571 17.5595V21.7295H14.8571V17.5595L18.0971 20.7995L19.5171 19.3895L14.8571 14.7295V12.7295H16.8571L21.5171 17.3895L22.9271 15.9695L19.6871 12.7295H23.8571V10.7295Z" fill="white"/>
      </g>
      <defs>
        <clipPath id="bothClip0"><rect width="12.8571" height="24" fill="white"/></clipPath>
        <clipPath id="bothClip1"><rect width="12" height="24" fill="white" transform="translate(13.8571)"/></clipPath>
      </defs>
    </svg>`,
    basement: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="18" viewBox="0 0 20 18" fill="none">
<path d="M18 16V0H2V16H0V18H20V16H18ZM16 2V8H4V2H16ZM4 16V10H9V11.82C8.55 12.14 8.25 12.66 8.25 13.25C8.25 14.22 9.03 15 10 15C10.97 15 11.75 14.22 11.75 13.25C11.75 12.66 11.45 12.13 11 11.82V10H16V16H4Z" fill="white"/></svg>`,
    crawlspace: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
<path d="M15.8213 14.65C15.4307 14.2594 14.7979 14.2594 14.4072 14.65C14.0165 15.0406 14.0166 15.6734 14.4072 16.0641L16.2926 17.9495C16.3848 18.0418 16.4954 18.1148 16.6178 18.1656C16.7401 18.2162 16.8697 18.2428 16.9999 18.2428C17.1301 18.2428 17.2598 18.2162 17.382 18.1656C17.5044 18.1149 17.615 18.0418 17.7072 17.9495L19.5926 16.0641C19.9832 15.6735 19.9832 15.0407 19.5926 14.65C19.202 14.2593 18.5692 14.2594 18.1785 14.65L18 14.8287V9.17151L18.1787 9.35021C18.374 9.54551 18.6299 9.64321 18.8857 9.64321C19.1415 9.64321 19.3974 9.54551 19.5927 9.35021C19.9833 8.95961 19.9833 8.32681 19.5927 7.93611L17.7073 6.05071C17.6151 5.95841 17.5045 5.88541 17.3821 5.83461C17.1376 5.73351 16.8623 5.73351 16.6178 5.83461C16.4954 5.88531 16.3848 5.95841 16.2926 6.05071L14.4072 7.93611C14.0166 8.32671 14.0166 8.95951 14.4072 9.35021C14.7978 9.74091 15.4306 9.74081 15.8213 9.35021L16 9.17151V14.8287L15.8213 14.65Z" fill="white"/>
<path d="M13.9956 3.13133C14.0464 2.58153 13.6411 2.09473 13.0913 2.04443C11.2734 1.87553 9.4316 2.11963 7.6392 2.69973C6.1421 3.18953 4.9863 4.53813 4.623 6.21683C4.2095 8.10843 4 10.0542 4 12C4 13.9458 4.2095 15.8916 4.6226 17.7812C4.9864 19.4619 6.1421 20.8105 7.6426 21.3017C9.0767 21.7651 10.5425 22 12 22C12.3604 22 12.731 21.9888 13.0913 21.9556C13.6411 21.9053 14.0464 21.4185 13.9956 20.8687C13.9458 20.3189 13.4683 19.917 12.9087 19.9644C11.3594 20.1055 9.7881 19.8936 8.2612 19.3999C7.4365 19.1299 6.7915 18.3477 6.5771 17.3564C6.1943 15.6045 6 13.8022 6 12C6 10.1978 6.1943 8.39553 6.5776 6.64163C6.7915 5.65233 7.4365 4.87013 8.2578 4.60163C9.7895 4.10603 11.3594 3.89313 12.9087 4.03573C13.4692 4.09233 13.9458 3.68123 13.9956 3.13133Z" fill="white"/>
<path d="M12 6C12 5.4478 11.5522 5 11 5C10.4478 5 10 5.4478 10 6V8C10 8.5522 10.4478 9 11 9C11.5522 9 12 8.5522 12 8V6ZM11 15C10.4478 15 10 15.4478 10 16V18C10 18.5522 10.4478 19 11 19C11.5522 19 12 18.5522 12 18V16C12 15.4478 11.5522 15 11 15ZM12 11C12 10.4478 11.5522 10 11 10C10.4478 10 10 10.4478 10 11V13C10 13.5522 10.4478 14 11 14C11.5522 14 12 13.5522 12 13V11Z" fill="white"/>
</svg>`,
    garage: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
<path d="M20 2H4C2.9 2 2 2.9 2 4V20C2 21.1 2.9 22 4 22H20C21.1 22 22 21.1 22 20V4C22 2.9 21.1 2 20 2ZM20 20H4V4H20V20Z" fill="white"/>
<path d="M9 14C9.55228 14 10 13.5523 10 13C10 12.4477 9.55228 12 9 12C8.44772 12 8 12.4477 8 13C8 13.5523 8.44772 14 9 14Z" fill="white"/>
<path d="M15 14C15.5523 14 16 13.5523 16 13C16 12.4477 15.5523 12 15 12C14.4477 12 14 12.4477 14 13C14 13.5523 14.4477 14 15 14Z" fill="white"/>
<path d="M5.78 18.5H6.22C6.65 18.5 7 18.14 7 17.69V16.5H17V17.69C17 18.14 17.34 18.5 17.78 18.5H18.22C18.65 18.5 19 18.14 19 17.69V11.19C18.18 8.73 17.66 7.16 17.44 6.5C17.39 6.34 17.32 6.21 17.25 6.1C17.23 6.08 17.22 6.06 17.2 6.03C16.82 5.51 16.28 5.5 16.28 5.5H7.72C7.72 5.5 7.18 5.51 6.8 6.04C6.78 6.06 6.77 6.08 6.75 6.1C6.68 6.21 6.61 6.34 6.56 6.5C6.34 7.16 5.82 8.72 5 11.19V17.69C5 18.14 5.35 18.5 5.78 18.5ZM8.33 7.5H15.67L15.9 8.19L16.33 9.5H7.67L8.33 7.5ZM7 11.5H17V14.5H7V11.5Z" fill="white"/>
</svg>`,
    attic: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
<path fill-rule="evenodd" clip-rule="evenodd" d="M9.68953 1.6718L2.3359 6.57422C1.5013 7.13061 1 8.06731 1 9.07037V20C1 21.6569 2.34315 23 4 23H20C21.6569 23 23 21.6569 23 20V9.07037C23 8.06731 22.4987 7.13061 21.6641 6.57422L14.3105 1.6718C13.6534 1.23375 12.8814 1 12.0917 1H11.9083C11.1186 1 10.3466 1.23375 9.68953 1.6718ZM22 11V9.07037C22 8.40166 21.6658 7.7772 21.1094 7.40627L13.7558 2.50385C13.263 2.17531 12.6839 2 12.0917 2H11.9083C11.3161 2 10.737 2.17531 10.2442 2.50385L2.8906 7.40627C2.3342 7.7772 2 8.40166 2 9.07037V11H11.5C11.7761 11 12 11.2239 12 11.5C12 11.7761 11.7761 12 11.5 12H2V20C2 21.1046 2.89543 22 4 22H11V17.5C11 17.2239 11.2239 17 11.5 17H14V14.5C14 14.2239 14.2239 14 14.5 14H17V11.5C17 11.2239 17.2239 11 17.5 11H22ZM12 22V18H14.5C14.7761 18 15 17.7761 15 17.5V15H17.5C17.7761 15 18 14.7761 18 14.5V12H22V20C22 21.1046 21.1046 22 20 22H12Z" fill="white"/>
</svg> `,
    closet: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
<path d="M20.1096 2.41089H3.8904C3.6096 2.41089 3.38184 2.63865 3.38184 2.91945V21.0807C3.38184 21.3615 3.6096 21.5893 3.8904 21.5893C4.1712 21.5893 4.39896 21.3615 4.39896 21.0807V19.3542H19.6013V21.0807C19.6013 21.3615 19.829 21.5893 20.1098 21.5893C20.3906 21.5893 20.6184 21.3615 20.6184 21.0807V2.91945C20.6184 2.63865 20.3906 2.41089 20.1098 2.41089H20.1096ZM19.601 8.46873H12.5086V6.45681H19.601V8.46873ZM12.5086 9.48585H19.601V11.4978H12.5086V9.48585ZM19.601 5.43969H12.5086V3.42777H19.601V5.43969ZM4.39896 3.42801H11.4914V18.3373H4.39896V3.42801ZM12.5086 12.5146H19.601V18.337H12.5086V12.5146Z" fill="white"/>
<path d="M16.9464 13.7693H15.1632C14.8824 13.7693 14.6547 13.997 14.6547 14.2778C14.6547 14.5586 14.8824 14.7864 15.1632 14.7864H16.9464C17.2272 14.7864 17.455 14.5586 17.455 14.2778C17.455 13.997 17.2272 13.7693 16.9464 13.7693Z" fill="white"/>
</svg>`,
    indoor: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24" viewBox="0 0 24 24" fill="none">
<rect width="24" height="24" fill="url(#pattern0_15615_41174)"/>
<defs>
<pattern id="pattern0_15615_41174" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_15615_41174" transform="scale(0.01)"/>
</pattern>
<image id="image0_15615_41174" width="100" height="100" preserveAspectRatio="none" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAKZklEQVR4Aeydd6wmVRmH94pSFAUsUUQTJKIidimL1Bgk7iKBhLgkEjQxCioJWGIgsQSIIhpM1D8gEInRSFt6X3rvEAgt1NAhQOiEDpfn+Zi7uew350z5ppzLnc3723PmvGfe+s2cmTNn5r5nwfAvqQgMCUkqHQsWDAkZEpJYBBIzZzhChoQkFoHEzBmOkCEhiUUgMXOGI2RISGIRSMycdo6QDpycnp5eGWwB9gIHZLC+OfX3dWBCKyrmXEII9jrg70TjcXAp+Cf4Qwbrl1F/gj4Hg09Sn1M0pxJCgH9MdG8FvwZrgBDJ+w3M27J9qM4NmhMJIairgiMIqTDYVEuRfY9g3yPB+0vt0XOn5BNCID9NjC4BHh0UtegH7HUFstajTJqSTggB/C7RuxFsDCalryLg2kwm1TQpyYQQtCnwO0J2BvgwiNGzMB3IL6e0ThEkZZ2ubDAV7NUjI7mEEKgPEY+TwJ9AzL6X4Zu0taemprYEW7DtVZVt8tjMpZVoVfZJmS4206GYw51bSYA+j9IrwY4gRg/B3JokHAheoj4i6i+CA9n4FrgXxEgd16HzS7FOXfOSSQiBMUBXE4AvghhdDHMjAn8NZS7BuwGG4845lDFaH+aV6F5CmQT1nhCCsRI4iGh4mvIylWouTdP6L7AtAX+MMkr0eZIOi8H+4E0QotVhHIsNh4He7/B7TQgB+CjBOAvsA2KD7AvwlxDkvcHr1EsRfd8A+9F5J1A04O9On/Ow6eOUvVFvCcHxb+D1teA7IEZ3wlxIYI+nrEXsexo7bgK8y6cI0lZwHFcWUvZCvSSEZPwQb71UXZcyRgZyUwJaFMiYjBEPGSZ2MzaKEvsp+lyEjR4xVLulThOCk6sAJwD/i5urgRC9AcNz/04E8hnqjRCynkeQA/gvKWOnvlXgO6b8D3tjdtKtWeosITi2DqZfBPYCMRoNxgRvPxAbjGMygjxkTgN/FJ4qnTEO9oWxG7gM24uOZLo1Q50kBIdG52ZMLjo3j6ZJCFjR5SqiJiN0+OPYCCnBy2d40misw4dt3WgbrScERzwXn4cjnwAx+j/MzQlU0Q0d3ZohdD2IJH8s/6aMkVeDy/BlHxC7GozJKMVrLSEYvjo4BisOA7Hre8/l+xKc3cCL9O2U0PkK+ClK9wCvghA55TK6X8Kv2P1SaP9S7a0kBIM/i/YrwC4gRo/A3IqA/JWyV8KGwzHAKZf7KWM0mlHAx6IZhZiMIK/xhGDo9mjz/uLLlDHystcpEOeuYv3a5c2STlKuZ9Mpl/MpY+Sc21X4unOsUx1eYwnBOKfMveM+FUPWBDHy1/htAvBorFMfPGx6Ar0+hyk6aj9Iv+Pw+yDg6YzNyamRhGCQ80EmwnNsTKZjxK44vQd4bXLz25GAba+DfZG+K9BmilxygPdHeAox+EBuj4qNseCVEoUha9HRS8jvUcboHpib4ehRlHOCMlu9u9f2mM2epi8kFhMP9hMlBAO8oz0FS78JYnQmzI1x8CbKOUWZzY4r+hCz3T4eKcYk1i/KmyghSPY8uyVliLzTdgpkBxx7OtQp1G7CwWLwW/AP4HRGHbivMhYho3LAMtt3wE590SequbQ1rT4go6hHtROCYz4yjU2DOAe1I85UngJB9prA8cgB1ufqf8O9vYE3mXXgvsrwV+4iur8gv9LpBT/eBE7le9mrb5iTS79CtpfPucyixtoJQfDBwEGNYox8xOqU+eljnIIGnHE64xa6OVh6JUO1UVKmA/Yt6Co61Y4pJin65BTQw2PMtxuMiSsr396q+H+thOCI0w2bBnR5KbsNht8R4AebkeszCx/ROhEZ7NcQw2n2S9Dpub+SyMy3bdhJXynGaCFyPYOMMYoaaiUEoU41UOTSzzG46KpkbEcc+BiNJ4MuVxiq62R0fwS9lQgf72aHPUGIfhJixNorJwTjvQlaFBC6DEO96gqwo80umF472qMdpkuH1F1ZOr66DuDsnB1t2j6LlfXSqJwQJDuHE/pFufaWLtUIwx1gndwL7ehzC5+9H0eHOnBfZbB7Lv0MG1wPlsssaAz57AzxFwr2HWPXSUhoHZMzpQ54Y0pKNLg6ZOVAv//Qvi6/xsXAhQ51oHwfMvmkEnFj5KWwfcYYJRr0OTTrEIpVUGydhIRWZTxMwGIrBoNGwPg6yKP7aHRMWr4Yju1ahG3K8Ch8ICDga4H2aHMmN3TFVfkUXCchXjbmGelUel57mbbQw6vLcfiVMgLK9Mlk+ZJPXnfHkrz2Mm2hhIRiFZRZJyEO6nkCQ4dtXt8V21ZdsSHbjt2AZV0qFyGZIRvKKAj5HopVUGadhASFDYzJI9BLQrii8dnJWpReXU3uRYMSsMlpG23zjrtByeVEdZoQnHUd7wGY9lSGZ2hzrdR2bPdN22W2OAk6so/t/UGnMepUGRF3ks+bsNlPFH24lcKRog3agpkj0sY/UtNmim6o64S4hLQbz5rT4mK55qQVSIompGDfOuzKVx11lDS8z3sblhcV13VCnPaIGpQgs1Obu06ID50OJegujqNImrTxECzUZopuqNOEcKf8KvgFrjmAOl3i49/YooclXOX4vkZjQLer3yly6UhatUnb1sDWPUHopo+uzVOnCZkxHyd9OfNGShfLOdDfNcNbofQZiU/1moQyV1Az2vT9kR9pE9C22PKf0Q5t/NdLQmY7gvO+C5LCapSbM1tmm9d5vfeEZB7HVnJkXVovUrBh+G5v62muqCCVI6Si2e/e7qknxCWqPlRqEspMNqM9JKRSLG5loD28SaB94jd6kdEapZ6Q1hxPVfCQkMQyk3pCNuROffcmQfw3BMlS6glxuaYvjTYJZQ4JSTYCiRmW+hGSWLjaN2dISPsxrqRhSEilcLXfOfWE+AaV7443CWW2H9maGlJPyFLu0v24QCHK9iNOS0GylHpCkg1cW4YNCWkrsjXlppKQ0OpxP59U07Xgbl3qChoRYqSSkKMx0Ee5FMvJZ9onLN9qruI3F31XZLZEV5how+y2XupJJIQB2a+6+SknX9AxELfzn++4+2Il1eYIXS6o8F1zdSjYD6btQvt1bvSNJBJiEAjICeAz1Fej3AD4FTo2mydknws2QLK61qN+IvUkKJmEzESD4NR9LW5GROmyS11ljUouIWUNf7f2GxKSWGaHhEQT0j2zTkJCb8X612u69yANjaEPKVQeD+skJHRj9RUetfqHt5ZSzif49dXQBz/9KlKln0ydhPjFTv+WR54iP4f3fRjzCfqMy2NkjCqvAaucEC4VPUL8nMSYBUPDOyJwKrHq5AhRq39Fs+gPpNhvvsKPExijyv5XPkLUQOadfvAjws+5PeAdEfCHujMxqvzNMKXUSog7otCxxK/Khb4XZbf5hmU4vAmxuYCyFtVOiNpQfDvwK9CfY9uvq/2Z0i+Vzifos6/prU8sFgHfxCIM9WiihMyoxIi7wCHg98C/dDCfoM+H4ncjM9ONJGQmMUNZLgKxXkNCYtHpgTckpIegx1QOCYlFpwfekJAegh5TOSQkFp0eeENCegh6TOWQkFh0euANCekh6DGVbwEAAP//ceDkGAAAAAZJREFUAwAvI8kFHmq0NwAAAABJRU5ErkJggg=="/>
</defs>
</svg>`
  }

  // Shared container for progressive qualification step rendering
  let qualificationStepsContainer = null
  let qualificationStylesInjected = false

  const QUALIFICATION_DISPLAY_LABELS = {
    cooling: 'Cooling',
    heating: 'Heating',
    both: 'Heating + Cooling',
    basement: 'Basement',
    crawlspace: 'Crawlspace',
    garage: 'Garage',
    attic: 'Attic',
    closet: 'Closet',
    indoor: 'Indoor',
    small: 'Small (0-1200 sq.ft.)',
    small_mid: 'Small-Mid (1200-1800 sq.ft.)',
    medium: 'Medium (1800-2400 sq.ft.)',
    mid_large: 'Mid-Large (2400-3200 sq.ft.)',
    large: 'Large (3200+ sq.ft.)'
  }

  // eslint-disable-next-line no-unused-vars
  function renderQualificationStep(stepName, result) {
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    // Inject CSS once
    if (!qualificationStylesInjected) {
      const style = document.createElement('style')
      style.textContent = `
        .hq-card {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 10px;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
          animation: lennox-card-in 0.3s ease both;
        }
        .hq-step-label {
          font-size: 11px; font-weight: 600; letter-spacing: 1.2px;
          text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 14px;
        }
        .hq-icon-grid { display: flex; gap: 10px; flex-wrap: wrap; }
        .hq-icon-option {
          flex: 1; min-width: 80px; display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 14px 10px; border-radius: 14px;
          border: 1.5px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
          transition: all 0.2s ease; color: rgba(255,255,255,0.65);
        }
        .hq-icon-option span { font-size: 12px; font-weight: 500; text-align: center; line-height: 1.3; }
        .hq-radio-list { display: flex; flex-direction: column; gap: 8px; }
        .hq-radio-option {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px;
          border: 1.5px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
          transition: all 0.2s ease; color: rgba(255,255,255,0.8);
        }
        .hq-radio-circle {
          width: 20px; height: 20px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.3);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .hq-radio-label { font-size: 13px; font-weight: 500; }
        .hq-radio-range { font-size: 11px; color: rgba(255,255,255,0.45); margin-left: auto; }
        .hq-step-done {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 500; margin-bottom: 10px;
        }
        .hq-step-done-check {
          width: 16px; height: 16px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; color: #fff;
        }
      `
      document.head.appendChild(style)
      qualificationStylesInjected = true
    }

    // Create shared steps container on first call
    if (!qualificationStepsContainer) {
      const wrapper = document.createElement('div')
      wrapper.className = 'swirl-ai-response-container'
      wrapper.innerHTML = '<div id="hq-steps-container"></div>'
      messagesContainer.appendChild(wrapper)
      qualificationStepsContainer = wrapper.querySelector('#hq-steps-container')
    }

    const stepsContainer = qualificationStepsContainer

    // Remove any /turn-rendered selection support card for this field (prevent duplicates)
    const fieldMap = {
      system_type: 'mode',
      install_location: 'location',
      space_size: 'size'
    }
    const turnCard = messagesContainer.querySelector(
      `.swirl-ai-selection-support[data-field="${fieldMap[stepName]}"]`
    )
    if (turnCard) turnCard.remove()

    // Remove any previous active step card
    const activeCard = stepsContainer.querySelector('.hq-active-step')
    if (activeCard) activeCard.remove()

    // Render "done" row for the completed step
    const doneLabels = {
      system_type: 'What are you looking for?',
      install_location: 'Where will it be installed?',
      space_size: 'What size space?'
    }
    const displayValue =
      QUALIFICATION_DISPLAY_LABELS[result.selected_value] ||
      result.selected_value
    const doneRow = document.createElement('div')
    doneRow.className = 'hq-step-done'
    doneRow.innerHTML = `
      <div class="hq-step-done-check">\u2713</div>
      <span>${doneLabels[stepName]}: <strong style="color:rgba(255,255,255,0.75)">${displayValue}</strong></span>
    `
    stepsContainer.appendChild(doneRow)

    // Render next step card if there are next_step_options
    if (result.next_step_options && result.next_step_options.length > 0) {
      const card = document.createElement('div')
      card.className = 'hq-card hq-active-step'

      if (result.next_step_layout === 'icon_row') {
        card.innerHTML = `
          <div class="hq-step-label">${result.next_step_label ||
            'Choose an option'}</div>
          <div class="hq-icon-grid">
            ${result.next_step_options
              .map(
                opt => `
              <div class="hq-icon-option" data-id="${opt.id}">
                ${HOME_QUALIFIER_ICONS[opt.icon] || ''}
                <span>${opt.label}</span>
              </div>
            `
              )
              .join('')}
          </div>
        `
      } else if (result.next_step_layout === 'stacked_rows') {
        card.innerHTML = `
          <div class="hq-step-label">${result.next_step_label ||
            'Choose an option'}</div>
          <div class="hq-radio-list">
            ${result.next_step_options
              .map(
                opt => `
              <div class="hq-radio-option" data-id="${opt.id}">
                <div class="hq-radio-circle"></div>
                <span class="hq-radio-label">${opt.label}</span>
                ${
                  opt.range
                    ? `<span class="hq-radio-range">${opt.range}</span>`
                    : ''
                }
              </div>
            `
              )
              .join('')}
          </div>
        `
      }

      stepsContainer.appendChild(card)
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  function displayLennoxComparisonCards(cards) {
    if (!cards || cards.length === 0) return
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const container = document.createElement('div')
    container.className = 'swirl-ai-response-container'

    container.innerHTML = `
      <style>
        @keyframes lx-compare-in {
          from { opacity:0; transform:translateY(16px) scale(0.97); }
          to   { opacity:1; transform:none; }
        }
        .lx-compare-wrap {
          display: grid;
          grid-template-columns: repeat(${Math.min(cards.length, 3)}, 1fr);
          gap: 12px;
          padding: 2px 0 4px;
          align-items: stretch;
        }
        .lx-compare-card {
          width: 100%;
          height: 100%;
          background: rgba(255,255,255,0.08);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.35);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: lx-compare-in 0.38s cubic-bezier(0.25,0.46,0.45,0.94) both;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
          cursor: pointer;
          transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;
          position: relative;
        }
        .lx-compare-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          pointer-events: none;
        }
        .lx-compare-card:hover {
          transform: translateY(-4px);
          border-color: rgba(200,200,215,0.22);
          box-shadow: 0 1px 0 rgba(255,255,255,0.1) inset, 0 8px 24px rgba(0,0,0,0.5), 0 28px 80px rgba(0,0,0,0.4);
        }
        .lx-compare-img {
          background: linear-gradient(160deg, #1e222c 0%, #171a21 50%, #12151b 100%);
          height: 130px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .lx-compare-img::after {
          content: '';
          position: absolute;
          bottom: 0; left: 20%; right: 20%;
          height: 40px;
          background: radial-gradient(ellipse at center bottom, rgba(255,255,255,0.04) 0%, transparent 70%);
          pointer-events: none;
        }
        .lx-compare-img img { max-height: 95px; max-width: 100%; object-fit: contain; position: relative; z-index: 1; }
        .lx-compare-body {
          padding: 16px 15px 16px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .lx-compare-series {
          font-size: 10px;
          color: #6b717d;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          font-weight: 700;
          margin-bottom: 5px;
          opacity: 0.9;
        }
        .lx-compare-title {
          font-size: 15px;
          font-weight: 700;
          color: #eaecf0;
          line-height: 1.3;
          margin-bottom: 14px;
          letter-spacing: -0.1px;
        }
        .lx-compare-specs {
          display: flex;
          flex-direction: column;
          gap: 0;
          margin-bottom: 12px;
          border-radius: 11px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.08);
        }
        .lx-compare-spec-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 11px;
        }
        .lx-compare-spec-row:not(:last-child) {
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .lx-compare-spec-label { font-size: 11.5px; color: #7a8090; font-weight: 500; }
        .lx-compare-spec-val { font-size: 12px; font-weight: 700; color: #d8dce4; text-align: right; max-width: 58%; letter-spacing: 0.1px; }
        .lx-compare-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 0; margin-top: auto; padding-top: 10px; }
        .lx-compare-pill {
          padding: 4px 11px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.4;
          background: rgba(255,255,255,0.05);
          color: #9aa0ab;
          border: 1px solid rgba(255,255,255,0.1);
        }
      </style>
      <div style="font-size:9px;color:#555b6a;font-weight:700;letter-spacing:2px;margin-bottom:14px;text-transform:uppercase;">Compare Models</div>
      <div class="lx-compare-wrap">
        ${cards
          .map((card, i) => {
            const seerLabel = card.seer2
              ? `${card.seer2} SEER2`
              : card.seer
              ? `${card.seer} SEER`
              : '—'
            const noiseLabel = card.noise ? `${card.noise} dB` : '—'
            const compressor = card.compressor_stages
              ? card.compressor_stages.charAt(0).toUpperCase() +
                card.compressor_stages.slice(1)
              : '—'
            const warranty = card.warranty_compressor_years
              ? `${card.warranty_compressor_years}yr`
              : '—'
            const features = Array.isArray(card.features)
              ? card.features.slice(0, 2)
              : []

            return `
            <div class="lx-compare-card" data-product-id="${
              card.id
            }" style="animation-delay:${i * 0.09}s;">
              <div class="lx-compare-img">
                <img src="${resolveLennoxImageUrl(
                  card.image_url,
                  card.id
                )}" alt="${card.title}" onerror="this.style.opacity='0'" />
              </div>
              <div class="lx-compare-body">
                <div class="lx-compare-series">${card.series}</div>
                <div class="lx-compare-title">${card.title.replace(
                  'Lennox ',
                  ''
                )}</div>
                <div class="lx-compare-specs">
                  <div class="lx-compare-spec-row">
                    <span class="lx-compare-spec-label">Efficiency</span>
                    <span class="lx-compare-spec-val">${seerLabel}</span>
                  </div>
                  <div class="lx-compare-spec-row">
                    <span class="lx-compare-spec-label">Noise</span>
                    <span class="lx-compare-spec-val">${noiseLabel}</span>
                  </div>
                  <div class="lx-compare-spec-row">
                    <span class="lx-compare-spec-label">Compressor</span>
                    <span class="lx-compare-spec-val">${compressor}</span>
                  </div>
                  <div class="lx-compare-spec-row">
                    <span class="lx-compare-spec-label">Warranty</span>
                    <span class="lx-compare-spec-val">${warranty}</span>
                  </div>
                </div>
                ${
                  features.length || card.energy_star
                    ? `
                <div class="lx-compare-pills">
                  ${features
                    .slice(0, 1)
                    .map(
                      f =>
                        `<span class="lx-compare-pill">${f
                          .split(',')[0]
                          .trim()}</span>`
                    )
                    .join('')}
                  ${
                    card.energy_star
                      ? `<span class="lx-compare-pill">Energy Star</span>`
                      : ''
                  }
                </div>`
                    : ''
                }
              </div>
            </div>
          `
          })
          .join('')}
      </div>
    `

    // Click → notify AI of interest
    container.addEventListener('click', e => {
      const card = e.target.closest('.lx-compare-card')
      if (card) {
        const productId = card.dataset.productId
        const matchedCard =
          lastShownLennoxCards.find(c => c.id === productId) ||
          cards.find(c => c.id === productId)
        if (matchedCard) notifyAIOfCardInterest(matchedCard)
      }
    })

    messagesContainer.appendChild(container)
    scrollToBottom()

    // Show one representative video per model in comparison view
    const comparisonVideos = cards.flatMap(card => {
      const modelId = card?.id?.toLowerCase()
      const vids = LENNOX_MODEL_VIDEOS[modelId]
      return vids ? [vids[0]] : []
    })
    if (comparisonVideos.length > 0) {
      setTimeout(
        () => displayMedia({ youtube_references: comparisonVideos }),
        400
      )
    }
  }

  function displayCompetitorComparisonCard(lennoxCard, competitorCard) {
    if (!lennoxCard || !competitorCard) return
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const formatSeer = card =>
      card.seer2
        ? `${card.seer2} SEER2`
        : card.seer
        ? `${card.seer} SEER`
        : 'N/A'
    const formatNoise = card => (card.noise_db ? `${card.noise_db} dB` : 'N/A')
    const formatWarranty = card => {
      if (card.warranty_compressor_years && card.warranty_parts_years)
        return `${card.warranty_compressor_years}yr comp / ${card.warranty_parts_years}yr parts`
      if (card.warranty_compressor_years)
        return `${card.warranty_compressor_years}yr compressor`
      return 'N/A'
    }
    const formatCompressor = card => card.compressor_stages || 'N/A'
    const formatRefrigerant = card => card.refrigerant_type || 'N/A'

    const rows = [
      {
        label: 'Efficiency',
        lennox: formatSeer(lennoxCard),
        competitor: formatSeer(competitorCard)
      },
      {
        label: 'Noise',
        lennox: formatNoise(lennoxCard),
        competitor: formatNoise(competitorCard)
      },
      {
        label: 'Compressor',
        lennox: formatCompressor(lennoxCard),
        competitor: formatCompressor(competitorCard)
      },
      {
        label: 'Warranty',
        lennox: formatWarranty(lennoxCard),
        competitor: formatWarranty(competitorCard)
      },

      {
        label: 'Refrigerant',
        lennox: formatRefrigerant(lennoxCard),
        competitor: formatRefrigerant(competitorCard)
      }
    ]

    const container = document.createElement('div')
    container.className = 'swirl-ai-response-container'

    container.innerHTML = `
      <style>
        @keyframes lx-vs-in {
          from { opacity:0; transform:translateY(12px) scale(0.98); }
          to   { opacity:1; transform:none; }
        }
        .lx-vs-wrap {
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          overflow: hidden;
          background: rgba(255, 255, 255, .08);
    border: 1px solid rgba(255, 255, 255, .08);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
          animation: lx-vs-in 0.32s cubic-bezier(0.25,0.46,0.45,0.94) both;
        }
        .lx-vs-header {
          display: grid;
          grid-template-columns: 110px 1fr 1fr;
        background: rgba(255, 255, 255, .08);
    border: 1px solid rgba(255, 255, 255, .08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .lx-vs-header-label {
          padding: 12px 10px;
          font-size: 14px;
          font-weight: 700;

          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: flex;
          align-items: center;
        }
        .lx-vs-header-brand {
          padding: 12px 10px;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-left: 1px solid rgba(255,255,255,0.08);
        }
        .lx-vs-header-model {
          font-size: 9px;
          font-weight: 400;
          color: rgba(255,255,255,0.4);
          margin-top: 1px;
        }
        .lx-vs-row {
          display: grid;
          grid-template-columns: 110px 1fr 1fr;
          border-bottom: 1px solid rgba(255,255,255,0.06);
         background: rgba(255, 255, 255, .08);
    border: 1px solid rgba(255, 255, 255, .08);
        }
        .lx-vs-row:last-child { border-bottom: none; }
        .lx-vs-row-label {
          padding: 9px 10px;
          font-size: 14px;

          font-weight: 400;
          display: flex;
          align-items: center;
         background: rgba(255, 255, 255, .08);
    border: 1px solid rgba(255, 255, 255, .08);
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .lx-vs-row-val {
          padding: 9px 10px;
          font-size: 14px;
          font-weight: 600;
          color: #ffffff;
          display: flex;
          align-items: center;
          border-left: 1px solid rgba(255,255,255,0.06);
        }
      </style>
      <div class="lx-vs-wrap">
        <div class="lx-vs-header">
          <div class="lx-vs-header-label">Spec</div>
          <div class="lx-vs-header-brand">
            ${lennoxCard.title || 'Lennox'}
            <span class="lx-vs-header-model">${lennoxCard.series ||
              'Lennox'}</span>
          </div>
          <div class="lx-vs-header-brand">
            ${competitorCard.title || competitorCard.brand}
            <span class="lx-vs-header-model">${competitorCard.series ||
              competitorCard.brand}</span>
          </div>
        </div>
        ${rows
          .map(
            row => `
          <div class="lx-vs-row">
            <div class="lx-vs-row-label">${row.label}</div>
            <div class="lx-vs-row-val">${row.lennox}</div>
            <div class="lx-vs-row-val">${row.competitor}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `

    messagesContainer.appendChild(container)
    scrollToBottom()
  }

  // ===================================================
  // REVIEW LINK CARDS (journey media — title + source + url)
  // ===================================================

  function displayReviewLinks(reviews) {
    if (!reviews?.length) return
    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    clearOnFirstEvent()

    const container = document.createElement('div')
    container.className = 'swirl-ai-response-container'
    container.innerHTML = `
      <style>
        @keyframes lx-link-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        .lx-review-link {
          display:flex; align-items:flex-start; gap:10px;
          background:#fff; border:1px solid #e8e8ed; border-radius:12px;
          padding:12px 14px; cursor:pointer; text-decoration:none;
          box-shadow:0 1px 4px rgba(0,0,0,0.05); min-width:220px; max-width:260px;
          transition:box-shadow 0.15s ease, transform 0.15s ease;
          animation:lx-link-in 0.3s ease both;
          font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;
        }
        .lx-review-link:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.1); }
        .lx-review-link-icon { width:32px;height:32px;border-radius:8px;background:#f5f5f7;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .lx-review-link-body { flex:1; min-width:0; }
        .lx-review-link-source { font-size:10px;color:#86868b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px; }
        .lx-review-link-title { font-size:12px;font-weight:600;color:#1d1d1f;line-height:1.4; }
      </style>
      <div style="display:flex;gap:10px;overflow-x:auto;padding:4px 2px;scrollbar-width:none;">
        ${reviews
          .map(
            (r, i) => `
          <a href="${
            r.url
          }" target="_blank" rel="noopener" class="lx-review-link" style="animation-delay:${i *
              0.07}s;">
            <div class="lx-review-link-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#f59e0b"/></svg>
            </div>
            <div class="lx-review-link-body">
              <div class="lx-review-link-source">${r.source}</div>
              <div class="lx-review-link-title">${r.title}</div>
            </div>
          </a>
        `
          )
          .join('')}
      </div>
    `
    messagesContainer.appendChild(container)
    scrollToBottom()
  }

  // ===================================================
  // REVIEWS DISPLAY
  // ===================================================

  function displayReviews(reviewsData) {
    console.log('[Swirl AI] ⭐ Reviews carousel detected')
    console.log('[Swirl AI] Displaying reviews:', reviewsData)

    // Clear previous conversation on first event
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const reviews = reviewsData.reviews || []

    if (reviews.length === 0) {
      console.log('[Swirl AI] No reviews to display')
      return
    }

    // PostHog: Log reviews displayed
    logMediaDisplayed({ type: 'reviews', count: reviews.length })

    const reviewsContainer = document.createElement('div')
    reviewsContainer.className = 'swirl-ai-reviews-container'

    reviewsContainer.innerHTML = `
      <div class="swirl-ai-reviews-header">
        <div class="swirl-ai-reviews-header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/>
          </svg>
        </div>
        <h3 class="swirl-ai-reviews-header-text">Reviews</h3>
      </div>
      <div class="swirl-ai-reviews-swiper-wrapper">
        <div class="swirl-ai-reviews-swiper swiper">
          <div class="swiper-wrapper">
          ${reviews
            .map(review => {
              const quote =
                review.quote || review.text || review.review_text || ''
              const source =
                review.source ||
                review.reviewer ||
                review.author ||
                review.reviewer_name ||
                ''

              return `
                <div class="swiper-slide">
                  <div class="swirl-ai-review-card">
                    <div class="swirl-ai-review-quote-icon">
                      <svg width="34" height="30" viewBox="0 0 34 30" fill="none">
                        <path d="M0 30V15.5556C0 6.96667 5.66667 0 14.2222 0V4.44444C8.88889 4.44444 4.44444 8.88889 4.44444 14.2222V17.7778H14.2222V30H0ZM19.7778 30V15.5556C19.7778 6.96667 25.4444 0 34 0V4.44444C28.6667 4.44444 24.2222 8.88889 24.2222 14.2222V17.7778H34V30H19.7778Z" fill="#E82E34" fill-opacity="0.8"/>
                      </svg>
                    </div>
                    <div class="swirl-ai-review-content">
                      <p class="swirl-ai-review-text">${quote}</p>
                    </div>
                    ${
                      source
                        ? `<div class="swirl-ai-review-author">
                      <p class="swirl-ai-review-author-name" style="font-size:11px;opacity:0.7;font-style:italic;">${source}</p>
                    </div>`
                        : ''
                    }
                  </div>
                </div>
              `
            })
            .join('')}
          </div>
        </div>
        <!-- Navigation Buttons (Desktop Only) -->
        <button class="swirl-ai-reviews-nav-prev" aria-label="Previous review">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
            <path d="M18 11L13 16L18 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="swirl-ai-reviews-nav-next" aria-label="Next review">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
            <path d="M14 11L19 16L14 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `

    messagesContainer.appendChild(reviewsContainer)

    // Initialize Swiper
    loadSwiperLibrary()
      .then(() => {
        // eslint-disable-next-line no-new
        new Swiper(reviewsContainer.querySelector('.swirl-ai-reviews-swiper'), {
          slidesPerView: 1.3,
          spaceBetween: 16,
          freeMode: true,
          grabCursor: true,
          navigation: {
            nextEl: reviewsContainer.querySelector(
              '.swirl-ai-reviews-nav-next'
            ),
            prevEl: reviewsContainer.querySelector('.swirl-ai-reviews-nav-prev')
          },
          breakpoints: {
            640: { slidesPerView: 1.5 },
            768: { slidesPerView: 2.2 },
            1024: { slidesPerView: 3 },
            1400: { slidesPerView: 3.5 }
          }
        })
      })
      .catch(() => {})

    scrollToBottom()
  }

  // ===================================================
  // MEDIA DISPLAY (IMAGES & VIDEOS - Simple UI)
  // ===================================================

  function displayMedia(mediaData) {
    const formattedMedia = {
      videos: mediaData.videos || mediaData.youtube_references || [],
      images: mediaData.images || []
    }

    // Detection logs
    if (formattedMedia.videos.length > 0) {
      console.log('[Swirl AI] 🎥 Videos carousel detected')
      // PostHog: Log videos displayed
      logMediaDisplayed({ type: 'videos', count: formattedMedia.videos.length })
    }
    if (formattedMedia.images.length > 0) {
      console.log('[Swirl AI] 🖼️ Images carousel detected')
      // PostHog: Log images displayed
      logMediaDisplayed({ type: 'images', count: formattedMedia.images.length })
    }

    console.log('[Swirl AI] Displaying media:', mediaData)
    console.log('[Swirl AI] Videos count:', formattedMedia.videos.length)
    console.log('[Swirl AI] Images count:', formattedMedia.images.length)

    // Clear previous conversation on first event
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    addMediaCarousel(messagesContainer, formattedMedia)
  }

  function addMediaCarousel(container, mediaData) {
    console.log('[Swirl AI] Adding media carousel')

    // Videos section
    if (mediaData.videos && mediaData.videos.length > 0) {
      const videosContainer = document.createElement('div')
      videosContainer.className = 'swirl-ai-media-container'

      videosContainer.innerHTML = `
        <div class="swirl-ai-media-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 3.993C3 3.445 3.445 3 3.993 3H20.007C20.555 3 21 3.445 21 3.993V20.007C20.9997 20.2703 20.895 20.5227 20.7089 20.7089C20.5227 20.895 20.2703 20.9997 20.007 21H3.993C3.72972 20.9997 3.4773 20.895 3.29114 20.7089C3.10497 20.5227 3.00026 20.2703 3 20.007V3.993ZM5 5V19H19V5H5ZM10.622 8.415L15.501 11.667C15.5559 11.7035 15.6009 11.753 15.632 11.8111C15.6631 11.8692 15.6794 11.9341 15.6794 12C15.6794 12.0659 15.6631 12.1308 15.632 12.1889C15.6009 12.247 15.5559 12.2965 15.501 12.333L10.621 15.585C10.5608 15.6249 10.491 15.6477 10.4189 15.6512C10.3468 15.6546 10.2751 15.6384 10.2114 15.6043C10.1477 15.5703 10.0945 15.5197 10.0573 15.4578C10.02 15.396 10.0003 15.3252 10 15.253V8.747C10.0001 8.67465 10.0199 8.60369 10.0572 8.54168C10.0944 8.47967 10.1478 8.42893 10.2116 8.39486C10.2755 8.36079 10.3473 8.34467 10.4196 8.34822C10.4919 8.35177 10.5618 8.37485 10.622 8.415V8.415Z" fill="white"/>
          </svg>
          <span>Videos</span>
        </div>
        <div class="swirl-ai-media-swiper-wrapper">
          <div class="swirl-ai-media-swiper swiper">
            <div class="swiper-wrapper">
            ${mediaData.videos
              .map(video => {
                const thumbnailUrl =
                  video.thumbnail_url ||
                  video.thumbnail ||
                  `https://img.youtube.com/vi/${video.video_id ||
                    video.videoId}/maxresdefault.jpg`
                // eslint-disable-next-line no-unused-vars
                const videoUrl =
                  video.timestamped_url ||
                  video.url ||
                  video.video_url ||
                  `https://www.youtube.com/watch?v=${video.video_id ||
                    video.videoId}`

                // Calculate dynamic clip positioning
                const totalSeconds = video.totalSeconds || 0
                const clipDuration = video.clipDuration || 0
                const startTime = video.startTime || video.start_time || 0

                // Convert clip duration to MM:SS format
                const formatTime = seconds => {
                  const mins = Math.floor(seconds / 60)
                  const secs = Math.floor(seconds % 60)
                  return `${mins}:${secs.toString().padStart(2, '0')}`
                }
                const durationDisplay =
                  clipDuration > 0
                    ? formatTime(clipDuration)
                    : video.duration || '2:02'

                // Calculate clip position and width as percentage
                let clipPosition = 0 // left position
                let clipWidth = 20.76 // default width

                if (totalSeconds > 0 && clipDuration > 0) {
                  clipPosition = (startTime / totalSeconds) * 100
                  clipWidth = (clipDuration / totalSeconds) * 100

                  // Ensure clip doesn't overflow container
                  if (clipPosition + clipWidth > 100) {
                    clipPosition = 100 - clipWidth
                  }
                  if (clipPosition < 0) {
                    clipPosition = 0
                  }
                }

                // Calculate duration label position (center of clip)
                let durationLabelPosition = clipPosition + clipWidth / 2

                // Clamp label position to keep it inside container (10% to 90%)
                // This prevents the label from going outside on edges
                if (durationLabelPosition < 10) {
                  durationLabelPosition = 10
                } else if (durationLabelPosition > 90) {
                  durationLabelPosition = 90
                }

                // If no features in response, add 2 static default features
                const features =
                  video.features && video.features.length > 0
                    ? video.features
                    : []

                return `
                  <div class="swiper-slide">
                    <div class="swirl-ai-video-card" data-video-index="${mediaData.videos.indexOf(
                      video
                    )}">
                      <div class="swirl-ai-video-thumbnail">
                        <img src="${thumbnailUrl}" alt="${video.title ||
                  'Video'}" />
                        <svg class="swirl-ai-video-expand" width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M13.75 2.5h3.75v3.75m0 7.5v3.75h-3.75M6.25 17.5H2.5v-3.75m0-7.5V2.5h3.75" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div class="swirl-ai-video-duration-wrapper">
                          <span class="swirl-ai-video-duration" style="left: ${durationLabelPosition}%">${durationDisplay}</span>
                          <div class="swirl-ai-video-progress">
                            <div class="swirl-ai-video-progress-bg"></div>
                            <div class="swirl-ai-video-progress-fill" style="left: ${clipPosition}%; width: ${clipWidth}%"></div>
                          </div>
                        </div>
                      </div>
                      <div class="swirl-ai-video-features">
                        ${features
                          .map(
                            feature => `
                          <div class="swirl-ai-video-feature">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M6.66667 10.6667L3.33333 7.33333L2.39333 8.27333L6.66667 12.5467L14.6667 4.54667L13.7267 3.60667L6.66667 10.6667Z" fill="#13B178"/>
                            </svg>
                            <span>${feature}</span>
                          </div>
                        `
                          )
                          .join('')}
                      </div>
                    </div>
                  </div>
                `
              })
              .join('')}
            </div>
          </div>
          <!-- Navigation Buttons (Desktop Only) -->
          <button class="swirl-ai-media-nav-prev" aria-label="Previous video">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
              <path d="M18 11L13 16L18 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="swirl-ai-media-nav-next" aria-label="Next video">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
              <path d="M14 11L19 16L14 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `

      container.appendChild(videosContainer)

      // Initialize Swiper for videos
      loadSwiperLibrary()
        .then(() => {
          // eslint-disable-next-line no-new
          new Swiper(videosContainer.querySelector('.swirl-ai-media-swiper'), {
            slidesPerView: 1.5,
            spaceBetween: 8,
            freeMode: true,
            grabCursor: true,
            navigation: {
              nextEl: videosContainer.querySelector('.swirl-ai-media-nav-next'),
              prevEl: videosContainer.querySelector('.swirl-ai-media-nav-prev')
            },
            breakpoints: {
              768: { slidesPerView: 2.2, spaceBetween: 12 },
              1024: { slidesPerView: 3.2, spaceBetween: 12 },
              1280: { slidesPerView: 3.2, spaceBetween: 12 }
            }
          })
        })
        .catch(() => {})

      // Add click handlers to video cards
      const videoCards = videosContainer.querySelectorAll(
        '.swirl-ai-video-card'
      )
      videoCards.forEach(card => {
        card.style.cursor = 'pointer'
        card.addEventListener('click', () => {
          const videoIndex = parseInt(card.getAttribute('data-video-index'))
          openVideoModal(mediaData.videos, videoIndex)
        })
      })
    }

    // Images section
    if (mediaData.images && mediaData.images.length > 0) {
      const imagesContainer = document.createElement('div')
      imagesContainer.className = 'swirl-ai-media-container'

      imagesContainer.innerHTML = `
        <div class="swirl-ai-media-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.828 21L4.808 21.02L4.787 21H2.992C2.72881 20.9997 2.4765 20.895 2.29049 20.7088C2.10448 20.5226 2 20.2702 2 20.007V3.993C2.00183 3.73038 2.1069 3.47902 2.29251 3.29322C2.47813 3.10742 2.72938 3.00209 2.992 3H21.008C21.556 3 22 3.445 22 3.993V20.007C21.9982 20.2696 21.8931 20.521 21.7075 20.7068C21.5219 20.8926 21.2706 20.9979 21.008 21H4.828ZM20 15V5H4V19L14 9L20 15ZM20 17.828L14 11.828L6.828 19H20V17.828ZM8 11C7.46957 11 6.96086 10.7893 6.58579 10.4142C6.21071 10.0391 6 9.53043 6 9C6 8.46957 6.21071 7.96086 6.58579 7.58579C6.96086 7.21071 7.46957 7 8 7C8.53043 7 9.03914 7.21071 9.41421 7.58579C9.78929 7.96086 10 8.46957 10 9C10 9.53043 9.78929 10.0391 9.41421 10.4142C9.03914 10.7893 8.53043 11 8 11Z" fill="white"/>
          </svg>
          <span>Images</span>
        </div>
        <div class="swirl-ai-media-swiper-wrapper">
          <div class="swirl-ai-media-swiper swiper">
            <div class="swiper-wrapper">
            ${mediaData.images
              .map((image, index) => {
                const imageUrl = image.url || image
                const imageAlt =
                  image.alt ||
                  image.title ||
                  image.description ||
                  'Vehicle Image'

                return `
                  <div class="swiper-slide">
                    <div class="swirl-ai-media-card" data-image-index="${index}">
                      <div class="swirl-ai-media-wrapper">
                        <img src="${imageUrl}" alt="${imageAlt}" class="swirl-ai-media-image" />
                      </div>
                      ${
                        image.title
                          ? `<div class="swirl-ai-media-features"><p>${image.title}</p></div>`
                          : ''
                      }
                    </div>
                  </div>
                `
              })
              .join('')}
            </div>
          </div>
          <!-- Navigation Buttons (Desktop Only) -->
          <button class="swirl-ai-media-nav-prev" aria-label="Previous image">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
              <path d="M18 11L13 16L18 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="swirl-ai-media-nav-next" aria-label="Next image">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
              <path d="M14 11L19 16L14 21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `

      container.appendChild(imagesContainer)

      // Initialize Swiper for images
      loadSwiperLibrary()
        .then(() => {
          // eslint-disable-next-line no-new
          new Swiper(imagesContainer.querySelector('.swirl-ai-media-swiper'), {
            slidesPerView: 1.5,
            spaceBetween: 8,
            freeMode: true,
            grabCursor: true,
            navigation: {
              nextEl: imagesContainer.querySelector('.swirl-ai-media-nav-next'),
              prevEl: imagesContainer.querySelector('.swirl-ai-media-nav-prev')
            },
            breakpoints: {
              768: { slidesPerView: 2.2, spaceBetween: 12 },
              1024: { slidesPerView: 3.2, spaceBetween: 12 },
              1280: { slidesPerView: 3.2, spaceBetween: 12 }
            }
          })
        })
        .catch(() => {})

      // Add click handlers to image cards
      const imageCards = imagesContainer.querySelectorAll(
        '.swirl-ai-media-card'
      )
      imageCards.forEach(card => {
        card.style.cursor = 'pointer'
        card.addEventListener('click', () => {
          const imageIndex = parseInt(card.getAttribute('data-image-index'))
          openImageModal(mediaData.images, imageIndex)
        })
      })
    }

    scrollToBottom()
  }

  // ===================================================
  // BOOKING SLOTS DISPLAY (GRID LAYOUT)
  // ===================================================

  function displayBookingSlots(bookingSlotsData) {
    console.log('[Swirl AI] 📅 Booking slots detected')

    if (!bookingSlotsData || bookingSlotsData.length === 0) {
      console.log('[Swirl AI] No booking slots to display')
      return
    }

    // Clear previous conversation on first event
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) {
      console.error('[Swirl AI] ❌ Messages container not found')
      return
    }

    const slotsContainer = document.createElement('div')
    slotsContainer.className = 'swirl-ai-booking-slots-container'

    // Calendar icon SVG
    const calendarIcon = `
      <svg class="swirl-ai-calendar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 3H21C21.2652 3 21.5196 3.10536 21.7071 3.29289C21.8946 3.48043 22 3.73478 22 4V20C22 20.2652 21.8946 20.5196 21.7071 20.7071C21.5196 20.8946 21.2652 21 21 21H3C2.73478 21 2.48043 20.8946 2.29289 20.7071C2.10536 20.5196 2 20.2652 2 20V4C2 3.73478 2.10536 3.48043 2.29289 3.29289C2.48043 3.10536 2.73478 3 3 3H7V1H9V3H15V1H17V3ZM20 9H4V19H20V9ZM15 5H9V7H7V5H4V7H20V5H17V7H15V5Z" fill="white"/>
      </svg>
    `

    slotsContainer.innerHTML = `
      <div class="swirl-ai-booking-slots-grid">
        ${bookingSlotsData
          .map(slot => {
            const date = slot.date || ''
            const times = slot.times || []

            return `
            <div class="swirl-ai-booking-slot-card" data-date="${date}">
              <div class="swirl-ai-slot-date-header">
                ${calendarIcon}
                <span class="swirl-ai-slot-date">${date}</span>
              </div>
              <div class="swirl-ai-slot-times">
                ${times
                  .map(
                    time => `
                  <button class="swirl-ai-time-pill" data-time="${time}">
                    ${time}
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
          })
          .join('')}
      </div>
    `

    messagesContainer.appendChild(slotsContainer)

    // Add click handlers to time pills
    addTimeSlotClickHandlers(slotsContainer)

    scrollToBottom()
  }

  function addTimeSlotClickHandlers(container) {
    const timePills = container.querySelectorAll('.swirl-ai-time-pill')

    timePills.forEach(pill => {
      pill.addEventListener('click', e => {
        e.stopPropagation()

        const card = pill.closest('.swirl-ai-booking-slot-card')
        const date = card.dataset.date
        const time = pill.dataset.time

        // Remove previous selection
        container.querySelectorAll('.swirl-ai-time-pill').forEach(p => {
          p.classList.remove('selected')
        })

        // Mark as selected
        pill.classList.add('selected')

        console.log(`[Swirl AI] 📅 Selected slot: ${date} at ${time}`)

        // Auto-confirm booking on time slot selection
        const productId =
          currentModelId ||
          lastConfirmedCard?.id ||
          lastShownLennoxCards[0]?.id ||
          'el16xc1'
        initiateVisitBooking(productId)
      })
    })
  }

  // [OLD FLOW] handleTimeSlotSelection — sent the slot choice as a voice message to the AI.
  // Replaced by the "Confirm Your Visit" button which calls initiateVisitBooking directly.
  // function handleTimeSlotSelection(date, time) {
  //   console.log(`[Swirl AI] 📅 User selected slot: ${date} at ${time}`)
  //   logBookingSlotSelected({ date, time })
  //   if (!dataChannel || dataChannel.readyState !== 'open') return
  //   const selectionMessage = `I'd like to book for ${date} at ${time}`
  //   const wasAISpeaking = isAISpeaking
  //   if (isAISpeaking) {
  //     try { dataChannel.send(JSON.stringify({ type: 'response.cancel' })) } catch (e) {}
  //     isAISpeaking = false
  //   }
  //   if (wasAISpeaking) { pendingMessageAfterCancel = selectionMessage }
  //   else { sendGenericUserMessage(selectionMessage) }
  // }

  // ===================================================
  // LOCATIONS LIST DISPLAY (Before Booking)
  // ===================================================

  function displayLocations(locations) {
    console.log('[Swirl AI] 📍 Locations list detected')
    console.log('[Swirl AI] Displaying locations:', locations)

    // Clear previous conversation on first event
    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    if (!locations || locations.length === 0) {
      console.log('[Swirl AI] No locations to display')
      return
    }

    const locationsContainer = document.createElement('div')
    locationsContainer.className = 'swirl-ai-locations-container'

    locationsContainer.innerHTML = `
      <div class="swirl-ai-locations-grid">
        ${locations
          .map((location, index) => {
            const name = location.name || 'Lennox Dealer'
            const address = location.address || ''
            const imageUrl = location.image_url || ''

            return `
            <div class="swirl-ai-location-card" data-location-index="${index}">
              ${
                imageUrl
                  ? `
                <div class="swirl-ai-location-image">
                  <img src="${imageUrl}" alt="${name}" />
                </div>
              `
                  : ''
              }
              <div class="swirl-ai-location-content">
                <h3 class="swirl-ai-location-name">${name}</h3>
                ${
                  address
                    ? `
                  <div class="swirl-ai-location-address-wrapper">
                    <svg class="swirl-ai-location-pin-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 8C8.4243 8 8.83136 7.83143 9.13137 7.53137C9.43138 7.23131 9.6 6.82435 9.6 6.4C9.6 5.97565 9.43138 5.56869 9.13137 5.26863C8.83136 4.96857 8.4243 4.8 8 4.8C7.57565 4.8 7.16869 4.96857 6.86863 5.26863C6.56857 5.56869 6.4 5.97565 6.4 6.4C6.4 6.82435 6.56857 7.23131 6.86863 7.53137C7.16869 7.83143 7.57565 8 8 8Z" fill="white"/>
                      <path d="M8 0.8C6.51478 0.8 5.0904 1.39 4.04025 2.44025C2.99 3.4904 2.4 4.91478 2.4 6.4C2.4 8.8592 4.2592 11.4872 8 14.8976C11.7408 11.4872 13.6 8.8592 13.6 6.4C13.6 4.91478 13.01 3.4904 11.9597 2.44025C10.9096 1.39 9.48522 0.8 8 0.8Z" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p class="swirl-ai-location-address">${address}</p>
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          `
          })
          .join('')}
      </div>
    `

    messagesContainer.appendChild(locationsContainer)

    // Add click event listeners to each location card
    const locationCards = locationsContainer.querySelectorAll(
      '.swirl-ai-location-card'
    )
    locationCards.forEach(card => {
      card.style.cursor = 'pointer'
      card.addEventListener('click', () => {
        const locationIndex = parseInt(card.getAttribute('data-location-index'))
        const selectedLocation = locations[locationIndex]
        handleLocationCardClick(selectedLocation)
      })
    })

    scrollToBottom()
  }

  /**
   * Handles location card click - interrupts speech and sends location to AI
   */
  function handleLocationCardClick(location) {
    console.log('[Swirl AI] 📍 Location card clicked:', location)
    // PostHog: Log location selected
    logLocationSelected({ locationName: location.name || 'unknown' })

    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error('[Swirl AI] ❌ Cannot send - DataChannel not ready')
      return
    }

    // Construct message to send to AI - clearly indicate SELECTION for booking flow
    const locationName = location.name || 'this location'

    const selectionMessage = `I select ${locationName} for my Lennox visit booking`

    // ===== LOCATION-SPECIFIC: Stop ALL current speech and clear buffer =====
    console.log('[Swirl AI] 🛑 LOCATION CARD: Interrupting AI speech')

    // Cancel any active AI response
    const wasAISpeaking = isAISpeaking
    if (isAISpeaking) {
      console.log('[Swirl AI] 🛑 Sending cancellation request')

      try {
        dataChannel.send(JSON.stringify({ type: 'response.cancel' }))
      } catch (error) {
        console.warn('[Swirl AI] ⚠️ Cancel request failed:', error)
      }

      isAISpeaking = false
    }

    // Send location selection message (will wait for response.cancelled if cancellation was sent)
    if (wasAISpeaking) {
      // Store message to send after cancellation completes
      pendingMessageAfterCancel = selectionMessage
      console.log(
        '[Swirl AI] ⏳ Location selection queued - will send after cancellation completes'
      )
    } else {
      // No active response, send immediately
      console.log('[Swirl AI] ✅ Sending location selection immediately')
      sendGenericUserMessage(selectionMessage)
    }
  }

  // ===================================================
  // NEXT STEPS DISPLAY (Post-Booking)
  // ===================================================

  function displayNextSteps(steps) {
    console.log('[Swirl AI] 📋 Next steps detected')
    console.log('[Swirl AI] Displaying next steps:', steps)

    clearOnFirstEvent()

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    const stepsContainer = document.createElement('div')
    stepsContainer.className = 'swirl-ai-next-steps-container'

    const stepItems = steps
      .map(
        (step, index) => `
      <div class="swirl-ai-next-step-item">
        <div class="swirl-ai-next-step-number">${index + 1}</div>
        <div class="swirl-ai-next-step-content">
          ${
            step.title
              ? `<h4 class="swirl-ai-next-step-title">${step.title}</h4>`
              : ''
          }
          <p class="swirl-ai-next-step-desc">${step.description || step}</p>
        </div>
      </div>
    `
      )
      .join('')

    stepsContainer.innerHTML = `
      <div class="swirl-ai-next-steps-header">
        <h3 class="swirl-ai-next-steps-title">What's Next</h3>
      </div>
      <div class="swirl-ai-next-steps-list">
        ${stepItems}
      </div>
    `

    messagesContainer.appendChild(stepsContainer)
    scrollToBottom()
  }

  // ===================================================
  // PREDICTIVE QUESTIONS DISPLAY
  // ===================================================

  function displayPredictiveQuestions(suggestions) {
    console.log('[Swirl AI] 💡 Predictive questions detected')
    console.log('[Swirl AI] Displaying suggestions:', suggestions)

    const messagesContainer = document.querySelector('.swirl-ai-chat-messages')
    if (!messagesContainer) return

    // Remove any existing predictive questions
    const existing = messagesContainer.querySelector(
      '.swirl-ai-predictive-container'
    )
    if (existing) existing.remove()

    const predictiveContainer = document.createElement('div')
    predictiveContainer.className = 'swirl-ai-predictive-container'

    const chips = suggestions
      .map(
        suggestion => `
      <button class="swirl-ai-predictive-chip" data-question="${suggestion}">
        ${suggestion}
      </button>
    `
      )
      .join('')

    predictiveContainer.innerHTML = `
      <div class="swirl-ai-predictive-label">You might also want to know:</div>
      <div class="swirl-ai-predictive-chips">
        ${chips}
      </div>
    `

    messagesContainer.appendChild(predictiveContainer)

    // Add click handlers to chips
    const chipButtons = predictiveContainer.querySelectorAll(
      '.swirl-ai-predictive-chip'
    )
    chipButtons.forEach(chip => {
      chip.addEventListener('click', () => {
        const question = chip.getAttribute('data-question')
        console.log('[Swirl AI] 💡 Predictive question clicked:', question)

        // Remove the predictive container after selection
        predictiveContainer.remove()

        // Send the question to AI
        if (dataChannel && dataChannel.readyState === 'open') {
          sendGenericUserMessage(`Tell me about ${question}`)
        }
      })
    })

    scrollToBottom()
  }

  // ===================================================
  // UTILITIES
  // ===================================================

  function updateStatusMessage(text) {
    console.log('[Swirl AI] Status:', text)
    const statusElement = document.querySelector('.swirl-ai-status-message')
    if (statusElement) {
      statusElement.textContent = text
      statusElement.style.display = 'block'
    }
  }

  function hideStatusMessages() {
    const statusElement = document.querySelector('.swirl-ai-status-message')
    if (statusElement) statusElement.style.display = 'none'
  }

  function showError(message) {
    console.error('[Swirl AI] Error:', message)

    // Hide loading status on error
    hideLoadingStatus()
  }

  // ===================================================
  // AUTO-START
  // ===================================================

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
