import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from './supabase.ts';
import { RESEARCH_CONTRACT_VERSION } from '../markets/research-contract.ts';
export function investigationDate(now = new Date()): string { return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
export async function reserveInvestigation(ownerId: string, symbol: string, lane: string, key: string, now = new Date(), start = false): Promise<boolean> {
    const db = getSupabaseClient();
    if (!db)
        throw new Error('Supabase service credentials are not configured');
    const r = await db.rpc('reserve_research_investigation', { p_owner_id: ownerId, p_date: investigationDate(now), p_symbol: symbol, p_lane: lane, p_key: key, p_contract: RESEARCH_CONTRACT_VERSION, p_start: start });
    if (r.error)
        throw new Error(`Unable to reserve research investigation: ${r.error.message}`);
    return r.data === true;
}
export async function startInvestigation(ownerId: string, symbol: string, key: string = randomUUID()): Promise<void> {
    if (!await reserveInvestigation(ownerId, symbol, 'other', key, new Date(), true))
        throw new Error('Daily research investigation capacity reached; resumes on the next New York date');
}
