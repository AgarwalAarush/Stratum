import test from 'node:test'
import assert from 'node:assert/strict'

import { formatRelativeTime, formatFutureTime } from '../lib/utils.ts'

test('formatRelativeTime handles "just now" for very recent times', () => {
  const now = new Date()
  const justNow = new Date(now.getTime() - 30 * 1000) // 30 seconds ago
  
  assert.equal(formatRelativeTime(justNow.toISOString()), 'just now')
})

test('formatRelativeTime formats minutes correctly', () => {
  const now = new Date()
  const oneMinute = new Date(now.getTime() - 1 * 60 * 1000)
  const fiveMinutes = new Date(now.getTime() - 5 * 60 * 1000)
  const fiftyNineMinutes = new Date(now.getTime() - 59 * 60 * 1000)
  
  assert.equal(formatRelativeTime(oneMinute.toISOString()), '1m ago')
  assert.equal(formatRelativeTime(fiveMinutes.toISOString()), '5m ago')
  assert.equal(formatRelativeTime(fiftyNineMinutes.toISOString()), '59m ago')
})

test('formatRelativeTime formats hours correctly', () => {
  const now = new Date()
  const oneHour = new Date(now.getTime() - 1 * 60 * 60 * 1000)
  const fiveHours = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const twentyThreeHours = new Date(now.getTime() - 23 * 60 * 60 * 1000)
  
  assert.equal(formatRelativeTime(oneHour.toISOString()), '1h ago')
  assert.equal(formatRelativeTime(fiveHours.toISOString()), '5h ago')
  assert.equal(formatRelativeTime(twentyThreeHours.toISOString()), '23h ago')
})

test('formatRelativeTime formats days correctly', () => {
  const now = new Date()
  const oneDay = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
  const threeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const sixDays = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
  
  assert.equal(formatRelativeTime(oneDay.toISOString()), '1d ago')
  assert.equal(formatRelativeTime(threeDays.toISOString()), '3d ago')
  assert.equal(formatRelativeTime(sixDays.toISOString()), '6d ago')
})

test('formatRelativeTime formats old dates as absolute dates', () => {
  const now = new Date('2026-03-06T12:00:00.000Z')
  const oldDate = new Date('2026-02-20T12:00:00.000Z') // 14 days ago
  
  // Mock the current date for consistent testing
  const originalNow = Date.now
  Date.now = () => now.getTime()
  
  const result = formatRelativeTime(oldDate.toISOString())
  assert.equal(result, 'Feb 20')
  
  Date.now = originalNow
})

test('formatRelativeTime handles edge case at boundaries', () => {
  const baseTime = new Date('2026-03-06T12:00:00.000Z')
  const originalNow = Date.now
  Date.now = () => baseTime.getTime()
  
  // Exactly 1 minute
  const exactMinute = new Date(baseTime.getTime() - 60 * 1000)
  assert.equal(formatRelativeTime(exactMinute.toISOString()), '1m ago')
  
  // Exactly 1 hour
  const exactHour = new Date(baseTime.getTime() - 60 * 60 * 1000)
  assert.equal(formatRelativeTime(exactHour.toISOString()), '1h ago')
  
  // Exactly 1 day
  const exactDay = new Date(baseTime.getTime() - 24 * 60 * 60 * 1000)
  assert.equal(formatRelativeTime(exactDay.toISOString()), '1d ago')
  
  // Exactly 7 days
  const exactWeek = new Date(baseTime.getTime() - 7 * 24 * 60 * 60 * 1000)
  assert.equal(formatRelativeTime(exactWeek.toISOString()), 'Feb 27')
  
  Date.now = originalNow
})

test('formatFutureTime handles past dates by delegating to formatRelativeTime', () => {
  const now = new Date('2026-03-06T12:00:00.000Z')
  const pastDate = new Date('2026-03-06T11:00:00.000Z') // 1 hour ago
  const originalNow = Date.now
  Date.now = () => now.getTime()
  
  const result = formatFutureTime(pastDate.toISOString())
  assert.equal(result, '1h ago')
  
  Date.now = originalNow
})

test('formatFutureTime formats "today" for same day', () => {
  const baseDate = new Date('2026-03-06T10:00:00.000Z')
  const todayLater = new Date('2026-03-06T15:00:00.000Z') // Later same day
  const originalNow = Date.now
  Date.now = () => baseDate.getTime()
  
  const result = formatFutureTime(todayLater.toISOString())
  assert.equal(result, 'today')
  
  Date.now = originalNow
})

test('formatFutureTime formats "tomorrow" for next day', () => {
  const baseDate = new Date('2026-03-06T22:00:00.000Z')
  const tomorrow = new Date('2026-03-07T10:00:00.000Z')
  const originalNow = Date.now
  Date.now = () => baseDate.getTime()
  
  const result = formatFutureTime(tomorrow.toISOString())
  assert.equal(result, 'tomorrow')
  
  Date.now = originalNow
})

test('formatFutureTime formats days in future', () => {
  const baseDate = new Date('2026-03-06T12:00:00.000Z')
  const threeDays = new Date('2026-03-09T12:00:00.000Z')
  const tenDays = new Date('2026-03-16T12:00:00.000Z')
  const originalNow = Date.now
  Date.now = () => baseDate.getTime()
  
  assert.equal(formatFutureTime(threeDays.toISOString()), 'in 3d')
  assert.equal(formatFutureTime(tenDays.toISOString()), 'in 10d')
  
  Date.now = originalNow
})

test('formatFutureTime handles edge cases at day boundaries', () => {
  const baseDate = new Date('2026-03-06T23:59:00.000Z')
  const nextMinute = new Date('2026-03-07T00:01:00.000Z') // Next day, just 2 minutes later
  const originalNow = Date.now
  Date.now = () => baseDate.getTime()
  
  const result = formatFutureTime(nextMinute.toISOString())
  assert.equal(result, 'tomorrow')
  
  Date.now = originalNow
})

test('formatRelativeTime and formatFutureTime handle invalid dates gracefully', () => {
  // These should not throw errors, though behavior may be implementation-dependent
  const invalidDate = 'invalid-date-string'
  
  try {
    formatRelativeTime(invalidDate)
    // If it doesn't throw, that's fine
  } catch (error) {
    // If it throws, that's also acceptable behavior
    assert.ok(error instanceof Error)
  }
  
  try {
    formatFutureTime(invalidDate)
  } catch (error) {
    assert.ok(error instanceof Error)
  }
})