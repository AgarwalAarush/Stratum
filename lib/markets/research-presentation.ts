const CLAIM_TYPE = 'FACT(?:/VIEW)?|VIEW|CONSENSUS|ESTIMATE|EST\\.?'
const WHOLE_BOLD_CLAIM = new RegExp(`(^|\\n)(\\s*(?:[-*]\\s+)?)\\*\\*(${CLAIM_TYPE}):\\s*([^*\\n]+)\\*\\*`, 'gim')
const EVIDENCE_LABEL = new RegExp(`(^|\\n)(\\s*(?:[-*]\\s+)?)(?:\\*\\*)?(${CLAIM_TYPE})(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*`, 'gim')
const INLINE_SOURCE_IDS = /\s*\[(?:[a-z0-9][a-z0-9_-]*(?:\s*[;,]\s*[a-z0-9][a-z0-9_-]*)*)\](?!\()/gi

function cleanResearchMarkdown(content: string): string {
  return content
    .replace(/\\\*\\\*/g, '**')
    .replace(INLINE_SOURCE_IDS, '')
    .replace(/\bnibble\b/gi, 'start with a small position')
}

/**
 * Earlier report versions were written as an analyst workpaper, with visible
 * claim-type labels at the start of every paragraph. The default reader view
 * is intentionally quieter; the original tagged copy remains available in
 * Evidence mode for auditability.
 */
export function researchMemoMarkdown(content: string): string {
  return cleanResearchMarkdown(content)
    .replace(WHOLE_BOLD_CLAIM, '$1$2$4')
    .replace(EVIDENCE_LABEL, '$1$2')
}

export function researchEvidenceMarkdown(content: string): string {
  return cleanResearchMarkdown(content)
}

export function formatEntryAction(action: string): string {
  const labels: Record<string, string> = {
    buy_now: 'Buy now',
    nibble: 'Start with a small position',
    wait: 'Wait for a better setup',
    add_on_weakness: 'Add on weakness',
    avoid: 'Avoid',
  }
  return labels[action] ?? action.replaceAll('_', ' ')
}
