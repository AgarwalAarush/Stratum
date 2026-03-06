# Component Tests

This directory contains unit tests for React components in the Stratum application.

## Test Files

### ScopeFeed.test.ts
Tests for the `ScopeFeed` component focusing on:
- Viewport mode logic based on section IDs (`tech-events` → `fill`, `earnings` → `natural`, others → `fixed`)
- Column configuration logic (`earnings` → 3 columns, others → 1 column)
- FillByColumn logic (`earnings` → true, others → false)
- Scope ID detection and handling

### ScopeSection.test.ts  
Tests for the `ScopeSection` component focusing on:
- CSS class application based on `viewportMode` prop:
  - `fixed` → `section-viewport-fixed`
  - `fill` → `xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-none`
  - `natural` → empty string
- Grid class generation based on column count:
  - 1 column → `grid grid-cols-1`
  - 2 columns → `grid grid-cols-1 lg:grid-cols-2`
  - 3+ columns → `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Column reordering algorithm for multi-column layouts
- Proper handling of different feed item types (news, paper, discussion, repo, earnings)
- Edge cases like empty item arrays and uneven distributions

## Running Tests

```bash
# Run all tests
npm test

# Run only component tests
node --test --experimental-strip-types tests/components/*.test.ts
```

## Test Coverage

These tests cover the critical business logic and styling behavior of the components without requiring a full DOM environment. They focus on:

1. **Viewport modes**: Ensuring sections render with correct viewport configurations
2. **CSS classes**: Verifying correct Tailwind classes are applied based on props
3. **Layout logic**: Testing multi-column grid layouts and reordering algorithms  
4. **Data handling**: Confirming proper processing of different feed item types
5. **Edge cases**: Ensuring robust behavior with empty data and edge conditions

The tests use Node.js built-in test framework with TypeScript support via `--experimental-strip-types` flag, maintaining consistency with the existing test patterns in the codebase.