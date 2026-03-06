export interface ScrapedArticle {
  title: string
  content: string // plain text, ~4000 char max
  url: string
}

export interface ArticleScraper {
  domains: string[]
  scrape: (url: string) => Promise<ScrapedArticle | null>
}
