import * as Sentry from '@sentry/node'
import * as Tracing from '@sentry/tracing'
import { app } from './app'
import config from './config'

require('dotenv').config()

let server = null

const gracefulShutdown = signal => {
  console.log(`\n${signal} received, shutting down...`)
  if (server) {
    server.close()
  }
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

const start = async () => {
  try {
    Sentry.init({
      dsn: process.env.SENTRY_URL,
      integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Tracing.Integrations.Express({ app })
      ],

      tracesSampleRate: 1.0
    })

    server = app.listen(config.PORT, () => {
      console.log(`REST API on http://localhost:${config.PORT}/api`)
    })
  } catch (e) {
    console.error(e)
  }
}

start()
