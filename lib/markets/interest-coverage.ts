import { hasCurrentResearchContract } from './research-contract.ts';
export const INTEREST_THEMES = [
    { id: 'ai', label: 'Artificial intelligence' }, { id: 'photonics', label: 'Photonics' }, { id: 'nuclear', label: 'Nuclear' },
    { id: 'energy', label: 'Energy' }, { id: 'sustainable_energy', label: 'Sustainable energy' }, { id: 'space', label: 'Space' },
] as const;
export type InterestTheme = typeof INTEREST_THEMES[number]['id'];
/** Seeds supplement broad provider classification; they never substitute for company research. */
export const INTEREST_SEEDS: Record<InterestTheme, readonly string[]> = {
    ai: ['NVDA', 'AMD', 'AVGO', 'ARM', 'TSM', 'ASML', 'AMAT', 'LRCX', 'KLAC', 'MU', 'MRVL', 'ANET', 'VRT', 'MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL', 'PLTR', 'SNOW', 'DDOG', 'NET', 'NOW', 'CRM', 'ADBE', 'APP', 'AI', 'PATH', 'SOUN', 'BBAI', 'TEM', 'NBIS'],
    photonics: ['LITE', 'COHR', 'CRDO', 'MTSI', 'AAOI', 'FN', 'IPGP', 'CIEN', 'NOK', 'GLW', 'POET'],
    nuclear: ['CEG', 'BWXT', 'LEU', 'CCJ', 'SMR', 'OKLO', 'NNE', 'UEC', 'UUUU', 'DNN', 'NXE', 'LTBR'],
    energy: ['VST', 'NRG', 'GEV', 'ETN', 'PWR', 'CEG', 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'EQIX', 'DLR'],
    sustainable_energy: ['NEE', 'FSLR', 'ENPH', 'SEDG', 'RUN', 'BE', 'PLUG', 'FLNC', 'STEM', 'ARRY', 'NXT', 'CSIQ', 'JKS', 'BEPC', 'CWEN', 'ORA', 'GEV', 'TSLA', 'PWR', 'ETN'],
    space: ['RKLB', 'PL', 'ASTS', 'RDW', 'LUNR', 'BKSY', 'SPIR', 'SATL', 'VSAT', 'IRDM', 'GSAT', 'LMT', 'NOC'],
};
export function classifyInterestProfile(profile: {
    symbol: string;
    sector?: unknown;
    industry?: unknown;
    description?: unknown;
}): Array<{
    theme: InterestTheme;
    basis: string;
}> {
    const industry = String(profile.industry ?? ''), sector = String(profile.sector ?? ''), description = String(profile.description ?? '');
    const result = new Map<InterestTheme, string>();
    for (const { id } of INTEREST_THEMES)
        if (INTEREST_SEEDS[id].includes(profile.symbol))
            result.set(id, 'Explicit Stratum interest registry; investigation required');
    if (/energy/i.test(sector) || /oil|gas|electrical equipment|utilities|renewable|solar|wind/i.test(industry))
        result.set('energy', `Provider industry: ${industry}; sector: ${sector}`);
    if (/solar|renewable|wind|fuel cell|energy storage/i.test(industry) || /solar panel|wind turbine|battery storage|geothermal/i.test(description))
        result.set('sustainable_energy', `Provider classification: ${industry}; relevant product description`);
    if (/uranium|nuclear/i.test(industry) || /nuclear reactor|uranium|nuclear power/i.test(description))
        result.set('nuclear', `Provider classification: ${industry}; nuclear product description`);
    if (/semiconductor/i.test(industry) || /artificial intelligence|machine learning|AI accelerator|large language model/i.test(description))
        result.set('ai', `Provider classification: ${industry}; AI product description`);
    if (/photon|optical transceiver|fiber.optic|laser diode|silicon photonics/i.test(description))
        result.set('photonics', 'Provider product description identifies optical capabilities');
    if (/satellite|space launch|spacecraft|orbital/i.test(description))
        result.set('space', 'Provider product description identifies space capabilities');
    return [...result].map(([theme, basis]) => ({ theme, basis }));
}
export type CoverageResearch = {
    symbol: string;
    status: string;
    generated_at: string; lastCheckedAt?:string;
    content?: unknown;
    instrumentType: 'equity' | 'etf';
};
export type CoverageTarget = {
    symbol: string;
    lane: 'owned' | 'interest' | 'watchlist';
    instrumentType: 'equity' | 'etf';
    forceFullResearch: boolean;
    theme?: InterestTheme;
    researchId?: string;
    eligibleSince: string;
};
export function investigationDue(note: CoverageResearch | undefined, now: Date): boolean {
    if (!note)
        return true;
    if (note.status === 'queued' || note.status === 'running')
        return false;
    if (note.status !== 'complete' || !hasCurrentResearchContract(note.content))
        return true;
    const a = (note.content as {
        advice?: {
            decisionSupport?: {
                followUp?: {
                    nextCheckAt?: string | null;
                };
            };
        };
    })?.advice;
    const next = a?.decisionSupport?.followUp?.nextCheckAt;
    // Undisclosed metrics and future events without a date await the materiality monitor.
    const checked=Math.max(Date.parse(note.generated_at),Date.parse(note.lastCheckedAt??note.generated_at));
    return Boolean(next&&Date.parse(next)>checked&&Date.parse(next)<=now.getTime())||now.getTime()-checked>35*86400000;
}
export function selectInvestigationTargets(input: {
    owned: CoverageTarget[];
    interests: CoverageTarget[];
    watchlisted?: CoverageTarget[];
    backfill: boolean;
    now: Date;
    recentFailures?: Map<string, string>;
    active?: Set<string>;
}): CoverageTarget[] {
    const seen = new Set<string>(), out: CoverageTarget[] = [];
    const eligible = (t: CoverageTarget) => !input.active?.has(t.symbol) && (!input.recentFailures?.has(t.symbol) || input.now.getTime() - Date.parse(input.recentFailures.get(t.symbol)!) >= 86400000);
    const add = (t: CoverageTarget | undefined) => { if (t && out.length < 8 && !seen.has(t.symbol) && eligible(t)) {
        seen.add(t.symbol);
        out.push(t);
    } };
    const sorted = (rows: CoverageTarget[]) => [...rows].sort((a, b) => Number(b.forceFullResearch) - Number(a.forceFullResearch) || a.eligibleSince.localeCompare(b.eligibleSince) || a.symbol.localeCompare(b.symbol));
    const own = sorted(input.owned).filter(eligible), interests = sorted(input.interests).filter(eligible);
    own.slice(0, input.backfill ? 6 : 2).forEach(add);
    if (input.backfill)
        add(interests.find(t => t.theme === 'photonics' && t.symbol === 'LITE'));
    const day = Math.floor(input.now.getTime() / 86400000), themes = [...INTEREST_THEMES];
    // Rotate which theme receives scarce backfill slots; never use alphabetic ticker order as admission.
    for (let i = 0; i < themes.length; i++) {
        const theme = themes[(day + i) % themes.length]!.id;
        const options = interests.filter(t => t.theme === theme && !seen.has(t.symbol));
        add(theme === 'photonics' ? options.find(t => t.symbol === 'LITE') ?? options[0] : options[0]);
        if (input.backfill && out.filter(t => t.lane === 'interest').length >= 2)
            break;
    }
    for (const row of [...own, ...interests, ...sorted(input.watchlisted ?? [])])
        add(row);
    return out;
}
/** Reviewed interest research earns bounded decision coverage independently of Scout recency. */
export function admitInterestResearch(members: Array<{
    symbol: string;
    theme: string;
    eligible_since: string;
}>, notes: Array<{
    symbol: string;
    status: string;
    generated_at: string;
    content: unknown;
}>, covered: Set<string>, cutoff: string, limit = 6): string[] {
    const available = new Set(notes.filter(n => n.status === 'complete' && Date.parse(n.generated_at) <= Date.parse(cutoff) && Date.parse(cutoff) - Date.parse(n.generated_at) < 35 * 86400000 && hasCurrentResearchContract(n.content)).map(n => n.symbol));
    const eligible = members.filter(m => available.has(m.symbol) && !covered.has(m.symbol)).sort((a, b) => a.eligible_since.localeCompare(b.eligible_since) || a.symbol.localeCompare(b.symbol));
    const selected: string[] = [], day = Math.floor(Date.parse(cutoff) / 86400000);
    for (let i = 0; i < INTEREST_THEMES.length; i++) {
        const theme = INTEREST_THEMES[(day + i) % INTEREST_THEMES.length]!.id;
        const member = eligible.find(m => m.theme === theme && !selected.includes(m.symbol));
        if (member && selected.length < limit)
            selected.push(member.symbol);
    }
    for (const member of eligible)
        if (selected.length < limit && !selected.includes(member.symbol))
            selected.push(member.symbol);
    return selected;
}

export function decisionReadiness(recommendations:Array<{symbol:string;researchId:string|null;action:string;expiresAt:string;blocked:boolean}>,notes:Map<string,CoverageResearch&{id:string}>,now:Date):Set<string>{
 return new Set(recommendations.filter(r=>['buy','add','hold','trim','sell'].includes(r.action)&&!r.blocked&&Date.parse(r.expiresAt)>now.getTime()&&notes.get(r.symbol)?.id===r.researchId&&hasCurrentResearchContract(notes.get(r.symbol)?.content)).map(r=>r.symbol))
}
