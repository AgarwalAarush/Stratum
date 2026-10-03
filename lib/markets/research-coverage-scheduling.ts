import { CURRENT_RESEARCH_CONTRACT_VERSION, hasCurrentResearchContract } from './research-contract.ts'

export const INTEREST_WATCHLISTS = [
  { id: 'interest-photonics', name: 'Photonics', symbols: ['LITE', 'COHR', 'CIEN', 'AAOI'] },
  { id: 'interest-ai', name: 'AI', symbols: ['NVDA', 'MSFT', 'GOOGL', 'AMD', 'AVGO', 'TSM'] },
  { id: 'interest-nuclear', name: 'Nuclear', symbols: ['CEG', 'CCJ', 'BWXT', 'LEU', 'SMR'] },
  { id: 'interest-energy', name: 'Energy companies', symbols: ['XOM', 'CVX', 'LNG', 'ET'] },
  { id: 'interest-sustainable-energy', name: 'Sustainable energy', symbols: ['FSLR', 'NEE', 'ENPH', 'BEP'] },
  { id: 'interest-space', name: 'Space', symbols: ['RKLB', 'ASTS', 'IRDM', 'LUNR'] },
] as const

export type CoverageLane = 'owned' | 'interest' | 'rotation'
export interface CoverageState {
  ownerId: string
  symbol: string
  enrolledAt: string
  lastSelectedAt: string | null
  selectionReason: string | null
}
export interface CoverageResearch {
  id?: string
  ownerId: string
  symbol: string
  status: string
  generatedAt: string
  content: unknown
}
export interface CoverageRevalidation {
  ownerId: string
  symbol: string
  researchNoteId: string
  classification: string
  createdAt: string
  content: unknown
}
export interface CoverageCandidate {
  ownerId?: string | null
  symbol: string
  status: string
  generatedAt: string
  snoozedUntil?: string | null
}
export interface CoverageRecord extends CoverageState {
  lane: CoverageLane
  interestTags: string[]
  lastMeaningfulReviewAt: string | null
  nextReviewDueAt: string
  overdue: boolean
  active: boolean
}

export interface ResearchCoveragePlan {
  records: CoverageRecord[]
  selected: CoverageRecord[]
  unavailableSymbols: string[]
}

const DAY = 86_400_000
const validTime = (value: string | null | undefined, cutoff: number) => Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= cutoff)

/** Meaningful coverage is a completed report or supported cited revalidation
 * under the current contract.
 * Queuing, Scout materialization and failed refreshes never reset its age. */
export function buildResearchCoveragePlan(input: {
  ownerId: string
  ownedSymbols: Iterable<string>
  watchlists: Array<{ ownerId: string; name: string; symbols: readonly string[] }>
  candidates: CoverageCandidate[]
  research: CoverageResearch[]
  revalidations?: CoverageRevalidation[]
  states: CoverageState[]
  availableSymbols: ReadonlySet<string>
  researchEligibleSymbols?: ReadonlySet<string>
  activeSymbols?: ReadonlySet<string>
  now?: Date
  maxTargets?: number
  directResearchSymbols?: readonly string[]
}): ResearchCoveragePlan {
  const now = input.now ?? new Date(), cutoff = now.getTime()
  const owned = new Set([...input.ownedSymbols])
  const tags = new Map<string, string[]>()
  for (const list of input.watchlists) {
    if (list.ownerId !== input.ownerId) continue
    for (const symbol of list.symbols) tags.set(symbol, [...new Set([...(tags.get(symbol) ?? []), list.name])])
  }
  const latestCandidates = new Map<string, CoverageCandidate>()
  for (const candidate of input.candidates) {
    if ((candidate.ownerId && candidate.ownerId !== input.ownerId) || !validTime(candidate.generatedAt, cutoff)) continue
    const current = latestCandidates.get(candidate.symbol)
    if (!current || candidate.generatedAt > current.generatedAt) latestCandidates.set(candidate.symbol, candidate)
  }
  const leads = [...latestCandidates.values()].filter(candidate => ['new', 'promoted', 'watchlisted'].includes(candidate.status)
    && (!candidate.snoozedUntil || validTime(candidate.snoozedUntil, cutoff)))
  const relevant = new Set([...owned, ...tags.keys(), ...leads.map(candidate => candidate.symbol)])
  const states = new Map(input.states.filter(state => state.ownerId === input.ownerId).map(state => [state.symbol, state]))
  const lastReview = new Map<string, string>()
  const validNotes = new Map<string, CoverageResearch>()
  for (const research of input.research) {
    if (research.ownerId !== input.ownerId || research.status !== 'complete' || !hasCurrentResearchContract(research.content) || !validTime(research.generatedAt, cutoff)) continue
    const previous = lastReview.get(research.symbol)
    if (!previous || research.generatedAt > previous) lastReview.set(research.symbol, research.generatedAt)
    if (research.id) validNotes.set(research.id, research)
  }
  for (const check of input.revalidations ?? []) {
    const note = validNotes.get(check.researchNoteId)
    const content = check.content && typeof check.content === 'object' ? check.content as Record<string, unknown> : {}
    const update = content.update && typeof content.update === 'object' ? content.update as Record<string, unknown> : {}
    if (!note || check.ownerId !== input.ownerId || note.symbol !== check.symbol || check.classification !== 'revalidate' || content.readiness !== 'complete'
      || update.researchContractVersion !== CURRENT_RESEARCH_CONTRACT_VERSION || update.conclusion !== 'supported' || !Array.isArray(update.sourceIds) || !update.sourceIds.length || update.sourceIds.some(id => typeof id !== 'string' || !id.trim())
      || !validTime(check.createdAt, cutoff) || Date.parse(check.createdAt) < Date.parse(note.generatedAt)) continue
    const previous = lastReview.get(check.symbol)
    if (!previous || check.createdAt > previous) lastReview.set(check.symbol, check.createdAt)
  }
  const records = [...relevant].filter(symbol => /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) && input.availableSymbols.has(symbol)).map(symbol => {
    const state = states.get(symbol)
    const lane: CoverageLane = owned.has(symbol) ? 'owned' : tags.has(symbol) ? 'interest' : 'rotation'
    const enrolledAt = state && validTime(state.enrolledAt, cutoff) ? state.enrolledAt : now.toISOString()
    const lastMeaningfulReviewAt = lastReview.get(symbol) ?? null
    // These are review targets, not guaranteed service times. Unresearched
    // tracked names are due immediately; capacity shortages remain visible.
    const cadenceDays = lane === 'owned' ? 14 : lane === 'interest' ? 35 : 60
    const nextReviewDueAt = lastMeaningfulReviewAt ? new Date(Date.parse(lastMeaningfulReviewAt) + cadenceDays * DAY).toISOString() : enrolledAt
    return {
      ownerId: input.ownerId, symbol, lane, enrolledAt,
      interestTags: tags.get(symbol) ?? [], lastMeaningfulReviewAt,
      lastSelectedAt: state && validTime(state.lastSelectedAt, cutoff) ? state.lastSelectedAt : null,
      selectionReason: state?.selectionReason ?? null,
      nextReviewDueAt, overdue: Date.parse(nextReviewDueAt) <= cutoff,
      active: input.activeSymbols?.has(symbol) ?? false,
    }
  })
  const dailySelection = (record: CoverageRecord) => record.lastSelectedAt?.slice(0, 10) === now.toISOString().slice(0, 10)
  const directlyRequested = (record: CoverageRecord) => Number(Boolean(input.directResearchSymbols?.includes(record.symbol) && !record.lastSelectedAt && !record.lastMeaningfulReviewAt))
  const attentionAt = (record: CoverageRecord) => Math.max(record.lastSelectedAt ? Date.parse(record.lastSelectedAt) : -Infinity, record.lastMeaningfulReviewAt ? Date.parse(record.lastMeaningfulReviewAt) : -Infinity)
  const due = records.filter(record => record.overdue && !record.active && !dailySelection(record) && (!input.researchEligibleSymbols || input.researchEligibleSymbols.has(record.symbol))).sort((a, b) =>
    directlyRequested(b) - directlyRequested(a)
    // Attempts do not count as evidence, but consume a turn. A permanently
    // failing new name cannot monopolize refreshes of previously reviewed names.
    || attentionAt(a) - attentionAt(b)
    || (a.lastSelectedAt ?? '').localeCompare(b.lastSelectedAt ?? '')
    || a.enrolledAt.localeCompare(b.enrolledAt) || a.symbol.localeCompare(b.symbol))
  const selected: CoverageRecord[] = []
  const maxTargets = Math.max(0, Math.floor(input.maxTargets ?? 4))
  const slots: CoverageLane[] = ['interest', 'rotation', 'interest', 'owned']
  // A reduced global pool still advances each category across daily runs.
  // Four available slots reserve two interests, one rotation and one holding.
  const offset = Math.floor(cutoff / DAY) % slots.length
  const usedToday = new Map(slots.map(lane => [lane, records.filter(record => record.lane === lane && dailySelection(record)).length]))
  const quotas = { interest: 2, rotation: 1, owned: 1 }
  for (let index = 0; index < slots.length && selected.length < maxTargets; index++) {
    const lane = slots[(offset + index) % slots.length]
    if ((usedToday.get(lane) ?? 0) >= quotas[lane]) continue
    const record = due.find(record => record.lane === lane && !selected.some(chosen => chosen.symbol === record.symbol))
    if (!record) continue
    selected.push({ ...record, selectionReason: `${lane === 'interest' ? 'Reserved interest/watchlist coverage' : lane === 'rotation' ? 'Reserved discovery rotation' : 'Owned-company maintenance'}; ${record.lastMeaningfulReviewAt ? 'oldest completed current-contract review' : 'no completed current-contract review'}` })
    usedToday.set(lane, (usedToday.get(lane) ?? 0) + 1)
  }
  return { records, selected, unavailableSymbols: [...relevant].filter(symbol => !input.availableSymbols.has(symbol) || (input.researchEligibleSymbols && !input.researchEligibleSymbols.has(symbol))).sort() }
}
