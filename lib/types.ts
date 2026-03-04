// lib/types.ts

export type ItemType = 'paper' | 'discussion' | 'repo' | 'earnings' | 'news'

export type Theme = 'dark' | 'light'

// ─── Scope & Section registry types ───

export interface SectionDef {
  id: string
  label: string
  sources: string[]
  itemType: ItemType
  apiPath: string
}

export interface ScopeDef {
  id: string
  label: string
  sections: SectionDef[]
}

// ─── Data item types ───

export interface PaperItem {
  type: 'paper'
  id: string
  title: string
  authors: string[]          // first author + "et al." if >2
  categories: string[]       // e.g. ['cs.LG', 'cs.AI']
  publishedAt: string        // ISO date string
  url: string
  abstractUrl?: string
}

export interface DiscussionItem {
  type: 'discussion'
  id: string
  title: string
  points: number
  commentCount: number
  source: 'HN' | 'Lobste.rs'
  publishedAt: string
  url: string
}

export interface RepoItem {
  type: 'repo'
  id: string
  owner: string
  name: string
  description: string
  language: string
  starsToday: number
  totalStars: number
  url: string
}

export interface EarningsItem {
  type: 'earnings'
  id: string
  ticker: string
  companyName: string
  quarter: string            // e.g. 'Q4 2025'
  reportDate: string         // ISO date string
  epsActual?: number
  epsEstimate?: number
  revenueActual?: number     // in millions
  revenueEstimate?: number
  beat?: boolean             // true = beat, false = miss, undefined = upcoming
  url: string
}

export interface NewsItem {
  type: 'news'
  id: string
  title: string
  source: string
  category?: string          // e.g. 'Series B', 'M&A', 'Policy'
  publishedAt: string
  url: string
}

export type FeedItem = PaperItem | DiscussionItem | RepoItem | EarningsItem | NewsItem

// ─── API response shape ───

export interface SectionData {
  items: FeedItem[]
  fetchedAt: string          // ISO date string
}
