const EMAIL_PREFIX_PATTERN = /\b(?:my\s+email(?:\s+address)?\s+is|email(?:\s+address)?\s+is|it(?:'s|\s+is))\b/gi

const SPOKEN_REPLACEMENTS = [
  [/\b(?:at\s+the\s+rate|attherate|at\s+rate|at\s+symbol|atsymbol)\b/gi, '@'],
  [/\b(?:at)\b/gi, '@'],
  [/\b(?:dot)\b/gi, '.'],
  [/\b(?:underscore|under\s+score)\b/gi, '_'],
  [/\b(?:hyphen|dash|minus)\b/gi, '-'],
  [/\b(?:plus)\b/gi, '+']
]

const EMAIL_CANDIDATE_PATTERN = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i

const STRICT_EMAIL_PATTERN = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export const canonicalizeSpokenEmail = transcript => {
  let normalized = String(transcript || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  normalized = normalized
    .replace(EMAIL_PREFIX_PATTERN, '')
    .replace(/[<>(){}[\],;:"'`!?]/g, ' ')

  // eslint-disable-next-line no-unused-vars
  for (const [pattern, value] of SPOKEN_REPLACEMENTS) {
    normalized = normalized.replace(pattern, ` ${value} `)
  }

  normalized = normalized
    .replace(/\s+@\s+/g, '@')
    .replace(/\s+\.\s+/g, '.')
    .replace(/\s+_\s+/g, '_')
    .replace(/\s+-\s+/g, '-')
    .replace(/\s+\+\s+/g, '+')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
}

export const isStrictEmail = candidate =>
  STRICT_EMAIL_PATTERN.test(String(candidate || ''))

export const extractEmailFromTranscript = transcript => {
  const canonicalized = canonicalizeSpokenEmail(transcript)
  const match = canonicalized.match(EMAIL_CANDIDATE_PATTERN)
  const candidate = match ? match[0] : null
  const isValid = !!candidate && isStrictEmail(candidate)

  return {
    raw: String(transcript || ''),
    canonicalized,
    candidate,
    isValid,
    email: isValid ? candidate : null
  }
}
