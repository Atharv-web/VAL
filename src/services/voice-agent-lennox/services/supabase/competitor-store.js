// Competitor catalog store - Supabase-backed competitor catalog with a local
// JSON seed/fallback. The tier JSON files are the source of truth for seeding;
// Supabase is the shared cache. Falls back to in-memory + files when Supabase
// is not configured.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSupabase } from '../../../../config/supabase.js'

const TABLE = 'competitors'

// Process-local cache of the flattened competitor array.
let competitorCatalogMemory = null

const getCompetitorDataDirs = () => {
  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  return [
    path.join(
      process.cwd(),
      'src/services/voice-agent-lennox/services/competitor-data'
    ),
    path.join(baseDir, '..', 'competitor-data'),
    path.join(process.cwd(), 'competitor-data')
  ]
}

// Read the tier JSON files into normalized rows: { model_id, tier, data }.
const loadCompetitorRowsFromFiles = () => {
  const candidateDirs = getCompetitorDataDirs()

  // eslint-disable-next-line no-unused-vars
  for (const competitorDataDir of candidateDirs) {
    if (!fs.existsSync(competitorDataDir)) continue

    const rows = []

    try {
      const tierFiles = fs
        .readdirSync(competitorDataDir)
        .filter(file => file.endsWith('.json'))
      if (!tierFiles.length) continue

      // eslint-disable-next-line no-unused-vars
      for (const file of tierFiles) {
        const raw = fs.readFileSync(path.join(competitorDataDir, file), 'utf8')
        const parsed = JSON.parse(raw)
        const tier = parsed?.tier || parsed?.tier_level || null
        if (Array.isArray(parsed?.competitors)) {
          // eslint-disable-next-line no-unused-vars
          for (const competitor of parsed.competitors) {
            if (!competitor?.id) continue
            rows.push({ model_id: competitor.id, tier, data: competitor })
          }
        }
      }

      if (rows.length) {
        console.log(
          `[COMPETITOR STORE] Loaded ${rows.length} competitor entries from ${competitorDataDir}`
        )
        return rows
      }

      console.warn(
        `[COMPETITOR STORE] No competitor entries found in ${competitorDataDir}`
      )
    } catch (err) {
      console.warn(
        '[COMPETITOR STORE] Failed to load competitor catalog files:',
        err.message
      )
    }
  }

  console.warn(
    '[COMPETITOR STORE] No valid competitor catalog files found in candidate directories'
  )
  return []
}

export const getCachedCompetitorCatalog = () => competitorCatalogMemory

// Persist the competitor rows to Supabase (upsert by model_id).
const cacheCompetitorCatalog = async rows => {
  if (!Array.isArray(rows) || !rows.length) return false

  const supabase = getSupabase()
  if (!supabase) return false

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'model_id' })
    if (error) {
      console.warn(
        '[COMPETITOR STORE] Failed to cache competitor catalog:',
        error.message
      )
      return false
    }
    return true
  } catch (err) {
    console.warn(
      '[COMPETITOR STORE] Failed to cache competitor catalog:',
      err.message
    )
    return false
  }
}

const hydrateCompetitorCatalogCache = async () => {
  if (competitorCatalogMemory?.length) return competitorCatalogMemory

  const supabase = getSupabase()
  if (!supabase) return null

  try {
    const { data, error } = await supabase.from(TABLE).select('data')
    if (error) {
      console.warn(
        '[COMPETITOR STORE] Failed to hydrate competitor catalog:',
        error.message
      )
      return null
    }

    const competitors = (data || []).map(row => row.data)
    if (competitors.length) {
      competitorCatalogMemory = competitors
      console.log(
        `[COMPETITOR STORE] Hydrated competitor catalog from Supabase (${competitors.length} entries)`
      )
      return competitorCatalogMemory
    }
  } catch (err) {
    console.warn(
      '[COMPETITOR STORE] Failed to hydrate competitor catalog:',
      err.message
    )
  }

  return null
}

// Load the local catalog from files, populate the in-memory cache, and seed
// Supabase in the background.
export const loadLocalCompetitorCatalog = () => {
  if (competitorCatalogMemory?.length) return competitorCatalogMemory

  const rows = loadCompetitorRowsFromFiles()
  if (Array.isArray(rows) && rows.length) {
    competitorCatalogMemory = rows.map(row => row.data)
    void cacheCompetitorCatalog(rows)
  }

  return competitorCatalogMemory || []
}

// Return the competitor catalog, preferring Supabase, then local files.
export const ensureCompetitorCatalogCache = async () => {
  const hydrated = await hydrateCompetitorCatalogCache()
  if (Array.isArray(hydrated) && hydrated.length) return hydrated

  const localCatalog = loadLocalCompetitorCatalog()
  if (Array.isArray(localCatalog) && localCatalog.length) return localCatalog

  return []
}

// Best-effort startup warm-up so the first comparison call can use the cached catalog.
void ensureCompetitorCatalogCache()
