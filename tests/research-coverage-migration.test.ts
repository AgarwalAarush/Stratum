import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { MARKETS_OWNER_ID } from '../lib/auth/markets-auth.ts'
import { INTEREST_WATCHLISTS } from '../lib/markets/research-coverage-scheduling.ts'

test('interest setup is owner-scoped, additive and one-time under the real Postgres migration', async () => {
  const db = new PGlite()
  const otherOwner = '00000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table market_users(id uuid primary key);
      create table agent_jobs(id uuid primary key default gen_random_uuid());
      create table market_assets(symbol text primary key,name text,exchange text,asset_class text,status text,tradable boolean,active boolean,source text,source_as_of timestamptz,raw jsonb,updated_at timestamptz);
      create table market_watchlists(id uuid primary key default gen_random_uuid(),owner_id uuid references market_users(id),client_id text,name text);
      create unique index market_watchlists_owner_client on market_watchlists(owner_id,client_id) where owner_id is not null;
      create table market_watchlist_items(watchlist_id uuid references market_watchlists(id),symbol text references market_assets(symbol),primary key(watchlist_id,symbol));`)
    await db.exec(await readFile(new URL('../supabase/migrations/202610030002_research_coverage.sql', import.meta.url), 'utf8'))
    await db.query('insert into market_users(id) values($1),($2)', [MARKETS_OWNER_ID, otherOwner])
    await db.query("insert into market_watchlists(owner_id,client_id,name) values($1,'interest-photonics','My optics'),($2,'private-other','Other owner')", [MARKETS_OWNER_ID, otherOwner])
    await db.exec("insert into market_assets(symbol,name,status,tradable,active) values('LITE','Verified Lumentum','active',true,true),('CUSTOM','My custom symbol','active',true,true)")
    await db.query("insert into market_watchlist_items(watchlist_id,symbol) select id,'CUSTOM' from market_watchlists where owner_id=$1 and client_id='interest-photonics'", [MARKETS_OWNER_ID])
    const seed = async (ownerId: string) => (await db.query<{ seeded: boolean }>('select seed_market_interest_watchlists($1,$2) as seeded', [ownerId, JSON.stringify(INTEREST_WATCHLISTS)])).rows[0].seeded
    assert.equal(await seed(otherOwner), false)
    assert.equal(await seed(MARKETS_OWNER_ID), true)
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from market_watchlists where owner_id=$1', [MARKETS_OWNER_ID])).rows[0].n, 6)
    assert.equal((await db.query<{ name: string }>("select name from market_watchlists where owner_id=$1 and client_id='interest-photonics'", [MARKETS_OWNER_ID])).rows[0].name, 'My optics')
    assert.deepEqual((await db.query<{ symbol: string }>("select symbol from market_watchlist_items i join market_watchlists w on w.id=i.watchlist_id where w.owner_id=$1 and w.client_id='interest-photonics' order by symbol", [MARKETS_OWNER_ID])).rows.map(row => row.symbol), ['AAOI', 'CIEN', 'COHR', 'CUSTOM', 'LITE'])
    assert.deepEqual((await db.query<{ name: string; active: boolean; tradable: boolean }>("select name,active,tradable from market_assets where symbol='LITE'")).rows[0], { name: 'Verified Lumentum', active: true, tradable: true })
    assert.deepEqual((await db.query<{ status: string; active: boolean; tradable: boolean }>("select status,active,tradable from market_assets where symbol='COHR'")).rows[0], { status: 'unresolved', active: false, tradable: false })
    // Respect later user edits instead of resurrecting removed defaults.
    await db.query("delete from market_watchlist_items where symbol='LITE' and watchlist_id in (select id from market_watchlists where owner_id=$1)", [MARKETS_OWNER_ID])
    assert.equal(await seed(MARKETS_OWNER_ID), false)
    assert.equal((await db.query("select * from market_watchlist_items where symbol='LITE'")).rows.length, 0)
    assert.equal((await db.query('select * from market_watchlists where owner_id=$1', [otherOwner])).rows.length, 1)
    const privileges = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','seed_market_interest_watchlists(uuid,jsonb)','execute') as allowed")
    assert.equal(privileges.rows[0].allowed, false)
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated','market_research_coverage','select') as allowed")).rows[0].allowed, false)
  } finally { await db.close() }
})
