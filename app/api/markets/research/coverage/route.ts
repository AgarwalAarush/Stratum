import { NextResponse } from 'next/server';
import { getAllowedMarketUser } from '@/lib/auth/markets-session';
import { loadResearchCoverage, researchCoverageResponse } from '@/lib/server/interest-coverage';
import { INTEREST_THEMES } from '@/lib/markets/interest-coverage';
import { getSupabaseClient } from '@/lib/server/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
    const user = await getAllowedMarketUser();
    if (!user)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        return NextResponse.json(researchCoverageResponse(await loadResearchCoverage(user.id)), { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch {
        return NextResponse.json({ error: 'Research coverage is temporarily unavailable.' }, { status: 503 });
    }
}
export async function PATCH(request: Request) {
    const user = await getAllowedMarketUser();
    if (!user)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    try {
        const input = await request.json(), db = getSupabaseClient();
        if (!db || typeof input.excluded !== 'boolean' || !INTEREST_THEMES.some(t => t.id === input.theme) || typeof input.symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,11}$/.test(input.symbol))
            return NextResponse.json({ error: 'Valid theme, symbol and exclusion required' }, { status: 400 });
        const result = await db.from('market_interest_memberships').update({ excluded: input.excluded }).eq('owner_id', user.id).eq('theme', input.theme).eq('symbol', input.symbol).select('symbol').maybeSingle();
        if (result.error)
            throw result.error;
        return NextResponse.json(result.data ?? { error: 'Membership not found' }, { status: result.data ? 200 : 404 });
    }
    catch {
        return NextResponse.json({ error: 'Unable to update coverage preference' }, { status: 400 });
    }
}
