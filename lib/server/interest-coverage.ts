import { INTEREST_THEMES, classifyInterestProfile, decisionReadiness, investigationDue, selectCoverageJobs, hasFailedResearchPrerequisite, selectInvestigationTargets, type CoverageResearch, type CoverageTarget, type InterestTheme } from '../markets/interest-coverage.ts';
import { hasCurrentResearchContract, RESEARCH_CONTRACT_VERSION } from '../markets/research-contract.ts';
import { getSupabaseClient } from './supabase.ts';
import { fetchAuthoritativePortfolios } from './portfolio.ts';
import { isEtfInstrument } from './etf-research.ts';
import { fetchFmpStableJson } from './fmp.ts';
import { reserveInvestigation, investigationDate } from './research-investigations.ts';
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function database() { const db = getSupabaseClient(); if (!db)
    throw new Error('Research coverage store unavailable'); return db; }
async function pages(table: string, columns: string, ownerId?: string) { const db = database(), out: Record<string, unknown>[] = []; for (let offset = 0;; offset += 1000) {
    let q = db.from(table).select(columns).order(table === 'market_assets' ? 'symbol' : table === 'market_interest_memberships' ? 'symbol' : table === 'research_refresh_checks' ? 'created_at' : 'generated_at', { ascending: table === 'market_assets' || table === 'market_interest_memberships' }).order(table === 'market_assets' ? 'symbol' : table === 'market_interest_memberships' ? 'theme' : 'id').range(offset, offset + 999).abortSignal(AbortSignal.timeout(15000));
    if (ownerId)
        q = q.eq('owner_id', ownerId);
    const r = await q;
    if (r.error)
        throw new Error(`Unable to load ${table}: ${r.error.message}`);
    out.push(...r.data as unknown as Record<string, unknown>[]);
    if (r.data.length < 1000)
        break;
} return out; }
export async function refreshInterestMembership(ownerId: string, now = new Date(), force = false) {
    const db = database(), prior = await db.from('market_interest_inventories').select('refreshed_at,content').eq('owner_id', ownerId).maybeSingle();
    if (prior.error)
        throw new Error(prior.error.message);
    if (!force && prior.data && now.getTime() - Date.parse(prior.data.refreshed_at) < 86400000)
        return prior.data.content;
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey)
        throw new Error('FMP_API_KEY is not configured');
    const [assets, batches] = await Promise.all([
        pages('market_assets', 'symbol,name,active,tradable,exchange'),
        Promise.allSettled(['NASDAQ','NYSE','AMEX','ARCA','BATS'].map(exchange=>fetchFmpStableJson<Array<Record<string,unknown>>>('company-screener',{exchange,limit:10000,isActivelyTrading:true},{apiKey}))),
    ]);
    const exchanges=['NASDAQ','NYSE','AMEX','ARCA','BATS'];
    const classificationFailures=batches.flatMap((batch,i)=>batch.status==='rejected'?[{exchange:exchanges[i],error:batch.reason instanceof Error?batch.reason.message:'Classification collection failed'}]:[]);
    const successful=batches.flatMap(batch=>batch.status==='fulfilled'?[batch.value]:[]);
    // Restricted exchange filters cannot discard the available broad feed or prevent holdings upgrades.
    if(classificationFailures.length)try{successful.push(await fetchFmpStableJson<Array<Record<string,unknown>>>('company-screener',{limit:10000,isActivelyTrading:true},{apiKey}))}catch(error){classificationFailures.push({exchange:'global',error:error instanceof Error?error.message:'Broad classification feed failed'})}
    const profiles=[...new Map(successful.flat().map(profile=>[String(profile.symbol),profile])).values()];
    if (!Array.isArray(profiles) || !profiles.length)
        throw new Error('Interest classification source returned no profiles; retaining previous inventory');
    const eligible = new Map(assets.filter(a => a.active && a.tradable && ['NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'BATS'].includes(String(a.exchange))).map(a => [String(a.symbol), a])), members: Array<Record<string, unknown>> = [];
    const classified = new Set<string>(), positive = new Set<string>();
    for (const profile of profiles) {
        const symbol = String(profile.symbol ?? '');
        if (!eligible.has(symbol))
            continue;
        classified.add(symbol);
        for (const match of classifyInterestProfile({ symbol, ...profile })) {
            positive.add(symbol);
            members.push({ owner_id: ownerId, theme: match.theme, symbol, version: 1, active: true, refreshed_at: now.toISOString(), provenance: { source: 'FMP company screener and explicit interest registry', url: 'https://financialmodelingprep.com/stable/company-screener', observedAt: now.toISOString(), instrumentType: profile.isEtf || profile.isFund ? 'etf' : 'equity', basis: match.basis, sector: profile.sector ?? null, industry: profile.industry ?? null } });
        }
    }
    // Persist product-based memberships from existing primary research packets as well.
    const packets = await pages('company_packets', 'id,symbol,status,generated_at,company:packet->company,sources:packet->sources', ownerId);
    const seen = new Set<string>();
    for (const raw of packets) {
        const row: Record<string, unknown> & {
            symbol: string;
        } = { ...raw, symbol: String(raw.symbol) };
        if (row.status !== 'complete' || seen.has(row.symbol) || !eligible.has(row.symbol))
            continue;
        seen.add(row.symbol);
        const company = object(row.company);
        for (const match of classifyInterestProfile({ symbol: row.symbol, ...company })) {
            if (members.some(m => m.symbol === row.symbol && m.theme === match.theme))
                continue;
            positive.add(row.symbol);
            members.push({ owner_id: ownerId, theme: match.theme, symbol: row.symbol, version: 1, active: true, refreshed_at: now.toISOString(), provenance: { source: 'Persisted company profile', basis: match.basis, sources: row.sources ?? [], observedAt: now.toISOString() } });
        }
    }
    if (!members.length)
        throw new Error('Interest classification produced no memberships; retaining prior inventory');
    // The database merge only updates classification fields; concurrent owner exclusions survive.
    for (let i = 0; i < members.length; i += 200) {
        const r = await db.rpc('merge_research_interest_memberships', { p_owner_id: ownerId, p_members: members.slice(i, i + 200) });
        if (r.error)
            throw new Error(r.error.message);
    }
    const registered = await db.from('market_universe_members').upsert([...positive].map(symbol => ({ universe: 'search-coverage', symbol, source: 'owner-interest-coverage', source_as_of: now.toISOString(), active: true, refreshed_at: now.toISOString() })), { onConflict: 'universe,symbol' });
    if (registered.error)
        throw new Error(registered.error.message);
    const content = { eligibleAssets: eligible.size, classifiedAssets: classified.size, classificationGaps: eligible.size - classified.size, confirmedSymbols: positive.size, memberships: members.length, classificationFailures, sourceTruncated: successful.some(batch=>batch.length>=10000), asOf: now.toISOString() };
    const saved = await db.from('market_interest_inventories').upsert({ owner_id: ownerId, version: 1, content, refreshed_at: now.toISOString() });
    if (saved.error)
        throw new Error(saved.error.message);
    return content;
}
export async function loadResearchCoverage(ownerId: string, now = new Date()) {
    const db = database();
    const [members, equities, funds, portfolios, jobs, inventory, watches, slots, checks, latest] = await Promise.all([
        pages('market_interest_memberships', '*', ownerId), pages('equity_research_notes', 'id,symbol,status,generated_at,advice:content->advice', ownerId), pages('etf_research_notes', 'id,symbol,status,generated_at,advice:content->advice', ownerId), fetchAuthoritativePortfolios(ownerId),
        db.from('agent_jobs').select('id,status,payload,last_error,created_at,updated_at,run_after').in('job_type', ['generate-company-research', 'generate-etf-research', 'event-refresh-company-research']).contains('payload', { ownerId }).order('created_at', { ascending: false }).limit(1000), db.from('market_interest_inventories').select('content,refreshed_at').eq('owner_id', ownerId).maybeSingle(),
        db.from('market_watchlist_items').select('symbol,market_watchlists!inner(owner_id)').eq('market_watchlists.owner_id', ownerId),
        db.from('research_investigation_slots').select('symbol,started_at,investigation_date,lane').eq('owner_id', ownerId).eq('investigation_date', investigationDate(now)),
        pages('research_refresh_checks','id,symbol,research_note_id,classification,content,created_at',ownerId),
        db.from('recommendation_batches').select('id,manifest_id,policy_version').eq('owner_id',ownerId).order('published_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    if (watches.error || slots.error)
        throw new Error(watches.error?.message ?? slots.error?.message);
    if (jobs.error || inventory.error)
        throw new Error(jobs.error?.message ?? inventory.error?.message);
    const notes = new Map<string, CoverageResearch & {
        id: string;
    }>();
    for (const [rows, instrumentType] of [[equities, 'equity'], [funds, 'etf']] as const)
        for (const row of rows) {
            const symbol = String(row.symbol);
            if (row.status === 'complete' && (!notes.has(symbol) || String(row.generated_at) > notes.get(symbol)!.generated_at))
                notes.set(symbol, { ...row, content: { advice: row.advice }, symbol, status: String(row.status), generated_at: String(row.generated_at), instrumentType, id: String(row.id) });
        }
    for(const check of checks){const note=notes.get(String(check.symbol));if(note&&note.id===check.research_note_id&&check.classification!=='full_research'&&object(check.content).readiness==='complete'&&!note.lastCheckedAt)note.lastCheckedAt=String(check.created_at)}
    const ready=new Set<string>();
    if(latest.error)throw new Error(latest.error.message);
    if(latest.data?.policy_version==='prospective-v1.7'){
        const [versions,manifest]=await Promise.all([
            db.from('recommendation_versions').select('symbol,content').eq('owner_id',ownerId).eq('batch_id',latest.data.id),
            db.from('recommendation_input_manifests').select('names:content->names').eq('owner_id',ownerId).eq('id',latest.data.manifest_id).single(),
        ]);
        if(versions.error||manifest.error)throw new Error(versions.error?.message??manifest.error?.message);
        const names=Array.isArray(manifest.data.names)?manifest.data.names.map(object):[];
        for(const symbol of decisionReadiness(versions.data.map(v=>{const content=object(v.content);const name=names.find(n=>n.symbol===v.symbol&&n.portfolioId===content.portfolioId);return {symbol:v.symbol,researchId:typeof object(name?.research).id==='string'?String(object(name?.research).id):null,action:String(content.action),expiresAt:String(content.expiresAt),blocked:Array.isArray(content.gateReasons)&&content.gateReasons.length>0}}),notes,now))ready.add(symbol);
    }
    const owned = [...new Set(portfolios.flatMap(p => p.holdings.filter(h => h.quantity > 0).map(h => h.symbol)))], byJob = selectCoverageJobs(jobs.data);
    const status = (symbol: string) => {
        const job=byJob.get(symbol),note=notes.get(symbol);
        if(job?.status==='running')return 'investigating';
        if(!note||!hasCurrentResearchContract(note.content))return 'awaiting';
        if(ready.has(symbol))return 'decision_ready';
        const advice=object(object(note.content).advice);
        const stance=String(object(advice[owned.includes(symbol)?'existingPositionStance':'newEntryStance']).value);
        return ['undetermined','wait','avoid'].includes(stance)?'unresolved':'researched';
    };
    const row = (symbol: string) => { const note = notes.get(symbol), job = byJob.get(symbol), support = object(object(object(note?.content).advice).decisionSupport); return { symbol, status: status(symbol), researched: Boolean(note), contractCurrent: hasCurrentResearchContract(note?.content), lastInvestigation: note?.generated_at ?? null,lastEvidenceCheck:note?.lastCheckedAt??null, nextCheck: object(support.followUp), job: job ? { status: job.status, error: job.last_error, scheduledFor: job.run_after } : null }; };
    const themes = INTEREST_THEMES.map(theme => { const rows = members.filter(m => m.theme === theme.id && m.active && !m.excluded).map(m => ({ ...row(String(m.symbol)), eligibleSince: String(m.eligible_since) })); return { ...theme, total: rows.length, researched: rows.filter(r => r.researched).length, awaiting: rows.filter(r => r.status === 'awaiting').length, investigating: rows.filter(r => r.status === 'investigating').length, decisionReady: rows.filter(r => r.status === 'decision_ready').length, unresolved: rows.filter(r => r.status === 'unresolved').length, oldestEligibility: rows.filter(r => r.status === 'awaiting').map(r => r.eligibleSince).sort()[0] ?? null }; });
    return { asOf: now.toISOString(), dailyLimit: 8, inventory: inventory.data?.content ?? null, themes, holdings: owned.map(row), members: members.map(m => ({ ...row(String(m.symbol)), theme: String(m.theme), excluded: Boolean(m.excluded), active: Boolean(m.active), eligibleSince: String(m.eligible_since), provenance: m.provenance })), metrics: { holdingTotal: owned.length, holdingContractCurrent: owned.filter(s => hasCurrentResearchContract(notes.get(s)?.content)).length, failedPrerequisites: owned.map(row).filter(hasFailedResearchPrerequisite).length, researchFailures: [...byJob.values()].filter(j => ['failed', 'blocked'].includes(j.status)).length, todayReserved: slots.data.length, todayStarted: slots.data.filter(s => s.started_at).length }, notes, owned, watchlisted: [...new Set(watches.data.map(w => w.symbol))], jobs: jobs.data };
}
type Enqueue = (type: 'generate-company-research' | 'generate-etf-research', payload: Record<string, unknown>, key: string, options?: {
    runAfter?: Date;
}) => Promise<{
    id: string;
    deduplicated: boolean;
}>;
export async function seedDecisionResearch(ownerId: string, enqueue: Enqueue, now = new Date(), options: {
    refreshMembership?: boolean;
    backfillAll?: boolean;
} = {}) {
    let classificationError:string|null=null;
    if (options.refreshMembership !== false)try {await refreshInterestMembership(ownerId,now)}catch(error){classificationError=error instanceof Error?error.message:'Classification refresh failed'}
    const c = await loadResearchCoverage(ownerId, now), active = new Set(c.jobs.filter(j => ['queued', 'running'].includes(j.status)).map(j => String(object(j.payload).symbol))), failures = new Map<string, string>(), backfill = c.owned.some(s => !hasCurrentResearchContract(c.notes.get(s)?.content));
    const failedSeen = new Set<string>();
    for (const j of c.jobs) {
        const symbol = String(object(j.payload).symbol);
        if (failedSeen.has(symbol))
            continue;
        failedSeen.add(symbol);
        if (['failed', 'blocked', 'cancelled'].includes(j.status))
            failures.set(symbol, j.updated_at);
    }
    const latestJobs = new Map<string, typeof c.jobs[number]>();
    for (const j of c.jobs) {
        const symbol = String(object(j.payload).symbol);
        if (!latestJobs.has(symbol))
            latestJobs.set(symbol, j);
    }
    const terminalUpgrades = new Set([...latestJobs].filter(([, j]) => ['failed', 'blocked'].includes(j.status) && object(j.payload).targetContractVersion === 2).map(([symbol]) => symbol));
    for (const symbol of terminalUpgrades)
        active.add(symbol);
    const target = (symbol: string, lane: CoverageTarget['lane'], eligibleSince: string, theme?: InterestTheme): CoverageTarget => ({ symbol, lane, theme, eligibleSince, instrumentType: c.notes.get(symbol)?.instrumentType ?? 'equity', forceFullResearch: !hasCurrentResearchContract(c.notes.get(symbol)?.content), researchId: c.notes.get(symbol)?.id });
    const owned = await Promise.all(c.owned.filter(s => investigationDue(c.notes.get(s), now)).map(async (s) => ({ ...target(s, 'owned', '1970-01-01'), instrumentType: c.notes.get(s)?.instrumentType==='etf'||await isEtfInstrument(s) ? 'etf' as const : 'equity' as const })));
    const interests = c.members.filter(m => m.active && !m.excluded && !c.owned.includes(m.symbol) && investigationDue(c.notes.get(m.symbol), now)).map(m => target(m.symbol, 'interest', m.eligibleSince, m.theme as InterestTheme));
    const watchlisted = c.watchlisted.filter(s => !c.owned.includes(s) && investigationDue(c.notes.get(s), now)).map(s => target(s, 'watchlist', '1970-01-01'));
    const selected = selectInvestigationTargets({ owned, interests, watchlisted, backfill, now, active, recentFailures: failures }), queued: Array<{
        symbol: string;
        jobId: string;
        date: string;
    }> = [];
    const queue = async (target: CoverageTarget, when: Date) => {
        const key = target.forceFullResearch
            ? `research-upgrade:${ownerId}:${target.symbol}:${RESEARCH_CONTRACT_VERSION}`
            : `research-investigation:${ownerId}:${target.symbol}:${investigationDate(when)}:${target.researchId ?? 'initial'}`;
        const reserved=await reserveInvestigation(ownerId,target.symbol,target.lane,key,when);
        // Borrow today's unused theme capacity, while keeping future backfill days at six holdings.
        if(!reserved && !(target.lane==='owned'&&investigationDate(when)===investigationDate(now)&&await reserveInvestigation(ownerId,target.symbol,'other',key,when)))return false;
        let jobId: string | null = null;
        try {
            const instrumentType = target.instrumentType==='etf'||await isEtfInstrument(target.symbol) ? 'etf' : 'equity';
            const job = await enqueue(instrumentType === 'etf' ? 'generate-etf-research' : 'generate-company-research', {
                ownerId,symbol:target.symbol,forceFullResearch:target.forceFullResearch,
                targetContractVersion:RESEARCH_CONTRACT_VERSION,researchPriority:target.lane,
                reason:target.forceFullResearch ? 'Research contract upgrade' : 'Scheduled decision evidence check',
            }, key, {runAfter:when});
            jobId=job.id;
            const saved=await database().from('research_investigation_slots').update({job_id:job.id})
                .eq('owner_id',ownerId).eq('symbol',target.symbol).eq('investigation_date',investigationDate(when));
            if(saved.error) throw new Error(saved.error.message);
            queued.push({symbol:target.symbol,jobId:job.id,date:investigationDate(when)});
            return true;
        } catch(error) {
            // Only an unstarted reservation without a durable job can be rolled back.
            if(!jobId) await database().from('research_investigation_slots').delete()
                .eq('owner_id',ownerId).eq('symbol',target.symbol).eq('investigation_date',investigationDate(when))
                .is('job_id',null).is('started_at',null);
            throw error;
        }
    };
    for (const t of selected)
        await queue(t, now);
    // Initial backfill has durable, dated jobs for every holding, even when today's slots are full.
    if (options.backfillAll) {
        let day = 0;
        for (const t of owned.filter(t => !active.has(t.symbol) && !queued.some(q => q.symbol === t.symbol))) {
            while (day < 60) {
                const when = new Date(now.getTime() + day * 86400000);
                if (await queue(t, when))
                    break;
                day++;
            }
            if (day >= 60)
                throw new Error('Unable to schedule holdings backfill within 60 days');
        }
    }
    return { backfill, ownedCount: c.owned.length, queued, inventory: c.inventory,classificationError };
}
/** Safe read model: no full research documents or private portfolio snapshots leave this endpoint. */
export function researchCoverageResponse(coverage: Awaited<ReturnType<typeof loadResearchCoverage>>) {
    const { asOf, dailyLimit, inventory, themes, holdings, members, metrics } = coverage;
    return { asOf, dailyLimit, inventory, themes, holdings, members, metrics };
}
export type ResearchCoverageResponse = ReturnType<typeof researchCoverageResponse>;
