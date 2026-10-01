export type ResearchFeedback = {
  cutoff: string
  coverage: string
  records: Array<{ id: string; kind: string; asOf: string; content: Record<string, unknown> }>
}
export type FeedbackReview = { changedConclusion: boolean; explanation: string; sourceIds: string[] }
export const FEEDBACK_RULES = 'Review outcomeFeedback before drawing a conclusion. Explain in feedbackReview whether recorded forecast resolutions, contrary outcomes or prior research errors change the conclusion. Cite feedback:<record id> for every supplied record. Hypothetical price outcomes are not executed trades or proof of a causal mechanism. Operational failures are coverage gaps, not analytical ground truth. Owner reports are optional and retain their attribution limits. Missing feedback is not evidence of success.'
export function validateFeedbackReview(value: unknown, feedback: ResearchFeedback): FeedbackReview {
  const v = value as FeedbackReview | undefined
  const required = feedback.records.map(r => `feedback:${r.id}`)
  if (!v || typeof v.changedConclusion !== 'boolean' || typeof v.explanation !== 'string' || v.explanation.trim().length < 8 || !Array.isArray(v.sourceIds) || v.sourceIds.some(id => !required.includes(id)) || required.some(id => !v.sourceIds.includes(id))) throw new Error('Research must explain and cite its supplied outcome feedback')
  return v
}
