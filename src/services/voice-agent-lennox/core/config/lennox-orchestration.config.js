export const LENNOX_ORCHESTRATION_CONFIG = {
  endpoint: '/voice-agent-lennox',
  rateLimit: {
    windowMs: 60000,
    maxRequestsPerIp: 300
  },
  competitorCatalog: {
    table: 'competitors'
  }
}
