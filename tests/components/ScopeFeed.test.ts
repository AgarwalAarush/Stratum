import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getScopeSectionLayout } from '../../lib/scope-layout.ts'
import { getScopeById } from '../../lib/scopes.ts'

const scopeFeedSource = readFileSync(
  join(process.cwd(), 'components/sections/ScopeFeed.tsx'),
  'utf8',
)

const intelligenceDashboardSource = readFileSync(
  join(process.cwd(), 'components/intelligence/IntelligenceResearchDashboard.tsx'),
  'utf8',
)

test('ScopeFeed viewport mode logic works correctly based on section ID', () => {
  // Test tech-events gets 'fill' viewport mode
  assert.equal(getScopeSectionLayout('tech-events').viewportMode, 'fill', 'tech-events should have fill viewport mode')
  
  // Test earnings gets 'natural' viewport mode
  assert.equal(getScopeSectionLayout('earnings').viewportMode, 'natural', 'earnings should have natural viewport mode')
  
  // Test regular sections get 'fixed' viewport mode
  assert.equal(getScopeSectionLayout('regular-section').viewportMode, 'fixed', 'regular sections should have fixed viewport mode')
  assert.equal(getScopeSectionLayout('news').viewportMode, 'fixed', 'news sections should have fixed viewport mode')
  assert.equal(getScopeSectionLayout('papers').viewportMode, 'fixed', 'papers sections should have fixed viewport mode')
  
  // Test explicit options override defaults
  assert.equal(getScopeSectionLayout('tech-events', { viewportMode: 'natural' }).viewportMode, 'natural', 'explicit options should override defaults')
})

test('ScopeFeed columns logic works correctly based on section ID', () => {
  // Test earnings gets 3 columns
  assert.equal(getScopeSectionLayout('earnings').columns, 3, 'earnings should have 3 columns')
  
  // Test other sections get 1 column by default
  assert.equal(getScopeSectionLayout('tech-events').columns, 1, 'tech-events should have 1 column by default')
  assert.equal(getScopeSectionLayout('papers').columns, 1, 'papers should have 1 column by default')
  assert.equal(getScopeSectionLayout('news').columns, 1, 'news should have 1 column by default')
  
  // Test explicit options override defaults
  assert.equal(getScopeSectionLayout('papers', { columns: 2 }).columns, 2, 'explicit options should override defaults')
})

test('ScopeFeed fillByColumn logic works correctly based on section ID', () => {
  // Test earnings gets fillByColumn=true
  assert.equal(getScopeSectionLayout('earnings').fillByColumn, true, 'earnings should have fillByColumn=true')
  
  // Test other sections get fillByColumn=false by default
  assert.equal(getScopeSectionLayout('tech-events').fillByColumn, false, 'tech-events should have fillByColumn=false by default')
  assert.equal(getScopeSectionLayout('papers').fillByColumn, false, 'papers should have fillByColumn=false by default')
  assert.equal(getScopeSectionLayout('news').fillByColumn, false, 'news should have fillByColumn=false by default')
  
  // Test explicit options override defaults
  assert.equal(getScopeSectionLayout('papers', { fillByColumn: true }).fillByColumn, true, 'explicit options should override defaults')
  assert.equal(getScopeSectionLayout('earnings', { fillByColumn: false }).fillByColumn, false)
})

test('ScopeFeed keeps the earnings item cap separate from custom columns', () => {
  assert.equal(getScopeSectionLayout('earnings', { columns: 2 }).itemsPerColumn, 4)
  assert.equal(getScopeSectionLayout('papers').itemsPerColumn, undefined)
})

test('ScopeFeed uses the registered scope IDs', () => {
  assert.equal(getScopeById('finance')?.id, 'finance')
  assert.equal(getScopeById('ai-research')?.id, 'ai-research')
  assert.equal(getScopeById('global-news')?.id, 'global-news')
  assert.equal(getScopeById('unknown-scope'), undefined)
})

test('ScopeFeed uses hourly refresh interval', () => {
  assert.match(scopeFeedSource, /SCOPE_REFRESH_INTERVAL_MS\s*=\s*3_600_000/)
  assert.match(scopeFeedSource, /refreshInterval:\s*SCOPE_REFRESH_INTERVAL_MS/)
})

test('AI Research renders the live intelligence dashboard', () => {
  assert.match(scopeFeedSource, /<IntelligenceResearchDashboard/)
  assert.match(scopeFeedSource, /sections=\{data \?\? \{\}\}/)
  assert.match(scopeFeedSource, /overviewBullets=\{overviewData\?\.bullets \?\? \[\]\}/)
})

test('Intelligence dashboard maps the four primary source groups', () => {
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'papers', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'ai-policy-regulation', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'infra-hardware', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'repos', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /intelligence-topic-grid-primary/)
  assert.match(intelligenceDashboardSource, /feed panels with items/)
})

test('Intelligence dashboard keeps company and technology feeds as standalone sections', () => {
  assert.match(intelligenceDashboardSource, /id: 'venture-capital', title: 'Venture Capital'/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'venture-capital', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /id: 'startups', title: 'Startups'/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'startups', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /id: 'new-technology', title: 'New Technology'/)
  assert.match(intelligenceDashboardSource, /sectionRows\(sections, 'new-technology', referenceTimeMs\)/)
  assert.match(intelligenceDashboardSource, /intelligence-topic-grid-company/)
})

test('Intelligence category actions open an in-app category view', () => {
  assert.match(intelligenceDashboardSource, /View \{viewLabel\}/)
  assert.match(intelligenceDashboardSource, /aria-haspopup="dialog"/)
  assert.match(intelligenceDashboardSource, /role="dialog"/)
  assert.match(intelligenceDashboardSource, /category\.rows\.map/)
  assert.match(intelligenceDashboardSource, /if \(event\.key === 'Escape'\) onClose\(\)/)
  assert.equal(intelligenceDashboardSource.includes('Open latest'), false)
})

test('ScopeFeed no longer renders inline periodic briefings', () => {
  assert.equal(scopeFeedSource.includes('PeriodicOverview'), false)
  assert.equal(scopeFeedSource.includes('/api/overviews/weekly'), false)
  assert.equal(scopeFeedSource.includes('/api/overviews/monthly'), false)
})
