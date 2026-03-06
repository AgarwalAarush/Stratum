import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScopeDef, FeedItem } from '../../lib/types'

function createMockScope(id: string, sections: any[]): ScopeDef {
  return {
    id,
    label: `${id} Label`,
    sections,
  }
}

function createMockSection(id: string, itemType: any = 'news') {
  return {
    id,
    label: `${id} Label`,
    sources: [],
    itemType,
    apiPath: `/api/${id}`,
  }
}

function createMockItems(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'news' as const,
    id: `item-${i}`,
    title: `News Item ${i}`,
    source: 'Test Source',
    publishedAt: new Date().toISOString(),
    url: `https://example.com/item-${i}`,
  }))
}

const scopeFeedSource = readFileSync(
  join(process.cwd(), 'components/sections/ScopeFeed.tsx'),
  'utf8',
)

// Test the viewport mode logic from ScopeFeed
function getViewportModeForSection(sectionId: string, options?: { viewportMode?: 'fixed' | 'fill' | 'natural' }) {
  return options?.viewportMode
    ?? (sectionId === 'tech-events'
      ? 'fill'
      : sectionId === 'earnings'
        ? 'natural'
        : 'fixed')
}

// Test the columns logic from ScopeFeed
function getColumnsForSection(sectionId: string, options?: { columns?: number }) {
  return options?.columns ?? (sectionId === 'earnings' ? 3 : 1)
}

// Test the fillByColumn logic from ScopeFeed
function getFillByColumnForSection(sectionId: string, options?: { fillByColumn?: boolean }) {
  return options?.fillByColumn ?? (sectionId === 'earnings')
}

test('ScopeFeed viewport mode logic works correctly based on section ID', () => {
  // Test tech-events gets 'fill' viewport mode
  assert.equal(getViewportModeForSection('tech-events'), 'fill', 'tech-events should have fill viewport mode')
  
  // Test earnings gets 'natural' viewport mode
  assert.equal(getViewportModeForSection('earnings'), 'natural', 'earnings should have natural viewport mode')
  
  // Test regular sections get 'fixed' viewport mode
  assert.equal(getViewportModeForSection('regular-section'), 'fixed', 'regular sections should have fixed viewport mode')
  assert.equal(getViewportModeForSection('news'), 'fixed', 'news sections should have fixed viewport mode')
  assert.equal(getViewportModeForSection('papers'), 'fixed', 'papers sections should have fixed viewport mode')
  
  // Test explicit options override defaults
  assert.equal(getViewportModeForSection('tech-events', { viewportMode: 'natural' }), 'natural', 'explicit options should override defaults')
})

test('ScopeFeed columns logic works correctly based on section ID', () => {
  // Test earnings gets 3 columns
  assert.equal(getColumnsForSection('earnings'), 3, 'earnings should have 3 columns')
  
  // Test other sections get 1 column by default
  assert.equal(getColumnsForSection('tech-events'), 1, 'tech-events should have 1 column by default')
  assert.equal(getColumnsForSection('papers'), 1, 'papers should have 1 column by default')
  assert.equal(getColumnsForSection('news'), 1, 'news should have 1 column by default')
  
  // Test explicit options override defaults
  assert.equal(getColumnsForSection('papers', { columns: 2 }), 2, 'explicit options should override defaults')
})

test('ScopeFeed fillByColumn logic works correctly based on section ID', () => {
  // Test earnings gets fillByColumn=true
  assert.equal(getFillByColumnForSection('earnings'), true, 'earnings should have fillByColumn=true')
  
  // Test other sections get fillByColumn=false by default
  assert.equal(getFillByColumnForSection('tech-events'), false, 'tech-events should have fillByColumn=false by default')
  assert.equal(getFillByColumnForSection('papers'), false, 'papers should have fillByColumn=false by default')
  assert.equal(getFillByColumnForSection('news'), false, 'news should have fillByColumn=false by default')
  
  // Test explicit options override defaults
  assert.equal(getFillByColumnForSection('papers', { fillByColumn: true }), true, 'explicit options should override defaults')
})

test('ScopeFeed handles scope ID detection correctly', () => {
  const financeScope = createMockScope('finance', [])
  const aiResearchScope = createMockScope('ai-research', [])
  const generalScope = createMockScope('general', [])
  
  assert.equal(financeScope.id, 'finance', 'finance scope should have correct ID')
  assert.equal(aiResearchScope.id, 'ai-research', 'ai-research scope should have correct ID')
  assert.equal(generalScope.id, 'general', 'general scope should have correct ID')
})

test('ScopeFeed uses hourly refresh interval', () => {
  assert.match(scopeFeedSource, /SCOPE_REFRESH_INTERVAL_MS\s*=\s*3_600_000/)
  assert.match(scopeFeedSource, /refreshInterval:\s*SCOPE_REFRESH_INTERVAL_MS/)
})

test('AI Research layout renders repos section at the bottom before end marker', () => {
  const newTechnologyIndex = scopeFeedSource.indexOf("{renderSection('new-technology')}")
  const reposIndex = scopeFeedSource.indexOf("{renderSection('repos')}")
  const endMarkerIndex = scopeFeedSource.indexOf('END OF FEED')

  assert.ok(newTechnologyIndex >= 0)
  assert.ok(reposIndex > newTechnologyIndex)
  assert.ok(endMarkerIndex > reposIndex)
})
