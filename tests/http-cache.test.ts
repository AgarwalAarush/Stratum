import test from 'node:test'
import assert from 'node:assert/strict'

import { 
  cacheControlForTier, 
  buildCacheHeaders, 
  sectionJsonResponse,
  type CacheTier,
  type DataSourceHeader
} from '../lib/server/http-cache.ts'

test('cacheControlForTier returns correct cache control for fast tier', () => {
  const result = cacheControlForTier('fast')
  assert.equal(result, 'public, s-maxage=3600, stale-while-revalidate=60, stale-if-error=600')
})

test('cacheControlForTier returns correct cache control for medium tier', () => {
  const result = cacheControlForTier('medium')
  assert.equal(result, 'public, s-maxage=3600, stale-while-revalidate=120, stale-if-error=900')
})

test('cacheControlForTier returns correct cache control for slow tier', () => {
  const result = cacheControlForTier('slow')
  assert.equal(result, 'public, s-maxage=3600, stale-while-revalidate=300, stale-if-error=3600')
})

test('cacheControlForTier returns correct cache control for static tier', () => {
  const result = cacheControlForTier('static')
  assert.equal(result, 'public, s-maxage=86400, stale-while-revalidate=600, stale-if-error=14400')
})

test('all cache tiers use public caching', () => {
  const tiers: CacheTier[] = ['fast', 'medium', 'slow', 'static']
  
  for (const tier of tiers) {
    const cacheControl = cacheControlForTier(tier)
    assert.ok(cacheControl.includes('public'), `${tier} tier should use public caching`)
  }
})

test('cache tiers have appropriate s-maxage values', () => {
  // Most tiers use 1 hour (3600 seconds)
  assert.ok(cacheControlForTier('fast').includes('s-maxage=3600'))
  assert.ok(cacheControlForTier('medium').includes('s-maxage=3600'))
  assert.ok(cacheControlForTier('slow').includes('s-maxage=3600'))
  
  // Static tier uses 24 hours (86400 seconds)
  assert.ok(cacheControlForTier('static').includes('s-maxage=86400'))
})

test('cache tiers have stale-while-revalidate configured', () => {
  const tiers: CacheTier[] = ['fast', 'medium', 'slow', 'static']
  
  for (const tier of tiers) {
    const cacheControl = cacheControlForTier(tier)
    assert.ok(
      cacheControl.includes('stale-while-revalidate='), 
      `${tier} tier should have stale-while-revalidate`
    )
  }
})

test('cache tiers have stale-if-error configured', () => {
  const tiers: CacheTier[] = ['fast', 'medium', 'slow', 'static']
  
  for (const tier of tiers) {
    const cacheControl = cacheControlForTier(tier)
    assert.ok(
      cacheControl.includes('stale-if-error='), 
      `${tier} tier should have stale-if-error`
    )
  }
})

test('stale-while-revalidate increases with tier slowness', () => {
  // Extract stale-while-revalidate values
  const fastMatch = cacheControlForTier('fast').match(/stale-while-revalidate=(\d+)/)
  const mediumMatch = cacheControlForTier('medium').match(/stale-while-revalidate=(\d+)/)
  const slowMatch = cacheControlForTier('slow').match(/stale-while-revalidate=(\d+)/)
  
  assert.ok(fastMatch && mediumMatch && slowMatch, 'All tiers should have stale-while-revalidate')
  
  const fast = parseInt(fastMatch[1], 10)
  const medium = parseInt(mediumMatch[1], 10)
  const slow = parseInt(slowMatch[1], 10)
  
  assert.ok(fast < medium, 'Medium tier should have longer stale-while-revalidate than fast')
  assert.ok(medium < slow, 'Slow tier should have longer stale-while-revalidate than medium')
})

test('stale-if-error increases with tier slowness', () => {
  // Extract stale-if-error values  
  const fastMatch = cacheControlForTier('fast').match(/stale-if-error=(\d+)/)
  const mediumMatch = cacheControlForTier('medium').match(/stale-if-error=(\d+)/)
  const slowMatch = cacheControlForTier('slow').match(/stale-if-error=(\d+)/)
  
  assert.ok(fastMatch && mediumMatch && slowMatch, 'All tiers should have stale-if-error')
  
  const fast = parseInt(fastMatch[1], 10)
  const medium = parseInt(mediumMatch[1], 10)
  const slow = parseInt(slowMatch[1], 10)
  
  assert.ok(fast < medium, 'Medium tier should have longer stale-if-error than fast')
  assert.ok(medium < slow, 'Slow tier should have longer stale-if-error than medium')
})

test('buildCacheHeaders includes all required headers', () => {
  const headers = buildCacheHeaders('medium', 'fresh')
  
  assert.ok('Cache-Control' in headers)
  assert.ok('X-Cache-Tier' in headers)
  assert.ok('X-Data-Source' in headers)
})

test('buildCacheHeaders sets correct values', () => {
  const headers = buildCacheHeaders('slow', 'redis')
  
  assert.equal(headers['Cache-Control'], cacheControlForTier('slow'))
  assert.equal(headers['X-Cache-Tier'], 'slow')
  assert.equal(headers['X-Data-Source'], 'redis')
})

test('buildCacheHeaders works with all tier combinations', () => {
  const tiers: CacheTier[] = ['fast', 'medium', 'slow', 'static']
  const dataSources: DataSourceHeader[] = ['memory', 'redis', 'fresh', 'stale', 'none']
  
  for (const tier of tiers) {
    for (const dataSource of dataSources) {
      const headers = buildCacheHeaders(tier, dataSource)
      
      assert.equal(headers['X-Cache-Tier'], tier)
      assert.equal(headers['X-Data-Source'], dataSource)
      assert.ok(headers['Cache-Control'].length > 0)
    }
  }
})

test('buildCacheHeaders returns a new object each time', () => {
  const headers1 = buildCacheHeaders('fast', 'memory')
  const headers2 = buildCacheHeaders('fast', 'memory')
  
  assert.notStrictEqual(headers1, headers2, 'Should return new objects')
  assert.deepEqual(headers1, headers2, 'But content should be identical')
})

test('sectionJsonResponse creates NextResponse with correct headers', () => {
  const testBody = { items: [], fetchedAt: '2026-03-06T12:00:00Z' }
  const response = sectionJsonResponse(testBody, 'medium', 'fresh')
  
  // Check that it's a NextResponse
  assert.ok(response instanceof Response)
  
  // Check headers are set correctly
  assert.equal(response.headers.get('X-Cache-Tier'), 'medium')
  assert.equal(response.headers.get('X-Data-Source'), 'fresh')
  assert.equal(response.headers.get('Cache-Control'), cacheControlForTier('medium'))
  
  // Check content type
  assert.equal(response.headers.get('Content-Type'), 'application/json')
})

test('sectionJsonResponse preserves body content', async () => {
  const testBody = { 
    items: [{ id: 'test', title: 'Test Item' }], 
    fetchedAt: '2026-03-06T12:00:00Z',
    metadata: { count: 1, source: 'test' }
  }
  
  const response = sectionJsonResponse(testBody, 'fast', 'memory')
  const responseBody = await response.json()
  
  assert.deepEqual(responseBody, testBody)
})

test('sectionJsonResponse works with different body types', async () => {
  // Test with array
  const arrayBody = ['item1', 'item2', 'item3']
  const arrayResponse = sectionJsonResponse(arrayBody, 'static', 'none')
  const arrayResult = await arrayResponse.json()
  assert.deepEqual(arrayResult, arrayBody)
  
  // Test with string
  const stringBody = 'test string'
  const stringResponse = sectionJsonResponse(stringBody, 'fast', 'fresh')
  const stringResult = await stringResponse.json()
  assert.equal(stringResult, stringBody)
  
  // Test with number
  const numberBody = 42
  const numberResponse = sectionJsonResponse(numberBody, 'medium', 'redis')
  const numberResult = await numberResponse.json()
  assert.equal(numberResult, numberBody)
  
  // Test with null
  const nullBody = null
  const nullResponse = sectionJsonResponse(nullBody, 'slow', 'stale')
  const nullResult = await nullResponse.json()
  assert.equal(nullResult, nullBody)
})

test('cache control strings follow HTTP specification format', () => {
  const tiers: CacheTier[] = ['fast', 'medium', 'slow', 'static']
  
  for (const tier of tiers) {
    const cacheControl = cacheControlForTier(tier)
    
    // Should start with 'public'
    assert.ok(cacheControl.startsWith('public'), `${tier} should start with public`)
    
    // Should contain directive separators
    assert.ok(cacheControl.includes(', '), `${tier} should use proper directive separators`)
    
    // Should not have trailing/leading spaces on directives
    const directives = cacheControl.split(', ')
    for (const directive of directives) {
      assert.equal(directive.trim(), directive, `Directive should not have extra spaces: "${directive}"`)
      assert.ok(directive.length > 0, 'Directive should not be empty')
    }
  }
})

test('cache headers are consistent with existing refresh policy tests', () => {
  // These values should match the expectations from refresh-policy.test.ts
  
  // All non-static tiers should use 3600 seconds (1 hour)
  assert.ok(cacheControlForTier('fast').includes('s-maxage=3600'))
  assert.ok(cacheControlForTier('medium').includes('s-maxage=3600'))
  assert.ok(cacheControlForTier('slow').includes('s-maxage=3600'))
  
  // Static tier should use 86400 seconds (24 hours)
  assert.ok(cacheControlForTier('static').includes('s-maxage=86400'))
})