export interface SectionRenderOptions {
  columns?: number
  fillByColumn?: boolean
  viewportMode?: 'fixed' | 'fill' | 'natural'
}

/** Shared layout defaults for feed sections, with explicit page overrides. */
export function getScopeSectionLayout(sectionId: string, options: SectionRenderOptions = {}) {
  const isEarnings = sectionId === 'earnings'
  return {
    columns: options.columns ?? (isEarnings ? 3 : 1),
    fillByColumn: options.fillByColumn ?? isEarnings,
    itemsPerColumn: isEarnings ? 4 : undefined,
    viewportMode: options.viewportMode ?? (sectionId === 'tech-events' ? 'fill' : isEarnings ? 'natural' : 'fixed'),
  }
}
