// Logger - central pino logger with env-driven level and per-module child loggers

import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

// Verbosity is controlled at runtime via LOG_LEVEL, never by editing code
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')

// Dev: pretty, human-readable lines. Prod: newline-delimited JSON to stdout
// (the canonical pino setup — ship JSON, prettify out of the hot path).
const transport = isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }

export const logger = pino({
  level,
  base: { service: 'voice-agent-lennox' },
  // Never let a token or key leak into logs
  redact: ['*.apiKey', '*.authorization', 'req.headers.authorization'],
  transport
})

// Tag a logger with its module name — mirrors the existing [MODULE] prefixes,
// but as a queryable field instead of a baked-in string
export const createLogger = moduleName => logger.child({ module: moduleName })
