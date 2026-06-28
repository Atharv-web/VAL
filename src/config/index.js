import 'dotenv/config'

const config = {
  SECRETS: {
    JWT: process.env.JWT_SECRET,
    JWTEXP: process.env.JWT_EXPIRY_DATE
  },
  DEBUG: true,
  EMAIL: false,
  SMS: false,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  DEBUG_LLM: process.env.DEBUG_LLM,
  WEB_BASE_URL: process.env.WEB_BASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
}

export default config
