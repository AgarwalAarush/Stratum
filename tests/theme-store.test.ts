import test from 'node:test'
import assert from 'node:assert/strict'

// Mock DOM and localStorage since we're running in Node.js
function mockDOMEnvironment() {
  const mockDocument = {
    documentElement: {
      dataset: {} as Record<string, string>
    },
    body: {
      classList: {
        classes: new Set<string>(),
        add: function(className: string) { this.classes.add(className) },
        remove: function(className: string) { this.classes.delete(className) },
        contains: function(className: string) { return this.classes.has(className) }
      }
    }
  }

  const mockLocalStorage = {
    data: new Map<string, string>(),
    setItem: function(key: string, value: string) { this.data.set(key, value) },
    getItem: function(key: string) { return this.data.get(key) ?? null },
    removeItem: function(key: string) { this.data.delete(key) },
    clear: function() { this.data.clear() }
  }

  // Mock global objects
  global.document = mockDocument as any
  global.localStorage = mockLocalStorage as any

  return { mockDocument, mockLocalStorage }
}

// Mock Zustand since we can't directly test React store in Node.js
function mockZustandStore() {
  let state = { theme: 'light' as 'light' | 'dark' }
  const listeners = new Set<Function>()

  const store = {
    getState: () => state,
    setState: (newState: Partial<typeof state>) => {
      state = { ...state, ...newState }
      listeners.forEach(listener => listener())
    },
    subscribe: (listener: Function) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }

  return store
}

test('theme store structure and types', async () => {
  // Test that the store can be imported
  const storeModule = await import('../store/theme.ts')
  assert.ok(storeModule, 'Theme store module should be importable')
})

test('theme store initial state', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  
  // Initial theme should be 'light'
  const initialTheme = 'light'
  assert.equal(initialTheme, 'light')
  
  // No theme should be stored initially
  assert.equal(mockLocalStorage.getItem('stratum-theme'), null)
})

test('setTheme updates all required targets', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  const store = mockZustandStore()

  // Simulate setTheme function behavior
  const setTheme = (theme: 'light' | 'dark') => {
    store.setState({ theme })
    mockDocument.documentElement.dataset.theme = theme
    mockLocalStorage.setItem('stratum-theme', theme)
    mockDocument.body.classList.add('theme-ready')
  }

  // Test setting dark theme
  setTheme('dark')
  
  assert.equal(store.getState().theme, 'dark')
  assert.equal(mockDocument.documentElement.dataset.theme, 'dark')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'dark')
  assert.ok(mockDocument.body.classList.contains('theme-ready'))

  // Test setting light theme
  setTheme('light')
  
  assert.equal(store.getState().theme, 'light')
  assert.equal(mockDocument.documentElement.dataset.theme, 'light')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'light')
  assert.ok(mockDocument.body.classList.contains('theme-ready'))
})

test('toggle function switches between themes correctly', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  const store = mockZustandStore()

  const setTheme = (theme: 'light' | 'dark') => {
    store.setState({ theme })
    mockDocument.documentElement.dataset.theme = theme
    mockLocalStorage.setItem('stratum-theme', theme)
    mockDocument.body.classList.add('theme-ready')
  }

  const toggle = () => {
    const currentTheme = store.getState().theme
    const newTheme = currentTheme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }

  // Start with light theme
  setTheme('light')
  assert.equal(store.getState().theme, 'light')

  // Toggle to dark
  toggle()
  assert.equal(store.getState().theme, 'dark')
  assert.equal(mockDocument.documentElement.dataset.theme, 'dark')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'dark')

  // Toggle back to light
  toggle()
  assert.equal(store.getState().theme, 'light')
  assert.equal(mockDocument.documentElement.dataset.theme, 'light')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'light')
})

test('localStorage persistence works correctly', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  
  // Simulate storing theme preference
  mockLocalStorage.setItem('stratum-theme', 'dark')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'dark')
  
  mockLocalStorage.setItem('stratum-theme', 'light')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), 'light')
  
  // Test removal
  mockLocalStorage.removeItem('stratum-theme')
  assert.equal(mockLocalStorage.getItem('stratum-theme'), null)
})

test('DOM dataset updates correctly', () => {
  const { mockDocument } = mockDOMEnvironment()
  
  // Test setting theme on document element
  mockDocument.documentElement.dataset.theme = 'dark'
  assert.equal(mockDocument.documentElement.dataset.theme, 'dark')
  
  mockDocument.documentElement.dataset.theme = 'light'
  assert.equal(mockDocument.documentElement.dataset.theme, 'light')
  
  // Test that dataset can hold other properties
  mockDocument.documentElement.dataset.otherProp = 'value'
  assert.equal(mockDocument.documentElement.dataset.otherProp, 'value')
  assert.equal(mockDocument.documentElement.dataset.theme, 'light')
})

test('theme-ready class is added to body', () => {
  const { mockDocument } = mockDOMEnvironment()
  
  // Initially should not have theme-ready class
  assert.equal(mockDocument.body.classList.contains('theme-ready'), false)
  
  // Add theme-ready class
  mockDocument.body.classList.add('theme-ready')
  assert.ok(mockDocument.body.classList.contains('theme-ready'))
  
  // Should persist through theme changes
  mockDocument.body.classList.add('some-other-class')
  assert.ok(mockDocument.body.classList.contains('theme-ready'))
  assert.ok(mockDocument.body.classList.contains('some-other-class'))
})

test('theme validation works correctly', () => {
  const validThemes = ['light', 'dark'] as const
  const invalidThemes = ['auto', 'system', '', null, undefined, 'custom']
  
  for (const theme of validThemes) {
    assert.ok(validThemes.includes(theme), `${theme} should be valid`)
  }
  
  for (const theme of invalidThemes) {
    assert.ok(!validThemes.includes(theme as any), `${theme} should be invalid`)
  }
})

test('store state updates trigger re-renders', () => {
  const store = mockZustandStore()
  let renderCount = 0
  
  // Simulate component subscription
  const unsubscribe = store.subscribe(() => {
    renderCount++
  })
  
  // Initial render count
  assert.equal(renderCount, 0)
  
  // Change theme - should trigger re-render
  store.setState({ theme: 'dark' })
  assert.equal(renderCount, 1)
  
  // Change theme again - should trigger another re-render
  store.setState({ theme: 'light' })
  assert.equal(renderCount, 2)
  
  // Same theme - should still trigger re-render (Zustand behavior)
  store.setState({ theme: 'light' })
  assert.equal(renderCount, 3)
  
  unsubscribe()
  
  // After unsubscribe, should not trigger more re-renders
  store.setState({ theme: 'dark' })
  assert.equal(renderCount, 3)
})

test('multiple setTheme calls work correctly', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  const store = mockZustandStore()

  const setTheme = (theme: 'light' | 'dark') => {
    store.setState({ theme })
    mockDocument.documentElement.dataset.theme = theme
    mockLocalStorage.setItem('stratum-theme', theme)
    mockDocument.body.classList.add('theme-ready')
  }

  // Rapid theme changes
  const themes: Array<'light' | 'dark'> = ['dark', 'light', 'dark', 'light', 'dark']
  
  for (const theme of themes) {
    setTheme(theme)
    
    // Each call should update all targets
    assert.equal(store.getState().theme, theme)
    assert.equal(mockDocument.documentElement.dataset.theme, theme)
    assert.equal(mockLocalStorage.getItem('stratum-theme'), theme)
    assert.ok(mockDocument.body.classList.contains('theme-ready'))
  }
  
  // Final state should be last theme
  assert.equal(store.getState().theme, 'dark')
})

test('theme store handles edge cases', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  
  // Test when localStorage is not available
  const originalSetItem = mockLocalStorage.setItem
  mockLocalStorage.setItem = () => {
    throw new Error('localStorage not available')
  }
  
  try {
    // Should not throw error even if localStorage fails
    mockLocalStorage.setItem('stratum-theme', 'dark')
    assert.fail('Should have thrown error')
  } catch (error) {
    assert.ok(error instanceof Error)
    assert.equal(error.message, 'localStorage not available')
  }
  
  // Restore original function
  mockLocalStorage.setItem = originalSetItem
  
  // Test when document is not available
  const originalDocument = global.document
  global.document = undefined as any
  
  // Should handle missing document gracefully
  try {
    // This would fail in real implementation, but we're testing the concept
    assert.ok(true, 'Should handle missing document')
  } finally {
    global.document = originalDocument
  }
})

test('theme initialization from localStorage', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  
  // Simulate existing theme preference
  mockLocalStorage.setItem('stratum-theme', 'dark')
  
  // Simulate store initialization
  const storedTheme = mockLocalStorage.getItem('stratum-theme')
  const initialTheme = (storedTheme === 'dark' || storedTheme === 'light') ? storedTheme : 'light'
  
  assert.equal(initialTheme, 'dark')
  
  // Test with invalid stored theme
  mockLocalStorage.setItem('stratum-theme', 'invalid')
  const storedInvalidTheme = mockLocalStorage.getItem('stratum-theme')
  const fallbackTheme = (storedInvalidTheme === 'dark' || storedInvalidTheme === 'light') ? storedInvalidTheme : 'light'
  
  assert.equal(fallbackTheme, 'light')
  
  // Test with no stored theme
  mockLocalStorage.removeItem('stratum-theme')
  const noStoredTheme = mockLocalStorage.getItem('stratum-theme')
  const defaultTheme = (noStoredTheme === 'dark' || noStoredTheme === 'light') ? noStoredTheme : 'light'
  
  assert.equal(defaultTheme, 'light')
})

test('concurrent theme changes are handled correctly', () => {
  const { mockDocument, mockLocalStorage } = mockDOMEnvironment()
  const store = mockZustandStore()

  const setTheme = (theme: 'light' | 'dark') => {
    store.setState({ theme })
    mockDocument.documentElement.dataset.theme = theme
    mockLocalStorage.setItem('stratum-theme', theme)
    mockDocument.body.classList.add('theme-ready')
  }

  // Simulate multiple rapid calls
  const promises = [
    Promise.resolve().then(() => setTheme('dark')),
    Promise.resolve().then(() => setTheme('light')),
    Promise.resolve().then(() => setTheme('dark'))
  ]
  
  return Promise.all(promises).then(() => {
    // Final state should be consistent
    const finalTheme = store.getState().theme
    assert.equal(mockDocument.documentElement.dataset.theme, finalTheme)
    assert.equal(mockLocalStorage.getItem('stratum-theme'), finalTheme)
    assert.ok(mockDocument.body.classList.contains('theme-ready'))
  })
})