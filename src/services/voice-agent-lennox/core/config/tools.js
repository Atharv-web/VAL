// Tools config - defines tools available to the voice agent
// Lennox AC Qualification + Booking Flow

export const TOOLS_CONFIG = [
  // ========================================================================
  // QUALIFICATION PHASE TOOLS (3 steps)
  // ========================================================================
  {
    type: 'function',
    name: 'show_comfort_needs',
    description:
      'Display cooling need options (Cooling Only, Heating Only, Both Heating & Cooling) in the UI. Use this as the FIRST qualification question. Backend enforces this during QUALIFICATION phase. The UI will render icon-based selection cards. User voice selection is captured and sent to the backend.',
    parameters: {
      type: 'object',
      properties: {
        display_type: {
          type: 'string',
          enum: ['icons', 'radio'],
          description:
            'Card layout: "icons" for large icon buttons (default), "radio" for stacked list.'
        }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'show_installation_location',
    description:
      'Display installation location options (Basement, Attic, Garage, Crawlspace, Closet/Indoor) in the UI. Use this as the SECOND qualification question, after user confirms their cooling need. Backend enforces this during QUALIFICATION phase. The UI renders icon-based selection cards. Location determines optimal placement and unit type.',
    parameters: {
      type: 'object',
      properties: {
        display_type: {
          type: 'string',
          enum: ['icons', 'radio'],
          description:
            'Card layout: "icons" for large icon buttons (default), "radio" for stacked list.'
        }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'show_space_size',
    description:
      'Display space size options (Small, Small-Mid, Medium, Mid-Large, Large) in the UI. Use this as the THIRD and FINAL qualification question. Backend enforces this during QUALIFICATION phase. Size determines the unit tonnage. Once this is confirmed, homeInfo is complete and RECOMMENDATION phase begins.',
    parameters: {
      type: 'object',
      properties: {
        display_type: {
          type: 'string',
          enum: ['icons', 'radio'],
          description:
            'Card layout: "icons" for icon buttons with ranges (default), "radio" for stacked list.'
        }
      },
      required: []
    }
  },

  // ========================================================================
  // PRODUCT RECOMMENDATION & CHECKOUT
  // ========================================================================
  {
    type: 'function',
    name: 'webmcp_checkout_automation',
    description:
      'Automate checkout UI actions when the user explicitly asks you to proceed on their behalf. Use this ONLY after clear verbal consent (e.g. "go ahead", "yes do it", "handle it"). This triggers WebMCP-style UI automation in the client.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['confirm_purchase', 'pay_with_google_pay', 'auto'],
          description:
            'Checkout action to automate. Use "confirm_purchase" for the selected product card button, "pay_with_google_pay" for the review-order payment button, or "auto" when step is obvious from current screen state.'
        }
      },
      required: ['action']
    }
  },
  {
    type: 'function',
    name: 'show_products',
    description:
      'Show Lennox AC product cards with images. Use after qualification is complete or when browsing/comparing models. IMPORTANT: When the user asks to compare two Lennox models, see the difference between them, or asks "which is better between X and Y", call this with model_ids containing both model IDs — the UI will automatically render a side-by-side comparison table. Backend blocks this tool during qualification phase.',
    parameters: {
      type: 'object',
      properties: {
        filter_series: {
          type: 'string',
          enum: ['all', 'signature', 'elite', 'merit'],
          description:
            'Filter by product series. Use "all" by default unless user specifies a series. Use "signature" for Dave Lennox Signature Collection, "elite" for Elite Series, "merit" for Merit Series.'
        },
        model_id: {
          type: 'string',
          description:
            'Single specific model ID to show (e.g. "sl25kcv"). Use for one specific model.'
        },
        model_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Multiple specific model IDs to show side by side (e.g. ["el17xc1", "ml17xc1"]). Use when: (1) recommending 2-3 specific models, or (2) user asks to compare/see difference between specific Lennox models. Always prefer this over filter_series when you know the exact model IDs.'
        },
        limit: {
          type: 'number',
          description:
            'Max number of products to show. Default: 1 for specific model, 4 for series/all.'
        }
      },
      required: ['filter_series']
    }
  },
  {
    type: 'function',
    name: 'suggest_sku',
    description:
      'Recommend a SKU once homeInfo (mode, location, size) is complete. Backend enforces this requirement.',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Recommended Lennox SKU/model id (e.g. "el16xc1").'
        },
        filter_series: {
          type: 'string',
          enum: ['all', 'signature', 'elite', 'merit'],
          description: 'Optional fallback series filter.'
        },
        limit: {
          type: 'number',
          description: 'Optional number of cards to display.'
        }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'show_competitor_comparison',
    description: `Show a side-by-side comparison card between a Lennox unit and a specific competitor model.

Call this immediately when the user names a specific competitor model (e.g. "Carrier Infinity 26", "Trane XV20i", "Trane XR13"). The card renders first — then speak ONE short line about the key differentiator. Do NOT narrate specs the card already shows. Do NOT speak before calling this tool.

Do NOT call this tool when:
- The user only names a brand without a specific model — ask which model first
- The user says they don't know or want a general comparison — handle in voice only
- During or after checkout`,
    parameters: {
      type: 'object',
      properties: {
        competitor_model_id: {
          type: 'string',
          description:
            'The competitor model ID from the competitor data (e.g. "carrier-infinity-26", "trane-xv20i"). Must be a specific model, not a brand.'
        },
        lennox_model_id: {
          type: 'string',
          description:
            'The Lennox model ID to compare against (e.g. "sl28xcv"). If not specified, the system uses the currently active model from the conversation.'
        }
      },
      required: ['competitor_model_id']
    }
  },
  // [NEW FLOW] collect_user_info — stores user contact details for booking
  {
    type: 'function',
    name: 'collect_user_info',
    description:
      'Store the user\'s contact information during the booking flow. Call this EACH TIME you collect a new field — do NOT wait until all 4 are gathered. Pass all known fields each time (include previously collected ones). The backend tracks which fields are complete and will instruct you to read back and confirm when all 4 are collected. After user confirms all fields, call confirm_user_info with {"confirmed_all": true} — the date/time picker will appear automatically via the tool result.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full name of the user (null if not yet collected)'
        },
        phone: {
          type: 'string',
          description: 'Phone number of the user (null if not yet collected)'
        },
        address: {
          type: 'string',
          description: 'Street address of the user (null if not yet collected)'
        },
        email: {
          type: 'string',
          description: 'Email address of the user (null if not yet collected)'
        }
      },
      required: []
    }
  },
  {
    type: 'function',
    name: 'confirm_user_info',
    description:
      'Update confirmation status after reading user details back. Use {"confirmed_all": true} when user confirms all fields. If user says one field is wrong, call with {"incorrect_field":"name|phone|address|email"} to reset only that field.',
    parameters: {
      type: 'object',
      properties: {
        confirmed_all: {
          type: 'boolean',
          description:
            'Set true only when the user confirms every field is correct.'
        },
        incorrect_field: {
          type: 'string',
          enum: ['name', 'phone', 'address', 'email'],
          description: 'Single field user marked incorrect.'
        }
      },
      required: []
    }
  },
  // [NEW FLOW] confirm_booking — finalizes the dealer visit booking
  {
    type: 'function',
    name: 'confirm_booking',
    description:
      'Confirm the dealer visit booking once the user has selected a date and time and clicked "Schedule Your Visit". This triggers the Visit Confirmed card and simulates sending a confirmation email.',
    parameters: {
      type: 'object',
      properties: {
        selected_date: {
          type: 'string',
          description:
            'The date the user selected for the visit (e.g. "Thursday, February 27")'
        },
        selected_time: {
          type: 'string',
          description:
            'The time slot the user selected (e.g. "10:00 AM–12:00 PM")'
        },
        product_id: {
          type: 'string',
          description:
            'The Lennox product ID the user is interested in (e.g. "el16xc1" or "xc21")'
        },
        dealer_name: {
          type: 'string',
          description: 'Name of the selected dealer'
        },
        dealer_city: {
          type: 'string',
          description: 'City of the selected dealer'
        }
      },
      required: ['selected_date', 'selected_time', 'product_id']
    }
  },
  {
    type: 'function',
    name: 'schedule_visit',
    description:
      'Alias for final visit scheduling. Backend validates all four user fields exist and are confirmed before executing.',
    parameters: {
      type: 'object',
      properties: {
        selected_date: {
          type: 'string',
          description:
            'The date the user selected for the visit (e.g. "Thursday, February 27")'
        },
        selected_time: {
          type: 'string',
          description:
            'The time slot the user selected (e.g. "10:00 AM–12:00 PM")'
        },
        product_id: {
          type: 'string',
          description:
            'The Lennox product ID the user is interested in (e.g. "el16xc1" or "xc21")'
        },
        dealer_name: {
          type: 'string',
          description: 'Name of the selected dealer'
        },
        dealer_city: {
          type: 'string',
          description: 'City of the selected dealer'
        }
      },
      required: ['selected_date', 'selected_time', 'product_id']
    }
  },
  {
    type: 'function',
    name: 'show_journey_media',
    description: `Show journey media cards.

Use "all" after recommendation/detail to show videos + reviews.
Use "videos" for explainer/demo intent.
Use "reviews" for social-proof/trust intent.
Backend blocks this during qualification phase.`,
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'A concise description of what the user is currently experiencing, asking, or feeling — written in plain language (e.g. "user is curious about how variable-speed units work and wants to see one in action", "user expressed doubt about whether Lennox is worth the price", "user is comparing Lennox vs Carrier and wants real-world opinions"). The system will match this against available media to find the best fit.'
        },
        type: {
          type: 'string',
          enum: ['all', 'videos', 'reviews'],
          description:
            'all: returns both videos and reviews in one call (preferred). videos: YouTube walkthroughs and explainers only. reviews: written owner/expert reviews only.'
        }
      },
      required: ['type']
    }
  }
]
