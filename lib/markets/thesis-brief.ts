import type { MarketThesisWorkspaceData, ThesisPrediction } from './types.ts'

export interface MarketThesisBriefModel {
  id: string
  title: string
  confidence: number
  whyNow: string
  evidenceCount: number
  exposureCount: number
  predictionCount: number
}

export interface MarketThesisBriefPrediction {
  id: string
  modelTitle: string
  prediction: string
  expectedDirection: string
  deadline: string | null
  result: ThesisPrediction['result']
}

export interface MarketThesisBrief {
  modelCount: number
  predictionCount: number
  observationCount: number
  crossDomainLinkCount: number
  models: MarketThesisBriefModel[]
  predictions: MarketThesisBriefPrediction[]
}

function overviewCopy(value: string): string {
  return value
    .replace(/\s*\[[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The overview does not turn a thesis into a trade. It gives the market tape a
 * durable context: which active transmission models matter, and what facts
 * are meant to confirm or disconfirm them next.
 */
export function buildMarketThesisBrief(workspace: MarketThesisWorkspaceData): MarketThesisBrief | null {
  const active = workspace.theses
    .filter((thesis) => thesis.state === 'active' || thesis.state === 'weakened')
    .sort((left, right) => right.confidence - left.confidence || Date.parse(right.generatedAt) - Date.parse(left.generatedAt))

  if (active.length === 0) return null

  const predictions = active.flatMap((thesis) => thesis.predictions.map((prediction) => ({
    id: prediction.id,
    modelTitle: thesis.title,
    prediction: prediction.prediction,
    expectedDirection: prediction.expectedDirection,
    deadline: prediction.deadline,
    result: prediction.result,
  })))

  const pendingPredictions = predictions
    .filter((prediction) => prediction.result === 'pending')
    .sort((left, right) => {
      const leftDeadline = left.deadline ? Date.parse(left.deadline) : Number.POSITIVE_INFINITY
      const rightDeadline = right.deadline ? Date.parse(right.deadline) : Number.POSITIVE_INFINITY
      return leftDeadline - rightDeadline || left.modelTitle.localeCompare(right.modelTitle)
    })

  // A morning brief should expose the next decision-relevant tests across the
  // book, rather than spend its entire compact rail on several checks from one
  // model.
  const selectedPredictionIds = new Set<string>()
  const modelsAlreadyRepresented = new Set<string>()
  for (const prediction of pendingPredictions) {
    if (modelsAlreadyRepresented.has(prediction.modelTitle)) continue
    modelsAlreadyRepresented.add(prediction.modelTitle)
    selectedPredictionIds.add(prediction.id)
    if (selectedPredictionIds.size === 3) break
  }
  for (const prediction of pendingPredictions) {
    if (selectedPredictionIds.size === 3) break
    selectedPredictionIds.add(prediction.id)
  }

  return {
    modelCount: active.length,
    predictionCount: pendingPredictions.length,
    observationCount: workspace.baseline?.observationIds.length ?? 0,
    crossDomainLinkCount: workspace.crossDomainLinks.length,
    models: active.slice(0, 3).map((thesis) => ({
      id: thesis.id,
      title: thesis.title,
      confidence: thesis.confidence,
      whyNow: overviewCopy(thesis.content.whyNow || thesis.content.economics || thesis.content.expectations) || 'The latest research has not yet supplied a concise rationale.',
      evidenceCount: thesis.content.sourceLedger.length,
      exposureCount: thesis.exposures.length,
      predictionCount: thesis.predictions.filter((prediction) => prediction.result === 'pending').length,
    })),
    predictions: pendingPredictions.filter((prediction) => selectedPredictionIds.has(prediction.id)),
  }
}
