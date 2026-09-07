import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('Postgres atomically publishes immutable advice and safely leases newsletter retries', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
    create table agent_jobs(id uuid primary key,status text,claimed_by text,claimed_at timestamptz,attempts integer,max_attempts integer,last_error text,run_after timestamptz,updated_at timestamptz);
    create table agent_runs(id uuid primary key,job_id uuid,worker_id text,status text,output jsonb,error text,finished_at timestamptz,started_at timestamptz default now(),duration_ms integer);
    create table decision_reviews(id uuid primary key default gen_random_uuid(),owner_id uuid,decision_id uuid,reviewed_at timestamptz default now(),unique(owner_id,decision_id));
    create table market_assets(symbol text primary key,active boolean,tradable boolean,name text,exchange text,asset_class text,status text,source text,source_as_of timestamptz,raw jsonb,updated_at timestamptz);
    create table market_universe_members(universe text,symbol text,active boolean,source text,source_as_of timestamptz);
    create table market_watchlist_items(symbol text);
    create table market_snapshots(id uuid primary key,status text,is_latest boolean,row_count integer,published_at timestamptz,error text);
    create table screener_rows(snapshot_id uuid,symbol text,price numeric,data_as_of timestamptz);`)
    for (const file of [
      '202609070001_append_decision_reviews.sql',
      '202609070002_recommendation_ledger.sql',
      '202609070003_market_evidence_vintages.sql',
      '202609070004_investment_reconstruction.sql',
      '202609070005_atomic_agent_completion.sql',
      '202609070006_atomic_asset_universe.sql',
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          'utf8',
        ),
      )
    const owner = '00000000-0000-4000-8000-000000000001',
      portfolio = '00000000-0000-4000-8000-000000000002',
      manifest = '00000000-0000-4000-8000-000000000003'
    const context = {
      names: [
        {
          symbol: 'ABC',
          portfolioId: portfolio,
          securityId: 'asset-1',
          thesis: { id: 'thesis-1' },
        },
      ],
      evidence: [],
      gaps: ['fixture'],
    }
    await db.query(
      'insert into recommendation_input_manifests(id,owner_id,decision_date,decision_cutoff,policy_version,content_hash,content) values($1,$2,current_date,now(),$3,$4,$5)',
      [manifest, owner, 'test', 'hash', context],
    )
    await assert.rejects(
      () =>
        db.query('select publish_recommendation_batch($1,$2,$3,$4)', [
          manifest,
          [],
          {},
          'test',
        ]),
      /Incomplete/,
    )
    const rec = {
      symbol: 'ABC',
      portfolioId: portfolio,
      action: 'no_trade',
      forecasts: [],
      sourceIds: [],
      horizonDays: 20,
      gateReasons: ['test'],
    }
    await assert.rejects(
      () =>
        db.query('select publish_recommendation_batch($1,$2,$3,$4)', [
          manifest,
          [{ ...rec, sourceIds: ['invented'] }],
          {},
          'test',
        ]),
      /Unknown/,
    )
    assert.equal(
      (
        await db.query<{ count: number }>(
          'select count(*)::int from recommendation_batches',
        )
      ).rows[0].count,
      0,
    )
    const publish = () =>
      db.query<{ id: string }>(
        'select publish_recommendation_batch($1,$2,$3,$4) id',
        [manifest, [rec], {}, 'test'],
      )
    const id = (await publish()).rows[0].id
    assert.equal((await publish()).rows[0].id, id)
    assert.equal(
      (
        await db.query<{ count: number }>(
          'select count(*)::int from recommendation_evaluation_tasks',
        )
      ).rows[0].count,
      4,
    )
    for (const table of [
      'recommendation_batches',
      'recommendation_versions',
      'recommendation_input_manifests',
    ])
      await assert.rejects(() => db.exec(`delete from ${table}`), /append-only/)
    const outbox = await db.query<{ id: string }>(
      "insert into investment_newsletter_outbox(owner_id,edition_date,recipient,sender,subject,html,plain_text,content_hash) values($1,current_date,'owner@example.com','test@example.com','test','test','test','hash') returning id",
      [owner],
    )
    const oid = outbox.rows[0].id
    const claim = async () =>
      (
        await db.query<{ claimed: boolean }>(
          'select claim_investment_newsletter($1) claimed',
          [oid],
        )
      ).rows[0].claimed
    assert.equal(await claim(), true)
    assert.equal(await claim(), false)
    await db.query(
      "update investment_newsletter_delivery set lease_until=null,status='uncertain' where outbox_id=$1",
      [oid],
    )
    assert.equal(await claim(), true)
    await db.query(
      "update investment_newsletter_delivery set lease_until=null,status='uncertain',first_attempt_at=now()-interval '25 hours' where outbox_id=$1",
      [oid],
    )
    assert.equal(await claim(), false)
    await db.query(
      "select record_investment_newsletter_event('event-1',$1,'bounced',now())",
      [oid],
    )
    await db.query(
      "select record_investment_newsletter_event('event-2',$1,'delivered',now())",
      [oid],
    )
    assert.equal(
      (
        await db.query<{ status: string }>(
          'select status from investment_newsletter_delivery where outbox_id=$1',
          [oid],
        )
      ).rows[0].status,
      'bounced',
    )
    const assets = Array.from({ length: 450 }, (_, i) => ({
      symbol: `ASSET${i}`,
      alpaca_id: `id${i}`,
      name: 'Fixture',
      exchange: 'NYSE',
      asset_class: 'us_equity',
    }))
    await db.query('select replace_alpaca_asset_universe($1,now())', [assets])
    await assert.rejects(
      () =>
        db.query('select replace_alpaca_asset_universe($1,now())', [
          assets.slice(0, 20),
        ]),
      /Incomplete/,
    )
    await db.query('select replace_alpaca_asset_universe($1,now())', [
      [...assets.slice(1), { ...assets[0], symbol: 'NEW' }],
    ])
    assert.equal(
      (
        await db.query<{ active: boolean }>(
          "select active from market_assets where symbol='ASSET0'",
        )
      ).rows[0].active,
      false,
    )
    // Missing required membership keeps the old screen current.
    const snapshot = '00000000-0000-4000-8000-000000000004'
    await db.query(
      "insert into market_snapshots values($1,'building',false,0,null,null)",
      [snapshot],
    )
    await assert.rejects(
      () => db.query('select publish_screener_snapshot($1)', [snapshot]),
      /S&P 500/,
    )
    const job = '00000000-0000-4000-8000-000000000005',
      run = '00000000-0000-4000-8000-000000000006'
    await db.query(
      "insert into agent_jobs(id,status,claimed_by,attempts,max_attempts,last_error) values($1,'running','worker',1,3,'old failure')",
      [job],
    )
    await db.query(
      "insert into agent_runs(id,job_id,worker_id,status) values($1,$2,'worker','running')",
      [run, job],
    )
    await assert.rejects(
      () =>
        db.query(
          "select finish_agent_attempt($1,$2,'wrong',true,'{}',null,100,null)",
          [job, run],
        ),
      /Unknown/,
    )
    assert.equal(
      (await db.query<{ status: string }>('select status from agent_runs'))
        .rows[0].status,
      'running',
    )
    await db.query(
      "select finish_agent_attempt($1,$2,'worker',true,'{}',null,100,null)",
      [job, run],
    )
    assert.deepEqual(
      (await db.query('select status,last_error from agent_jobs')).rows[0],
      { status: 'succeeded', last_error: null },
    )
    assert.equal(
      (await db.query<{ status: string }>('select status from agent_runs'))
        .rows[0].status,
      'succeeded',
    )
    await db.exec(
      'grant select on recommendation_versions to authenticated;set role authenticated;',
    )
    assert.equal(
      (await db.query('select * from recommendation_versions')).rows.length,
      0,
    )
    await assert.rejects(
      () =>
        db.query('select publish_recommendation_batch($1,$2,$3,$4)', [
          manifest,
          [rec],
          {},
          'test',
        ]),
      /permission denied/,
    )
  } finally {
    await db.close()
  }
})
