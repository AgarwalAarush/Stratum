/** Only explicitly promoted current beliefs may appear as decision authority. */
export function canonicalCausalVersions<T extends Record<string, unknown>>(rows: T[], enabled: boolean): T[] {
  if (!enabled) return []
  return currentWorldVersions(rows).filter(row => ['active','monitoring'].includes(String(row.state)) && object(row.freshness).canonical === true)
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const PRIMARY_RESEARCH_AUTHORITY = { version: 1, worldUse: 'questions_and_documents_only' } as const

/** Select the latest version before interpreting its state. An invalidation must
 * suppress the older active belief rather than revive it. */
export function currentWorldVersions<T extends Record<string, unknown>>(rows: T[], cutoff?: string): T[] {
  const current = new Map<string,T>()
  for (const row of [...rows].sort((a,b) => String(b.created_at ?? b.as_of).localeCompare(String(a.created_at ?? a.as_of)))) {
    if (row.source_kind !== 'world_node' || (cutoff && (![row.created_at,row.as_of].every(value => Number.isFinite(Date.parse(String(value))) && Date.parse(String(value)) <= Date.parse(cutoff))))) continue
    if (!current.has(String(row.causal_key))) current.set(String(row.causal_key),row)
  }
  return [...current.values()]
}

/** Preserve original packets in storage. This projection strips analytical World
 * claims before either company generation or canonical decision assembly. */
export function primaryResearchPacket<T extends object>(packet: T): T {
  const raw = packet as Record<string, unknown>
  const origin = object(raw.worldOrigin)
  const questions = [origin.decisive_questions, origin.decisiveQuestions, origin.expectations_question]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return { ...packet, marketTheses: [], worldOrigin: Object.keys(origin).length ? {
    id: origin.id ?? null, authority: 'shadow', mayAuthorizeCapital: false,
    decisive_questions: [...new Set(questions)].slice(0, 12),
    // URLs are discovery leads; only independently collected packet sources can be cited.
    documentUrls: Array.isArray(origin.documentUrls) ? origin.documentUrls.filter(url => typeof url === 'string' && /^https?:\/\//.test(url)).slice(0, 20) : [],
  } : null }
}

export function needsIndependentResearch(note: unknown, packet: unknown): boolean {
  const content = object(object(note).content ?? note), raw = object(packet)
  const authority = object(content.evidenceAuthority)
  if (authority.version === PRIMARY_RESEARCH_AUTHORITY.version && authority.worldUse === PRIMARY_RESEARCH_AUTHORITY.worldUse) return false
  return Boolean(content.worldContextOrigin || raw.worldOrigin || (Array.isArray(raw.marketTheses) && raw.marketTheses.length))
}

/** No legacy World-influenced narrative is smuggled into a frozen manifest. The
 * immutable original remains addressable for historical review and reconstruction. */
export function canonicalResearchNote<T extends object>(note: T | null, packet: unknown): T | null {
  if (!note || needsIndependentResearch(note, packet)) return null
  const row = note as Record<string, unknown>, content = object(row.content)
  const { worldContextOrigin: _origin, ...clean } = content
  void _origin
  return { ...note, content: clean }
}
