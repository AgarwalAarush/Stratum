const EVIDENCE_LABEL = /(^|\n)(\s*(?:[-*]\s+)?)(?:\*\*)?(FACT|VIEW|CONSENSUS|ESTIMATE|EST\.?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*/gim

/**
 * Earlier report versions were written as an analyst workpaper, with visible
 * claim-type labels at the start of every paragraph. The default reader view
 * is intentionally quieter; the original tagged copy remains available in
 * Evidence mode for auditability.
 */
export function researchMemoMarkdown(content: string): string {
  return content.replace(EVIDENCE_LABEL, '$1$2')
}
