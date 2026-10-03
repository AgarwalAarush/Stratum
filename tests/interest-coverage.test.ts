import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { currentAdvice } from './fixtures/research-advice-v2.ts';
import { decisionReadiness, selectInvestigationTargets, investigationDue, classifyInterestProfile, admitInterestResearch, type CoverageTarget } from '../lib/markets/interest-coverage.ts';
import { coverageRetryPassages, groundCoverageTopics } from '../lib/server/company-research-coverage.ts';
const now = new Date('2026-10-03T14:00:00Z');
const target = (symbol: string, theme?: CoverageTarget['theme'], lane: CoverageTarget['lane'] = 'interest', eligibleSince = '2026-01-01'): CoverageTarget => ({ symbol, theme, lane, eligibleSince, instrumentType: 'equity', forceFullResearch: true });
test('daily capacity, oldest eligibility, never-investigated priority, overlaps and theme rotation', () => {
    const owned = Array.from({ length: 20 }, (_, i) => target(`OWN${i}`, undefined, 'owned'));
    const interests = ['ai', 'photonics', 'nuclear', 'energy', 'sustainable_energy', 'space'].flatMap(t => Array.from({ length: 20 }, (_, i) => target(t === 'photonics' && i === 0 ? 'LITE' : `T${t.slice(0, 2).toUpperCase()}${i}`, t as CoverageTarget['theme'])));
    const backfill = selectInvestigationTargets({ owned, interests, backfill: true, now });
    assert.ok(backfill.some(t => t.symbol === 'LITE'));
    assert.equal(backfill.length, 8);
    assert.equal(backfill.filter(t => t.lane === 'owned').length, 6);
    assert.equal(new Set(backfill.map(t => t.symbol)).size, 8);
    const maintenance = selectInvestigationTargets({ owned, interests, backfill: false, now });
    assert.equal(maintenance.filter(t => t.lane === 'owned').length, 2);
    assert.equal(new Set(maintenance.filter(t => t.lane === 'interest').map(t => t.theme)).size, 6);
    assert.ok(maintenance.some(t => t.symbol === 'LITE'));
    const rotation = new Set<string>();
    for (let i = 0; i < 6; i++)
        selectInvestigationTargets({ owned, interests, backfill: true, now: new Date(now.getTime() + i * 86400000) }).filter(t => t.theme).forEach(t => rotation.add(t.theme!));
    assert.equal(rotation.size, 6);
    const pool = [target('OVERDUE', 'ai', 'interest', '2025-01-01'), target('NEW', 'ai')];
    pool[0].forceFullResearch = false;
    assert.equal(selectInvestigationTargets({ owned: [], interests: pool, backfill: false, now })[0].symbol, 'NEW');
    const failed = selectInvestigationTargets({ owned: [], interests: [target('LITE', 'photonics'), target('COHR', 'photonics')], backfill: false, now, recentFailures: new Map([['LITE', now.toISOString()]]) });
    assert.equal(failed[0].symbol, 'COHR');
});
test('unchanged unresolved economics wait for their checkpoint; legacy reports cannot bypass upgrades', () => {
    const advice = currentAdvice();
    advice.decisionSupport!.followUp.nextCheckAt = '2026-11-01T00:00:00Z';
    const note = { symbol: 'ABC', status: 'complete', instrumentType: 'equity' as const, generated_at: now.toISOString(), content: { advice } };
    assert.equal(investigationDue(note, now), false);
    assert.equal(investigationDue({ ...note, content: { formalRating: 'HOLD' } }, now), true);
    assert.equal(investigationDue(note, new Date('2026-11-02')), true);
    const members = [{ symbol: 'ABC', theme: 'ai', eligible_since: '2025-01-01' }];
    assert.deepEqual(admitInterestResearch(members, [note], new Set(), now.toISOString()), ['ABC']);
    assert.deepEqual(admitInterestResearch(members, [{ ...note, content: { formalRating: 'BUY' } }], new Set(), now.toISOString()), []);
    assert.ok(classifyInterestProfile({ symbol: 'NEW', industry: 'Uranium' }).some(t => t.theme === 'nuclear'));
});
test('readable topic passages beyond the introduction are grounded; quotation mismatch differs from extraction failure', () => {
    const text = 'Company laser overview. ' + 'x'.repeat(22000) + ' Silicon photonics platform supports optical transceivers and customer deployments.';
    const doc = { sourceId: 's', url: 'https://example.com/report', text, extractionStatus: 'readable' as const } as Parameters<typeof coverageRetryPassages>[0];
    assert.match(coverageRetryPassages(doc, [{ title: 'Silicon photonics adoption' }]), /Silicon photonics platform/);
    const topic = { id: 'optics', title: 'Optics', importance: 'Material', decisive: true, evidence: [{ url: doc.url, quote: 'Silicon photonics platform supports optical transceivers' }], unresolvedQuestions: [] };
    assert.deepEqual(groundCoverageTopics([topic], [doc])[0].sourceIds, ['s']);
    assert.match(groundCoverageTopics([{ ...topic, evidence: [{ url: doc.url, quote: 'An invented claim absent from the document.' }] }], [doc])[0].unresolvedQuestions[0], /Quotation mismatch/);
    assert.match(groundCoverageTopics([topic], [{ ...doc, extractionStatus: 'failed', text: null }])[0].unresolvedQuestions[0], /capture or extraction/);
});
test('database reservations are idempotent, isolated, bounded at eight; broad memberships preserve exclusions', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon;create role authenticated;create role service_role;create table market_assets(symbol text primary key,active boolean,tradable boolean);create table agent_jobs(id uuid primary key);`);
        await db.exec(await readFile(new URL('../supabase/migrations/202610030001_research_interest_coverage.sql', import.meta.url), 'utf8'));
        const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
        const reserve = async (symbol: string, lane = 'owned', start = false, key = symbol, who = owner) => (await db.query<{
            ok: boolean;
        }>('select reserve_research_investigation($1,$2,$3,$4,$5,2,$6) ok', [who, '2026-10-03', symbol, lane, key, start])).rows[0].ok;
        for (let i = 0; i < 6; i++)
            assert.equal(await reserve(`A${i}`), true);
        assert.equal(await reserve('A0'), true);
        assert.equal(await reserve('A6'), false);
        assert.equal(await reserve('LITE', 'interest'), true);
        assert.equal(await reserve('COHR', 'interest'), true);
        assert.equal(await reserve('NEW', 'interest'), false);
        assert.equal(await reserve('A0', 'other', true, 'job1'), true);
        assert.equal(await reserve('A0', 'other', true, 'job1'), true);
        assert.equal(await reserve('A0', 'other', true, 'job2'), false);
        assert.equal(await reserve('NEW', 'interest', false, 'new', other), true);
        const members = Array.from({ length: 90 }, (_, i) => ({ symbol: `T${i}`, theme: 'ai', version: 1, provenance: { basis: 'provider' }, active: true, refreshed_at: now.toISOString() }));
        for (const m of members)
            await db.query('insert into market_assets values($1,true,true)', [m.symbol]);
        await db.query('select merge_research_interest_memberships($1,$2)', [owner, JSON.stringify(members)]);
        await db.query("update market_interest_memberships set excluded=true,eligible_since='2025-01-01' where symbol='T0'");
        await db.query('select merge_research_interest_memberships($1,$2)', [owner, JSON.stringify(members)]);
        const result = await db.query<{
            excluded: boolean;
            eligible_since: Date;
        }>('select excluded,eligible_since from market_interest_memberships where symbol=$1', ['T0']);
        assert.equal(result.rows[0].excluded, true);
        assert.equal(new Date(result.rows[0].eligible_since).getUTCFullYear(), 2025);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from market_interest_memberships')).rows[0].n, 90);
    }
    finally {
        await db.close();
    }
});

test('rechecked unresolved checkpoints wait, and only current passed decisions are ready',()=>{
 const advice=currentAdvice();advice.decisionSupport!.followUp.nextCheckAt='2026-09-20T00:00:00Z';const note={id:'r2',symbol:'ABC',status:'complete',instrumentType:'equity' as const,generated_at:'2026-09-01T00:00:00Z',lastCheckedAt:'2026-10-01T00:00:00Z',content:{advice}};
 assert.equal(investigationDue(note,now),false);
 const row={symbol:'ABC',researchId:'r2',action:'hold',expiresAt:'2026-10-05T00:00:00Z',blocked:false},notes=new Map([['ABC',note]]);
 assert.deepEqual([...decisionReadiness([row],notes,now)],['ABC']);
 for(const patch of [{researchId:'old'},{blocked:true},{action:'research'},{expiresAt:'2026-10-01T00:00:00Z'}])assert.equal(decisionReadiness([{...row,...patch}],notes,now).size,0);
})
