import * as Sentry from '@sentry/node'
import { json, urlencoded } from 'body-parser'
import compression from 'compression'
import cors from 'cors'
import express, { Router } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { startSessionCleanup as startLennoxVoiceAgentSessionCleanup } from './services/voice-agent-lennox/voice-agent-lennox.helper.js'
import voiceAgentLennoxRouter from './services/voice-agent-lennox/voice-agent-lennox.router.js'

import {
  conflict,
  created,
  error,
  forbidden,
  ok,
  unauthorized
} from './utils/express-helper'
import { ping } from './utils/ping.js'

require('dotenv').config()

// create express server
export const app = express()

// Sentry Middleware
app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.tracingHandler())

app.disable('x-powered-by')

app.use(cors())
app.use(json({ limit: '5mb' }))
app.use(express.static(__dirname))

// Serve public folder for voice-agent assets
const publicPath = path.join(process.cwd(), 'public')
app.use(express.static(publicPath))

app.use(urlencoded({ extended: true }))
app.use(morgan('dev'))

// gzip comperssion
// only compress non-EventStream responses
const compress = compression({
  filter: (req, res) => {
    const accept = req.headers['accept'] || ''
    if (accept.includes('text/event-stream')) {
      // skip compressing SSE endpoints
      return false
    }
    return compression.filter(req, res)
  }
})

app.use(compress)

// security guard
app.use(helmet())

const router = Router()
router.use(created, error, unauthorized, ok, conflict, forbidden)
app.use(created, error, unauthorized, ok, conflict, forbidden)

router.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept')
  res.header('Access-Control-Max-Age', '1728000')
  next()
})

// Source:  https://docs.sentry.io/platforms/node/guides/express/
app.use(Sentry.Handlers.errorHandler())
app.get('/ping', ping)

// Voice Agent routes (Lennox)
app.use('/voice-agent/lennox', voiceAgentLennoxRouter)
app.use('/voice-agent-lennox', voiceAgentLennoxRouter)
startLennoxVoiceAgentSessionCleanup()

// Serve voice agent UI for model pages
app.get('/voice-agent/:modelId', (req, res) => {
  const modelPath = path.join(
    publicPath,
    'voice-agent',
    req.params.modelId,
    'index.html'
  )
  res.sendFile(modelPath)
})
