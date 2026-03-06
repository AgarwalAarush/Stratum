import test from 'node:test'
import assert from 'node:assert/strict'

import { 
  SCOPES, 
  SCOPE_IDS, 
  DEFAULT_SCOPE_ID, 
  getScopeById, 
  isValidScopeId 
} from '../lib/scopes.ts'

test('SCOPES contains expected scope definitions', () => {
  assert.ok(Array.isArray(SCOPES))
  assert.ok(SCOPES.length > 0)
  
  // Check that all scopes have required properties
  for (const scope of SCOPES) {
    assert.ok(typeof scope.id === 'string')
    assert.ok(scope.id.length > 0)
    assert.ok(typeof scope.label === 'string')
    assert.ok(scope.label.length > 0)
    assert.ok(Array.isArray(scope.sections))
    assert.ok(scope.sections.length > 0)
  }
})

test('SCOPES contains ai-research scope with expected sections', () => {
  const aiResearch = SCOPES.find(s => s.id === 'ai-research')
  assert.ok(aiResearch, 'ai-research scope should exist')
  assert.equal(aiResearch.label, 'AI Research')
  assert.equal(aiResearch.featuredSectionId, 'papers')
  
  // Check for key sections
  const sectionIds = aiResearch.sections.map(s => s.id)
  assert.ok(sectionIds.includes('discussions'))
  assert.ok(sectionIds.includes('repos'))
  assert.ok(sectionIds.includes('papers'))
  assert.ok(sectionIds.includes('ai-news-general'))
})

test('SCOPES contains finance scope with expected sections', () => {
  const finance = SCOPES.find(s => s.id === 'finance')
  assert.ok(finance, 'finance scope should exist')
  assert.equal(finance.label, 'Finance')
  
  const sectionIds = finance.sections.map(s => s.id)
  assert.ok(sectionIds.includes('earnings'))
  assert.ok(sectionIds.includes('deals'))
  assert.ok(sectionIds.includes('research-reports'))
  assert.ok(sectionIds.includes('macro'))
})

test('all scope sections have required properties', () => {
  for (const scope of SCOPES) {
    for (const section of scope.sections) {
      assert.ok(typeof section.id === 'string')
      assert.ok(section.id.length > 0)
      assert.ok(typeof section.label === 'string')
      assert.ok(section.label.length > 0)
      assert.ok(Array.isArray(section.sources))
      assert.ok(section.sources.length > 0)
      assert.ok(typeof section.itemType === 'string')
      assert.ok(['news', 'paper', 'discussion', 'repo', 'earnings'].includes(section.itemType))
      assert.ok(typeof section.apiPath === 'string')
      assert.ok(section.apiPath.startsWith('/api/'))
    }
  }
})

test('SCOPE_IDS matches scope IDs from SCOPES', () => {
  const expectedIds = SCOPES.map(s => s.id)
  assert.deepEqual(SCOPE_IDS, expectedIds)
})

test('DEFAULT_SCOPE_ID is valid and exists in SCOPES', () => {
  assert.equal(DEFAULT_SCOPE_ID, 'ai-research')
  assert.ok(SCOPE_IDS.includes(DEFAULT_SCOPE_ID))
  assert.ok(SCOPES.some(s => s.id === DEFAULT_SCOPE_ID))
})

test('getScopeById returns correct scope for valid ID', () => {
  const aiResearch = getScopeById('ai-research')
  assert.ok(aiResearch)
  assert.equal(aiResearch.id, 'ai-research')
  assert.equal(aiResearch.label, 'AI Research')
  
  const finance = getScopeById('finance')
  assert.ok(finance)
  assert.equal(finance.id, 'finance')
  assert.equal(finance.label, 'Finance')
})

test('getScopeById returns undefined for invalid ID', () => {
  assert.equal(getScopeById('nonexistent'), undefined)
  assert.equal(getScopeById(''), undefined)
  assert.equal(getScopeById('invalid-scope'), undefined)
})

test('getScopeById handles edge cases', () => {
  // Test case sensitivity
  assert.equal(getScopeById('AI-RESEARCH'), undefined)
  assert.equal(getScopeById('Ai-Research'), undefined)
  
  // Test with extra spaces
  assert.equal(getScopeById(' ai-research '), undefined)
  
  // Test with null/undefined (TypeScript should prevent this, but test runtime behavior)
  assert.equal(getScopeById(null as any), undefined)
  assert.equal(getScopeById(undefined as any), undefined)
})

test('isValidScopeId returns true for valid scope IDs', () => {
  assert.equal(isValidScopeId('ai-research'), true)
  assert.equal(isValidScopeId('finance'), true)
  
  // Test all defined scope IDs
  for (const scopeId of SCOPE_IDS) {
    assert.equal(isValidScopeId(scopeId), true, `${scopeId} should be valid`)
  }
})

test('isValidScopeId returns false for invalid scope IDs', () => {
  assert.equal(isValidScopeId('nonexistent'), false)
  assert.equal(isValidScopeId(''), false)
  assert.equal(isValidScopeId('invalid-scope'), false)
  assert.equal(isValidScopeId('crypto'), false)
})

test('isValidScopeId handles edge cases', () => {
  // Test case sensitivity
  assert.equal(isValidScopeId('AI-RESEARCH'), false)
  assert.equal(isValidScopeId('Finance'), false)
  
  // Test with extra spaces
  assert.equal(isValidScopeId(' ai-research '), false)
  
  // Test with null/undefined
  assert.equal(isValidScopeId(null as any), false)
  assert.equal(isValidScopeId(undefined as any), false)
})

test('scope and section IDs are unique within their contexts', () => {
  // Test scope IDs are unique
  const scopeIds = SCOPES.map(s => s.id)
  const uniqueScopeIds = [...new Set(scopeIds)]
  assert.equal(scopeIds.length, uniqueScopeIds.length, 'Scope IDs should be unique')
  
  // Test section IDs are unique within each scope
  for (const scope of SCOPES) {
    const sectionIds = scope.sections.map(s => s.id)
    const uniqueSectionIds = [...new Set(sectionIds)]
    assert.equal(
      sectionIds.length, 
      uniqueSectionIds.length, 
      `Section IDs should be unique within scope ${scope.id}`
    )
  }
})

test('API paths follow expected patterns', () => {
  for (const scope of SCOPES) {
    for (const section of scope.sections) {
      const { apiPath } = section
      
      // Should start with /api/
      assert.ok(apiPath.startsWith('/api/'), `API path should start with /api/: ${apiPath}`)
      
      // Should not end with trailing slash
      assert.ok(!apiPath.endsWith('/'), `API path should not end with /: ${apiPath}`)
      
      // Should not contain double slashes
      assert.ok(!apiPath.includes('//'), `API path should not contain //: ${apiPath}`)
      
      // Should be lowercase (common convention)
      assert.equal(apiPath, apiPath.toLowerCase(), `API path should be lowercase: ${apiPath}`)
    }
  }
})

test('section sources are non-empty strings', () => {
  for (const scope of SCOPES) {
    for (const section of scope.sections) {
      assert.ok(Array.isArray(section.sources))
      assert.ok(section.sources.length > 0, `Section ${section.id} should have sources`)
      
      for (const source of section.sources) {
        assert.ok(typeof source === 'string')
        assert.ok(source.length > 0, `Source should not be empty in section ${section.id}`)
      }
    }
  }
})

test('featuredSectionId references valid section when present', () => {
  for (const scope of SCOPES) {
    if (scope.featuredSectionId) {
      const sectionIds = scope.sections.map(s => s.id)
      assert.ok(
        sectionIds.includes(scope.featuredSectionId),
        `Featured section ${scope.featuredSectionId} should exist in scope ${scope.id}`
      )
    }
  }
})

test('scope configuration integrity', () => {
  // This test ensures the overall configuration makes sense
  
  // Should have both ai-research and finance scopes at minimum
  const scopeIds = SCOPES.map(s => s.id)
  assert.ok(scopeIds.includes('ai-research'))
  assert.ok(scopeIds.includes('finance'))
  
  // Each scope should have multiple sections
  for (const scope of SCOPES) {
    assert.ok(scope.sections.length >= 3, `Scope ${scope.id} should have multiple sections`)
  }
  
  // Should have variety in item types
  const allItemTypes = SCOPES.flatMap(s => s.sections.map(sec => sec.itemType))
  const uniqueItemTypes = [...new Set(allItemTypes)]
  assert.ok(uniqueItemTypes.length >= 3, 'Should have variety in item types')
  assert.ok(uniqueItemTypes.includes('news'))
})