import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { validateCompanyMarketModel } from '../lib/server/company-market-model.ts'

function validModel() {
  return {
    businessSummary: 'The company sells a mission-critical service to enterprise customers.',
    centralMarketQuestion: 'Can constrained industry capacity convert demand into durable pricing power?',
    marketThesis: 'Industry scarcity can support growth if the company turns capacity into contracted customer adoption.',
    businessLines: [{
      name: 'Core service',
      offering: 'Managed capacity',
      customers: 'Enterprise buyers',
      jobToBeDone: 'Secure reliable supply',
      monetization: 'Usage and subscription fees',
      maturity: 'scaling',
      evidenceStatus: 'observed',
      sourceIds: ['source-1'],
    }],
    valueChain: [
      {
        layer: 'Inputs',
        role: 'Provides constrained equipment',
        companyPosition: 'Buyer',
        economics: 'Lead times govern deployment pace',
        participants: ['Supplier A'],
        sourceIds: ['source-1'],
      },
      {
        layer: 'Service',
        role: 'Delivers capacity to customers',
        companyPosition: 'Operator',
        economics: 'Utilization and pricing determine returns',
        participants: ['Company'],
        sourceIds: ['source-1'],
      },
    ],
    demandDrivers: [
      {
        name: 'Customer load growth',
        direction: 'tailwind',
        mechanism: 'Higher load increases required capacity.',
        horizon: '1-2 years',
        evidenceStatus: 'observed',
        sourceIds: ['source-1'],
      },
      {
        name: 'Efficiency gains',
        direction: 'mixed',
        mechanism: 'Efficiency can reduce unit demand while lowering adoption costs.',
        horizon: '2-3 years',
        evidenceStatus: 'analyst_inference',
        sourceIds: [],
      },
    ],
    supplyConstraints: [{
      name: 'Equipment lead time',
      severity: 'important',
      mechanism: 'Long lead times cap deployment.',
      scarcityRentCapture: 'Operators with installed capacity may capture pricing.',
      resolutionSignals: ['Supplier lead times fall below twelve months'],
      sourceIds: ['source-1'],
    }],
    causalChain: [
      {
        from: 'Customer load growth',
        to: 'Capacity demand',
        mechanism: 'More load requires more deliverable service capacity.',
        evidenceStatus: 'observed',
        sourceIds: ['source-1'],
      },
      {
        from: 'Capacity demand',
        to: 'Company monetization',
        mechanism: 'Contracted utilization raises revenue and operating leverage.',
        evidenceStatus: 'analyst_inference',
        sourceIds: [],
      },
    ],
    marketStructure: {
      marketDefinition: 'Deliverable managed capacity',
      pricingPower: 'Depends on regional scarcity and contract duration.',
      scarcityRentCapture: 'Installed operators capture rent when supply is constrained.',
      cyclicality: 'Capital-intensive and sensitive to customer investment cycles.',
      regulationAndPolicy: 'Permitting affects the pace of new supply.',
    },
    competitors: [{
      name: 'Competitor A',
      customerOverlap: 'Enterprise capacity buyers',
      capability: 'Comparable managed service',
      companyAdvantage: 'Earlier installed footprint',
      companyGap: 'Smaller sales reach',
      implication: 'Share gains require converting availability into contracts.',
      sourceIds: ['source-1'],
    }],
    strategicRelationships: [],
    crossChecks: [{
      method: 'Capacity versus customer adoption',
      result: 'Available capacity and signed demand move in the same direction.',
      implication: 'The demand thesis has an operational cross-check.',
      sourceIds: ['source-1'],
    }],
    expectations: {
      currentNarrative: 'The market expects continued scarcity.',
      whatAppearsPriced: 'The supplied valuation implies material adoption.',
      variantView: 'Contract conversion may lag physical deployment.',
      sourceIds: ['source-1'],
    },
    predictions: Array.from({ length: 3 }, (_, index) => ({
      prediction: `Prediction ${index + 1}`,
      horizon: '12 months',
      leadingIndicator: `Leading indicator ${index + 1}`,
      confirmation: `Confirmation ${index + 1}`,
      disconfirmation: `Disconfirmation ${index + 1}`,
      sourceIds: index === 0 ? ['source-1'] : [],
    })),
    falsifiers: Array.from({ length: 3 }, (_, index) => ({
      condition: `Falsifier ${index + 1}`,
      observable: `Observable ${index + 1}`,
      thesisImpact: `Impact ${index + 1}`,
      sourceIds: [],
    })),
    financialRole: {
      fundingCapacity: 'Liquidity funds the current build plan.',
      monetizationProof: 'Contracted utilization is the key proof point.',
      valuationConstraint: 'The current price requires successful deployment.',
      sourceIds: ['source-1'],
    },
    evidenceGaps: ['Customer-level contract conversion is not disclosed.'],
    confidence: 48,
    sourceIds: ['source-1'],
  }
}

test('company market model validator enforces a causal, falsifiable contract', () => {
  const result = validateCompanyMarketModel(validModel(), new Set(['source-1']))
  assert.equal(result.businessLines[0]?.maturity, 'scaling')
  assert.equal(result.valueChain.length, 2)
  assert.equal(result.predictions.length, 3)
  assert.equal(result.confidence, 48)

  const noCausalChain = validModel()
  noCausalChain.causalChain = []
  assert.throws(() => validateCompanyMarketModel(noCausalChain), /causalChain must contain/)

  const noPredictions = validModel()
  noPredictions.predictions = []
  assert.throws(() => validateCompanyMarketModel(noPredictions), /predictions must contain/)

  const unknownSource = validModel()
  unknownSource.businessLines[0]!.sourceIds = ['made-up-source']
  assert.throws(
    () => validateCompanyMarketModel(unknownSource, new Set(['source-1'])),
    /unknown source IDs: made-up-source/,
  )

  const incompleteLedger = validModel()
  incompleteLedger.sourceIds = []
  assert.throws(
    () => validateCompanyMarketModel(incompleteLedger, new Set(['source-1'])),
    /source ledger omitted referenced source IDs: source-1/,
  )
})

test('company market model is durable and linked to the downstream research note', async () => {
  const [schema, migration, ownerMigration, generator] = await Promise.all([
    readFile(new URL('../schemas/company-market-model.schema.json', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608020002_company_market_models.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608020003_reconcile_company_market_model_owner.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/company-market-model.ts', import.meta.url), 'utf8'),
  ])
  assert.match(schema, /"causalChain"/)
  assert.match(schema, /"supplyConstraints"/)
  assert.match(schema, /"predictions"/)
  assert.match(schema, /"falsifiers"/)
  assert.match(migration, /create table if not exists public\.company_market_models/i)
  assert.match(migration, /company_packet_id uuid not null/i)
  assert.match(migration, /company_market_model_id uuid/i)
  assert.match(migration, /unique \(owner_id, symbol, version\)/i)
  assert.match(ownerMigration, /drop constraint if exists company_market_models_owner_id_fkey/i)
  assert.match(ownerMigration, /references public\.market_users\(id\)/i)
  assert.match(generator, /Build a causal CompanyMarketModel before any equity rating/)
  assert.match(generator, /external demand or environmental change -> constraint or enabling capability/)
  assert.match(generator, /Financial evidence is one layer/)
  assert.match(generator, /ALLOWED SOURCE IDS \(use only these exact strings\)/)
  assert.match(generator, /Inventory material named operating assets and capabilities/)
})
