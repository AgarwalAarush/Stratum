const CLAIM_TYPE = 'FACT(?:/VIEW)?|VIEW|CONSENSUS|ESTIMATE|EST\\.?'
const WHOLE_BOLD_CLAIM = new RegExp(`(^|\\n)(\\s*(?:[-*]\\s+)?)\\*\\*(${CLAIM_TYPE}):\\s*([^*\\n]+)\\*\\*`, 'gim')
const EVIDENCE_LABEL = new RegExp(`(^|\\n)(\\s*(?:[-*]\\s+)?)(?:\\*\\*)?(${CLAIM_TYPE})(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*`, 'gim')

/**
 * Earlier report versions were written as an analyst workpaper, with visible
 * claim-type labels at the start of every paragraph. The default reader view
 * is intentionally quieter; the original tagged copy remains available in
 * Evidence mode for auditability.
 */
export function researchMemoMarkdown(content: string): string {
  return content
    .replace(WHOLE_BOLD_CLAIM, '$1$2$4')
    .replace(EVIDENCE_LABEL, '$1$2')
}
