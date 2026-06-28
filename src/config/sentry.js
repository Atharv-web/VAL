import * as Sentry from '@sentry/node'

// Source: https://docs.sentry.io/platforms/node/guides/express/
export const sentry = (err, req) => {
  Sentry.withScope(scope => {
    scope.setUser(req.user)
    scope.setContext('HEADERS', req.headers)
    scope.setExtra('ErrorStringify', JSON.stringify(err))
    Sentry.captureException(err)
  })
}
