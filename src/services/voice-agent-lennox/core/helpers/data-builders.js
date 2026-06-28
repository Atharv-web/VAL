// Data builders - Lennox helper utilities for UI payloads

// Generate available booking slots for the next 6 days (including today)
// Phase 1 / R3 note: per-session stability is provided by getOrCreateBookingSlots
// (session-state.js), which memoizes one result per session. This generator is left
// as-is on purpose — wrapping it in a cache is the minimal, correct fix; a seeded
// PRNG here would add no behavior the cache doesn't already guarantee.
export const generateBookingSlots = () => {
  const slots = []
  const today = new Date()

  const morningSlots = [
    '09:00',
    '09:30',
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00'
  ]

  const afternoonSlots = [
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00'
  ]

  for (let i = 0; i < 6; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)

    const morningTime =
      morningSlots[Math.floor(Math.random() * morningSlots.length)]
    const afternoonTime =
      afternoonSlots[Math.floor(Math.random() * afternoonSlots.length)]

    slots.push({
      date: formatDate(date),
      times: [morningTime, afternoonTime]
    })
  }

  return slots
}

const formatDate = date => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

// ============================================================================
// QUALIFICATION CARD BUILDERS
// ============================================================================

// 1. Comfort needs (cooling, heating, both)
export const buildComfortNeedsCards = () => {
  return {
    type: 'qualification_cards',
    step: 1,
    field: 'mode',
    layout: 'icon_list',
    options: [
      {
        id: 'heating',
        value: 'heating',
        label: 'Heating Only'
      },
      {
        id: 'cooling',
        value: 'cooling',
        label: 'Cooling Only'
      },
      {
        id: 'both',
        value: 'heating_cooling',
        label: 'Heating + Cooling'
      }
    ]
  }
}

// 2. Installation location (basement, attic, garage, etc.)
export const buildInstallationLocationCards = () => {
  return {
    type: 'qualification_cards',
    step: 2,
    field: 'location',
    layout: 'icon_list',
    options: [
      {
        id: 'basement',
        value: 'basement',
        label: 'Basement'
      },
      {
        id: 'attic',
        value: 'attic',
        label: 'Attic'
      },
      {
        id: 'garage',
        value: 'garage',
        label: 'Garage'
      },
      {
        id: 'crawlspace',
        value: 'crawlspace',
        label: 'Crawlspace'
      },
      {
        id: 'closet',
        value: 'closet',
        label: 'Closet'
      },
      {
        id: 'indoor',
        value: 'indoor',
        label: 'Indoor'
      }
    ]
  }
}

// 3. Space size (small, medium, large, etc.)
export const buildSpaceSizeCards = () => {
  return {
    type: 'qualification_cards',
    step: 3,
    field: 'size',
    layout: 'icon_list',
    options: [
      {
        id: 'small',
        value: 'small',
        label: 'Small (0-1200 sq.ft.)'
      },
      {
        id: 'small_mid',
        value: 'small_mid',
        label: 'Small-Mid (1200-1800 sq.ft.)'
      },
      {
        id: 'medium',
        value: 'medium',
        label: 'Medium (1800-2400 sq.ft.)'
      },
      {
        id: 'mid_large',
        value: 'mid_large',
        label: 'Mid-Large (2400-3200 sq.ft.)'
      },
      {
        id: 'large',
        value: 'large',
        label: 'Large (3200+ sq.ft.)'
      }
    ]
  }
}
