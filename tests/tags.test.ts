import test from 'node:test'
import assert from 'node:assert/strict'

import { getTag } from '../lib/tags.ts'
import type { FeedItem } from '../lib/types.ts'

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString()
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString()

// ─── Discussion ───

test('discussion: HOT at 300 points', () => {
  const item: FeedItem = {
    type: 'discussion', id: '1', title: 'Test', points: 300,
    commentCount: 50, source: 'HN', publishedAt: daysAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('discussion: HOT at 200 comments', () => {
  const item: FeedItem = {
    type: 'discussion', id: '2', title: 'Test', points: 100,
    commentCount: 200, source: 'HN', publishedAt: daysAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('discussion: HOT via velocity (150pts + recent)', () => {
  const item: FeedItem = {
    type: 'discussion', id: '3', title: 'Test', points: 150,
    commentCount: 30, source: 'HN', publishedAt: hoursAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('discussion: NEW when fresh + moderate points', () => {
  const item: FeedItem = {
    type: 'discussion', id: '4', title: 'Test', points: 60,
    commentCount: 10, source: 'HN', publishedAt: hoursAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'new')
})

test('discussion: no tag for low engagement', () => {
  const item: FeedItem = {
    type: 'discussion', id: '5', title: 'Test', points: 20,
    commentCount: 5, source: 'HN', publishedAt: daysAgo(2), url: '#',
  }
  assert.equal(getTag(item), undefined)
})

// ─── Repo ───

test('repo: HOT at 10 stars/day', () => {
  const item: FeedItem = {
    type: 'repo', id: '1', owner: 'a', name: 'b', description: 'x',
    language: 'TS', starsPerDay: 10, totalStars: 100, url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('repo: HOT for established repo with 5 stars/day', () => {
  const item: FeedItem = {
    type: 'repo', id: '2', owner: 'a', name: 'b', description: 'x',
    language: 'TS', starsPerDay: 5, totalStars: 6000, url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('repo: NEW for young repo with 3+ stars/day', () => {
  const item: FeedItem = {
    type: 'repo', id: '3', owner: 'a', name: 'b', description: 'x',
    language: 'TS', starsPerDay: 4, totalStars: 50, url: '#',
  }
  assert.equal(getTag(item), 'new')
})

test('repo: no tag for low activity', () => {
  const item: FeedItem = {
    type: 'repo', id: '4', owner: 'a', name: 'b', description: 'x',
    language: 'TS', starsPerDay: 1, totalStars: 500, url: '#',
  }
  assert.equal(getTag(item), undefined)
})

// ─── Paper ───

test('paper: HOT for alphaXiv', () => {
  const item: FeedItem = {
    type: 'paper', id: 'alphaxiv-123', title: 'Test',
    authors: ['Alice'], categories: ['cs.AI'], publishedAt: daysAgo(5), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('paper: NEW for < 24hrs', () => {
  const item: FeedItem = {
    type: 'paper', id: 'arxiv-1', title: 'Test',
    authors: ['Alice'], categories: ['cs.AI'], publishedAt: hoursAgo(12), url: '#',
  }
  assert.equal(getTag(item), 'new')
})

test('paper: no tag for > 24hrs', () => {
  const item: FeedItem = {
    type: 'paper', id: 'arxiv-2', title: 'Test',
    authors: ['Alice'], categories: ['cs.AI'], publishedAt: daysAgo(2), url: '#',
  }
  assert.equal(getTag(item), undefined)
})

// ─── Earnings ───

test('earnings: BREAKING for miss > 10%', () => {
  const item: FeedItem = {
    type: 'earnings', id: '1', ticker: 'ACME', companyName: 'Acme',
    quarter: 'Q4 2025', reportDate: daysAgo(1), beat: false,
    epsActual: 0.80, epsEstimate: 1.00, url: '#',
  }
  assert.equal(getTag(item), 'breaking')
})

test('earnings: HOT for beat > 10%', () => {
  const item: FeedItem = {
    type: 'earnings', id: '2', ticker: 'ACME', companyName: 'Acme',
    quarter: 'Q4 2025', reportDate: daysAgo(1), beat: true,
    epsActual: 1.20, epsEstimate: 1.00, url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('earnings: VERIFIED for mild beat', () => {
  const item: FeedItem = {
    type: 'earnings', id: '3', ticker: 'ACME', companyName: 'Acme',
    quarter: 'Q4 2025', reportDate: daysAgo(1), beat: true,
    epsActual: 1.05, epsEstimate: 1.00, url: '#',
  }
  assert.equal(getTag(item), 'verified')
})

test('earnings: no tag for upcoming', () => {
  const item: FeedItem = {
    type: 'earnings', id: '4', ticker: 'ACME', companyName: 'Acme',
    quarter: 'Q1 2026', reportDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    url: '#',
  }
  assert.equal(getTag(item), undefined)
})

// ─── News ───

test('news: BREAKING for zero-day + fresh', () => {
  const item: FeedItem = {
    type: 'news', id: '1', title: 'Critical zero-day exploit found in Linux kernel',
    source: 'Ars Technica', publishedAt: hoursAgo(0.5), url: '#',
  }
  assert.equal(getTag(item), 'breaking')
})

test('news: BREAKING for high-urgency pattern regardless of age', () => {
  const item: FeedItem = {
    type: 'news', id: '2', title: 'Massive ransomware attack hits hospitals',
    source: 'Reuters', publishedAt: daysAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'breaking')
})

test('news: NEW for "launched" + < 3hrs', () => {
  const item: FeedItem = {
    type: 'news', id: '3', title: 'OpenAI launched GPT-5 with new capabilities',
    source: 'TechCrunch', publishedAt: hoursAgo(2), url: '#',
  }
  assert.equal(getTag(item), 'new')
})

test('news: NEW for general rollout headline in AI news topic', () => {
  const item: FeedItem = {
    type: 'news',
    id: '3b',
    title: 'Anthropic rolls out API access for Claude reasoning models',
    source: 'Anthropic News',
    canonicalSource: 'TechCrunch',
    topic: 'general',
    publishedAt: hoursAgo(2),
    url: '#',
  }
  assert.equal(getTag(item), 'new')
})

test('news: HOT for major general AI benchmark headline from tier-1 publisher', () => {
  const item: FeedItem = {
    type: 'news',
    id: '3c',
    title: 'OpenAI hits new benchmark milestone with reasoning model upgrade',
    source: 'AI News',
    canonicalSource: 'Bloomberg',
    topic: 'general',
    publishedAt: hoursAgo(2),
    url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('news: HOT for $2B acquisition', () => {
  const item: FeedItem = {
    type: 'news', id: '4', title: 'Google acquires AI startup for $2B',
    source: 'Bloomberg', publishedAt: daysAgo(1), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('news: HOT for tier-1 source + fresh', () => {
  const item: FeedItem = {
    type: 'news', id: '5', title: 'New regulations proposed for tech sector',
    source: 'Reuters', publishedAt: hoursAgo(3), url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('news: HOT for policy proposal from canonical publisher even when feed label is custom', () => {
  const item: FeedItem = {
    type: 'news',
    id: '5b',
    title: 'EU Commission proposes new AI compliance framework',
    source: 'AI Regulation',
    feedName: 'AI Regulation',
    publisher: 'Reuters',
    canonicalSource: 'Reuters',
    topic: 'policy',
    publishedAt: hoursAgo(2),
    url: '#',
  }
  assert.equal(getTag(item), 'hot')
})

test('news: BREAKING for fresh policy enforcement headline', () => {
  const item: FeedItem = {
    type: 'news',
    id: '5c',
    title: 'FTC fines AI startup after emergency probe into deceptive claims',
    source: 'Tech Antitrust',
    canonicalSource: 'Reuters',
    topic: 'policy',
    publishedAt: hoursAgo(0.5),
    url: '#',
  }
  assert.equal(getTag(item), 'breaking')
})

test('news: no tag for generic old article', () => {
  const item: FeedItem = {
    type: 'news', id: '6', title: 'A look at recent developments in cloud computing',
    source: 'Some Blog', publishedAt: daysAgo(3), url: '#',
  }
  assert.equal(getTag(item), undefined)
})

test('news: NEW for anything very fresh (< 1hr)', () => {
  const item: FeedItem = {
    type: 'news', id: '7', title: 'Some random tech update',
    source: 'Some Blog', publishedAt: hoursAgo(0.5), url: '#',
  }
  assert.equal(getTag(item), 'new')
})
