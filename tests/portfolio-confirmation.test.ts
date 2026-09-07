import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePositionCsv,
  validatePortfolioConfirmation,
} from '../lib/markets/portfolio-confirmation.ts'

test('manual holdings import preserves fractional shares, cash and explicit empty accounts', () => {
  const positions = parsePositionCsv(
    'symbol,quantity,cost_basis_per_share\r\n"AMD",1.25,82.5\r\nGRID,2,70',
  )
  assert.equal(positions[0].quantity, 1.25)
  const now = new Date('2026-09-07T15:00:00Z')
  assert.equal(
    validatePortfolioConfirmation(
      { positions, cash: 0, asOf: '2026-09-07T14:00:00Z' },
      now,
    ).cash,
    0,
  )
  assert.deepEqual(
    validatePortfolioConfirmation(
      { positions: [], cash: 1000, asOf: now.toISOString() },
      now,
    ).positions,
    [],
  )
  assert.throws(
    () =>
      validatePortfolioConfirmation(
        {
          positions: [...positions, positions[0]],
          cash: 0,
          asOf: now.toISOString(),
        },
        now,
      ),
    /duplicate/,
  )
  assert.throws(
    () =>
      validatePortfolioConfirmation(
        { positions, cash: NaN, asOf: now.toISOString() },
        now,
      ),
    /cash/,
  )
  assert.throws(
    () =>
      validatePortfolioConfirmation(
        { positions, cash: 0, asOf: '2026-09-08T14:00:00Z' },
        now,
      ),
    /future/,
  )
  assert.throws(
    () =>
      validatePortfolioConfirmation(
        { positions, cash: 0, asOf: '2026-08-01T14:00:00Z' },
        now,
      ),
    /seven days/,
  )
  assert.throws(
    () => parsePositionCsv('symbol,quantity,cost_basis_per_share\nAMD,,1'),
    /row/,
  )
  assert.throws(
    () => parsePositionCsv('symbol,quantity,cost_basis_per_share\n"AMD,1,1'),
    /quote/,
  )
})
