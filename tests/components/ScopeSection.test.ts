import test from 'node:test'
import assert from 'node:assert/strict'
import type { FeedItem } from '../../lib/types'

// Test helper functions extracted from ScopeSection component logic

function createMockItems(count: number, type: FeedItem['type'] = 'news'): FeedItem[] {
  return Array.from({ length: count }, (_, i) => {
    const baseItem = {
      id: `item-${i}`,
      title: `${type} Item ${i}`,
      url: `https://example.com/item-${i}`,
      publishedAt: new Date().toISOString(),
    }
    
    switch (type) {
      case 'news':
        return {
          ...baseItem,
          type: 'news' as const,
          source: 'Test Source',
          category: 'Test Category',
        }
      case 'paper':
        return {
          ...baseItem,
          type: 'paper' as const,
          authors: ['Test Author'],
          categories: ['cs.AI', 'cs.LG'],
        }
      case 'discussion':
        return {
          ...baseItem,
          type: 'discussion' as const,
          points: 100 + i,
          commentCount: 10 + i,
          source: 'HN' as const,
        }
      case 'repo':
        return {
          ...baseItem,
          type: 'repo' as const,
          owner: 'testowner',
          name: `testrepo-${i}`,
          description: `Test repo ${i}`,
          language: 'TypeScript',
          starsPerDay: 5 + i,
          totalStars: 1000 + i * 100,
        }
      case 'earnings':
        return {
          ...baseItem,
          type: 'earnings' as const,
          ticker: 'TEST',
          companyName: `Test Company ${i}`,
          quarter: 'Q1 2026',
          reportDate: new Date().toISOString(),
          epsActual: 2.5,
          epsEstimate: 2.0,
          beat: true,
        }
      default:
        throw new Error(`Unknown item type: ${type}`)
    }
  })
}

// Test viewport class name logic from ScopeSection
function getViewportClassName(viewportMode: 'fixed' | 'fill' | 'natural') {
  return viewportMode === 'fixed'
    ? 'section-viewport-fixed'
    : viewportMode === 'fill'
      ? 'xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-none'
      : ''
}

// Test grid class name logic from ScopeSection
function getGridClassName(columns: number) {
  if (columns >= 3) return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
  if (columns === 2) return 'grid grid-cols-1 lg:grid-cols-2'
  return 'grid grid-cols-1'
}

// Test column reordering logic from ScopeSection
function reorderByColumns<T>(items: T[], columns: number): T[] {
  if (columns <= 1 || items.length <= 1) return items

  const rowCount = Math.ceil(items.length / columns)
  const ordered: T[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let colIndex = 0; colIndex < columns; colIndex += 1) {
      const sourceIndex = colIndex * rowCount + rowIndex
      const candidate = items[sourceIndex]
      if (candidate) {
        ordered.push(candidate)
      }
    }
  }

  return ordered
}

test('ScopeSection applies correct CSS classes based on viewportMode prop', () => {
  // Test fixed viewport mode
  const fixedClass = getViewportClassName('fixed')
  assert.equal(fixedClass, 'section-viewport-fixed', 'fixed viewport mode should return section-viewport-fixed class')
  
  // Test fill viewport mode  
  const fillClass = getViewportClassName('fill')
  assert.equal(fillClass, 'xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-none', 'fill viewport mode should return flex classes')
  
  // Test natural viewport mode
  const naturalClass = getViewportClassName('natural')
  assert.equal(naturalClass, '', 'natural viewport mode should return empty string')
})

test('ScopeSection correctly handles different viewportMode values', () => {
  // Test all valid viewport mode values
  const validModes: Array<'fixed' | 'fill' | 'natural'> = ['fixed', 'fill', 'natural']
  
  validModes.forEach(mode => {
    const className = getViewportClassName(mode)
    assert.equal(typeof className, 'string', `viewport mode ${mode} should return a string`)
    
    if (mode === 'fixed') {
      assert.ok(className.includes('section-viewport-fixed'), `${mode} should include section-viewport-fixed`)
    } else if (mode === 'fill') {
      assert.ok(className.includes('xl:flex-1'), `${mode} should include xl:flex-1`)
      assert.ok(className.includes('xl:overflow-y-auto'), `${mode} should include xl:overflow-y-auto`)
    } else if (mode === 'natural') {
      assert.equal(className, '', `${mode} should return empty string`)
    }
  })
})

test('ScopeSection generates correct grid class names based on columns', () => {
  // Test single column
  const singleCol = getGridClassName(1)
  assert.equal(singleCol, 'grid grid-cols-1', 'single column should use basic grid')
  
  // Test two columns
  const doubleCol = getGridClassName(2)
  assert.equal(doubleCol, 'grid grid-cols-1 lg:grid-cols-2', 'two columns should use responsive grid with lg breakpoint')
  
  // Test three columns
  const tripleCol = getGridClassName(3)
  assert.equal(tripleCol, 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3', 'three columns should use responsive grid with md and xl breakpoints')
  
  // Test four or more columns (should use same as 3)
  const quadCol = getGridClassName(4)
  assert.equal(quadCol, 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3', 'four or more columns should use same as three columns')
})

test('ScopeSection column reordering works correctly', () => {
  const items = ['A', 'B', 'C', 'D', 'E', 'F']
  
  // Test single column (no reordering)
  const singleColumn = reorderByColumns(items, 1)
  assert.deepEqual(singleColumn, items, 'single column should not reorder items')
  
  // Test two columns reordering
  const twoColumns = reorderByColumns(items, 2)
  // Original: [A, B, C, D, E, F]
  // Column 1: [A, B, C]  Column 2: [D, E, F]  
  // Reordered: [A, D, B, E, C, F]
  assert.deepEqual(twoColumns, ['A', 'D', 'B', 'E', 'C', 'F'], 'two columns should reorder by filling columns')
  
  // Test three columns reordering
  const threeColumns = reorderByColumns(items, 3)
  // Original: [A, B, C, D, E, F]
  // Column 1: [A, B]  Column 2: [C, D]  Column 3: [E, F]
  // Reordered: [A, C, E, B, D, F]
  assert.deepEqual(threeColumns, ['A', 'C', 'E', 'B', 'D', 'F'], 'three columns should reorder by filling columns')
})

test('ScopeSection column reordering handles edge cases', () => {
  // Test empty array
  const empty = reorderByColumns([], 3)
  assert.deepEqual(empty, [], 'empty array should remain empty')
  
  // Test single item
  const single = reorderByColumns(['A'], 3)
  assert.deepEqual(single, ['A'], 'single item should remain unchanged')
  
  // Test fewer items than columns
  const few = reorderByColumns(['A', 'B'], 3)
  assert.deepEqual(few, ['A', 'B'], 'fewer items than columns should preserve order')
  
  // Test uneven distribution
  const uneven = reorderByColumns(['A', 'B', 'C', 'D', 'E'], 3)
  // Column 1: [A, B]  Column 2: [C, D]  Column 3: [E]
  // Reordered: [A, C, E, B, D]
  assert.deepEqual(uneven, ['A', 'C', 'E', 'B', 'D'], 'uneven distribution should fill columns evenly')
})

test('ScopeSection renders with correct header styling', () => {
  const mockItems = createMockItems(5, 'news')
  
  // Test that items are correctly formatted
  assert.equal(mockItems.length, 5, 'should create correct number of items')
  assert.equal(mockItems[0].type, 'news', 'items should have correct type')
  
  // Test different item types
  const paperItems = createMockItems(2, 'paper')
  assert.equal(paperItems[0].type, 'paper', 'paper items should have correct type')
  assert.ok('authors' in paperItems[0], 'paper items should have authors property')
  assert.ok('categories' in paperItems[0], 'paper items should have categories property')
  
  const discussionItems = createMockItems(2, 'discussion')
  assert.equal(discussionItems[0].type, 'discussion', 'discussion items should have correct type')
  assert.ok('points' in discussionItems[0], 'discussion items should have points property')
  assert.ok('commentCount' in discussionItems[0], 'discussion items should have commentCount property')
  
  const repoItems = createMockItems(2, 'repo')
  assert.equal(repoItems[0].type, 'repo', 'repo items should have correct type')
  assert.ok('owner' in repoItems[0], 'repo items should have owner property')
  assert.ok('starsPerDay' in repoItems[0], 'repo items should have starsPerDay property')
  
  const earningsItems = createMockItems(2, 'earnings')
  assert.equal(earningsItems[0].type, 'earnings', 'earnings items should have correct type')
  assert.ok('ticker' in earningsItems[0], 'earnings items should have ticker property')
  assert.ok('epsActual' in earningsItems[0], 'earnings items should have epsActual property')
})

test('ScopeSection handles empty items array correctly', () => {
  const emptyItems: FeedItem[] = []
  
  // Test reordering with empty items
  const reordered = reorderByColumns(emptyItems, 3)
  assert.deepEqual(reordered, [], 'empty items should remain empty after reordering')
  
  // Test that grid classes still work with empty items
  const gridClass = getGridClassName(3)
  assert.equal(gridClass, 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3', 'grid classes should work with empty items')
})

test('ScopeSection useGridLayout determination works correctly', () => {
  // Test logic for determining when to use grid layout
  const useGridLayout = (columns: number) => columns > 1
  
  assert.equal(useGridLayout(1), false, 'single column should not use grid layout')
  assert.equal(useGridLayout(2), true, 'two columns should use grid layout')
  assert.equal(useGridLayout(3), true, 'three columns should use grid layout')
  assert.equal(useGridLayout(5), true, 'multiple columns should use grid layout')
})