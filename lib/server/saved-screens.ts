import { MAX_SAVED_SCREENS, parseSavedScreenName, parseSavedScreenerQuery } from '../markets/saved-screens.ts'
import type { SavedScreenerScreen } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function normalizeScreen(row: Record<string, unknown>): SavedScreenerScreen {
  return {
    id: String(row.id),
    name: parseSavedScreenName(row.name),
    query: parseSavedScreenerQuery(row.query),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function ensurePersistence(ownerId: string) {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  return supabase
}

export async function fetchSavedScreenerScreens(ownerId: string): Promise<SavedScreenerScreen[]> {
  const supabase = ensurePersistence(ownerId)
  const { data, error } = await supabase.from('saved_screener_screens')
    .select('id,name,query,created_at,updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`Unable to load saved screens: ${error.message}`)
  return (data ?? []).flatMap((row) => {
    try { return [normalizeScreen(row)] } catch { return [] }
  })
}

export async function createSavedScreenerScreen(
  ownerId: string,
  input: { name: unknown; query: unknown },
): Promise<SavedScreenerScreen> {
  const supabase = ensurePersistence(ownerId)
  const existing = await fetchSavedScreenerScreens(ownerId)
  if (existing.length >= MAX_SAVED_SCREENS) throw new Error(`You can save up to ${MAX_SAVED_SCREENS} screens`)
  const name = parseSavedScreenName(input.name)
  const query = parseSavedScreenerQuery(input.query)
  const { data, error } = await supabase.from('saved_screener_screens').insert({ owner_id: ownerId, name, query })
    .select('id,name,query,created_at,updated_at').single()
  if (error || !data) throw new Error(`Unable to save screen: ${error?.message ?? 'unknown error'}`)
  return normalizeScreen(data)
}

export async function updateSavedScreenerScreen(
  ownerId: string,
  id: string,
  input: { name?: unknown; query?: unknown },
): Promise<SavedScreenerScreen> {
  const supabase = ensurePersistence(ownerId)
  if (!id) throw new Error('Saved screen is required')
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) update.name = parseSavedScreenName(input.name)
  if (input.query !== undefined) update.query = parseSavedScreenerQuery(input.query)
  if (Object.keys(update).length === 1) throw new Error('No screen changes were provided')
  const { data, error } = await supabase.from('saved_screener_screens').update(update)
    .eq('id', id).eq('owner_id', ownerId).select('id,name,query,created_at,updated_at').maybeSingle()
  if (error) throw new Error(`Unable to update screen: ${error.message}`)
  if (!data) throw new Error('Saved screen was not found')
  return normalizeScreen(data)
}

export async function deleteSavedScreenerScreen(ownerId: string, id: string): Promise<void> {
  const supabase = ensurePersistence(ownerId)
  if (!id) throw new Error('Saved screen is required')
  const { error } = await supabase.from('saved_screener_screens').delete().eq('id', id).eq('owner_id', ownerId)
  if (error) throw new Error(`Unable to delete screen: ${error.message}`)
}
