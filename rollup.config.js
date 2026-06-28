import { fork } from 'child_process'
import path from 'path'
import babel from 'rollup-plugin-babel'
import localResolve from 'rollup-plugin-local-resolve'

const dev =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'build'

// Custom run plugin with proper cleanup (fixes @rollup/plugin-run orphan process issue)
const runWithCleanup = (opts = {}) => {
  let input
  let proc

  const killProc = () => {
    if (proc) {
      proc.kill()
      proc = null
    }
  }

  // Register cleanup handlers
  process.on('SIGINT', () => {
    killProc()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    killProc()
    process.exit(0)
  })
  process.on('exit', killProc)

  return {
    name: 'run-with-cleanup',
    buildStart(options) {
      let inputs = options.input
      if (typeof inputs === 'string') inputs = [inputs]
      if (typeof inputs === 'object') inputs = Object.values(inputs)
      input = path.resolve(inputs[0])
    },
    writeBundle(outputOptions, bundle) {
      const dir = outputOptions.dir || path.dirname(outputOptions.file)
      const entryFileName = Object.keys(bundle).find(fileName => {
        const chunk = bundle[fileName]
        return chunk.isEntry && chunk.facadeModuleId === input
      })

      if (entryFileName) {
        killProc()
        proc = fork(path.join(dir, entryFileName), opts.args || [], {
          execArgv: opts.execArgv || []
        })
      }
    }
  }
}

export default {
  input: 'src/server.js',
  output: {
    file: 'run.js',
    format: 'cjs',
    inlineDynamicImports: true
  },
  plugins: [
    babel(),
    localResolve(),
    dev &&
      runWithCleanup({
        execArgv: ['-r', 'dotenv/config']
      })
  ],
  external: [
    '@sentry/node',
    '@sentry/profiling-node',
    '@sentry/tracing',
    'cors',
    'dotenv',
    'dotenv/config',
    'express',
    'compression',
    'helmet',
    'body-parser',
    'morgan',
    'pg',
    'ioredis',
    'posthog-node',
    'pino',
    'pino-pretty',
    'moment',
    'moment-timezone',
    'jsonwebtoken',
    'joi',
    'lodash',
    'axios',
    'redis',
    '@langchain/core/prompts',
    '@langchain/core/runnables',
    '@langchain/openai',
    'zod',
    '@langchain/community/vectorstores/azure_aisearch',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-ses',
    '@aws-sdk/credential-provider-imds',
    '@aws-sdk/credential-provider-ini',
    '@aws-sdk/credential-provider-node',
    '@aws-sdk/credential-provider-sso',
    '@aws-sdk/credential-provider-web-identity',
    '@aws-sdk/client-s3',
    'langsmith/wrappers',
    'langsmith/trace',
    'langsmith/traceable',
    'langchain/llms/azure',
    'openai',
    'node:fs',
    'fs',
    'fs/promises',
    'path',
    'node:path',
    'node:url',
    'url',
    'crypto',
    'langsmith',
    'langsmith/evaluation',
    'node-fetch',
    '@azure/search-documents',
    'xlsx',
    'ws',
    'multer',
    'uuid',
    'langfuse'
  ]
}

// https://hoangvvo.com/blog/node-es6-without-nodemon-and-babel/

// package.json
//   > scripts
// "start": "node bundle.js",
// "build": "NODE_ENV=production rollup -c",cls
// "dev": "rollup -c -w"
