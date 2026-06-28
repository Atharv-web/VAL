// WebRTC Tools Service
// Lennox-only tool surface for session setup and fallback tool execution

import { TOOLS_CONFIG } from '../core/config/tools.js'
import { buildDynamicSystemPrompt } from '../config/prompts.js'

const CHECKOUT_ACTIONS = ['confirm_purchase', 'pay_with_google_pay', 'auto']

// Get tools configured for the Lennox voice agent
const getTools = () => {
  return TOOLS_CONFIG
}

// Get session configuration for WebRTC client
export const getSessionConfig = (voice = 'marin') => {
  const instructions = buildDynamicSystemPrompt()
  const tools = getTools()

  console.log('[LENNOX WEBRTC TOOLS] Session config generated:', {
    voice,
    tools_count: tools.length,
    tool_names: tools.map(tool => tool.name)
  })

  return {
    instructions,
    tools,
    voice,
    modalities: ['text', 'audio'],
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    turn_detection: {
      type: 'server_vad',
      threshold: 0.85,
      prefix_padding_ms: 300,
      silence_duration_ms: 2000,
      create_response: true
    },
    input_audio_transcription: {
      model: 'whisper-1'
    },
    temperature: 0.8,
    max_response_output_tokens: 800
  }
}

// Execute a fallback tool call from WebRTC client
export const executeToolCall = async (
  toolName,
  toolArgs = {},
  modelConfig = null
) => {
  const modelName = modelConfig?.name || 'Lennox'
  console.log(
    `[VOICE AGENT] Executing fallback tool handler: ${toolName} (${modelName})`
  )

  try {
    if (toolName === 'webmcp_checkout_automation') {
      const action = toolArgs?.action || 'auto'
      if (!CHECKOUT_ACTIONS.includes(action)) {
        return {
          success: false,
          error: `Invalid action '${action}'. Must be one of: ${CHECKOUT_ACTIONS.join(
            ', '
          )}`
        }
      }

      return {
        success: true,
        has_webmcp_action: true,
        webmcp_action: action,
        context:
          '[Checkout automation action executed in UI. Keep speaking naturally and briefly confirm progress to the user.]'
      }
    }

    // ========================================================================
    // QUALIFICATION PHASE TOOLS (3 steps)
    // ========================================================================
    if (toolName === 'show_comfort_needs') {
      const { buildComfortNeedsCards } = await import(
        '../core/helpers/data-builders.js'
      )
      const cards = buildComfortNeedsCards()
      console.log(
        '[VOICE AGENT] show_comfort_needs - Rendering comfort needs cards'
      )
      return {
        success: true,
        tool: 'show_comfort_needs',
        ui_components: [cards],
        context:
          '[Cards are now visible on screen. DO NOT repeat the question — the user can see the options. Wait silently for their selection.]'
      }
    }

    if (toolName === 'show_installation_location') {
      const { buildInstallationLocationCards } = await import(
        '../core/helpers/data-builders.js'
      )
      const cards = buildInstallationLocationCards()
      console.log(
        '[VOICE AGENT] show_installation_location - Rendering location cards'
      )
      return {
        success: true,
        tool: 'show_installation_location',
        ui_components: [cards],
        context:
          '[Cards are now visible on screen. DO NOT repeat the question — the user can see the options. Wait silently for their selection.]'
      }
    }

    if (toolName === 'show_space_size') {
      const { buildSpaceSizeCards } = await import(
        '../core/helpers/data-builders.js'
      )
      const cards = buildSpaceSizeCards()
      console.log('[VOICE AGENT] show_space_size - Rendering space size cards')
      return {
        success: true,
        tool: 'show_space_size',
        ui_components: [cards],
        context:
          '[Cards are now visible on screen. DO NOT repeat the question — the user can see the options. Wait silently for their selection.]'
      }
    }

    // ========================================================================
    // OTHER LENNOX TOOLS (require /tools controller path)
    // ========================================================================
    const lennoxTools = new Set([
      'show_products',
      'suggest_sku',
      'show_competitor_comparison',
      'collect_user_info',
      'confirm_user_info',
      'confirm_booking',
      'schedule_visit',
      'show_space_size',
      'show_installation_location',
      'show_comfort_needs'
    ])

    if (lennoxTools.has(toolName)) {
      return {
        success: false,
        error: `Tool '${toolName}' must be executed through the Lennox /tools controller path`
      }
    }

    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    }
  } catch (error) {
    console.error(`[VOICE AGENT] Error executing ${toolName}:`, error)
    return {
      success: false,
      error: error.message,
      context:
        'Sorry, I had trouble getting that information. Let me try to help with what I know.'
    }
  }
}
