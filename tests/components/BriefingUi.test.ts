import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const navPanelSource = readFileSync(
  join(process.cwd(), 'components/layout/NavPanel.tsx'),
  'utf8',
)

const clientLayoutSource = readFileSync(
  join(process.cwd(), 'components/layout/ClientLayout.tsx'),
  'utf8',
)

const modalSource = readFileSync(
  join(process.cwd(), 'components/IntelligenceBriefingsModal.tsx'),
  'utf8',
)

test('NavPanel lists Weekly Briefs directly after Morning Brief', () => {
  const morningBriefIndex = navPanelSource.indexOf('Morning Brief')
  const weeklyBriefsIndex = navPanelSource.indexOf('Weekly Briefs')
  const scopesLabelIndex = navPanelSource.indexOf('Scopes')

  assert.ok(morningBriefIndex >= 0)
  assert.ok(weeklyBriefsIndex > morningBriefIndex)
  assert.ok(scopesLabelIndex > weeklyBriefsIndex)
  assert.match(navPanelSource, />WB</)
})

test('ClientLayout manages the intelligence briefings modal globally', () => {
  assert.match(clientLayoutSource, /const \[isIntelligenceBriefingsOpen, setIsIntelligenceBriefingsOpen\] = useState\(false\)/)
  assert.match(clientLayoutSource, /setIsIntelligenceBriefingsOpen\(true\)/)
  assert.match(clientLayoutSource, />\s*Weekly Briefs\s*<\/button>/)
  assert.match(clientLayoutSource, /<IntelligenceBriefingsModal[\s\S]*open=\{isIntelligenceBriefingsOpen\}[\s\S]*onClose=\{\(\) => setIsIntelligenceBriefingsOpen\(false\)\}/)
})

test('IntelligenceBriefingsModal fetches both briefing payloads and defaults to weekly', () => {
  assert.match(modalSource, /const \[activeTab, setActiveTab\] = useState<'weekly' \| 'monthly'>\('weekly'\)/)
  assert.match(modalSource, /open \? '\/api\/overviews\/weekly' : null/)
  assert.match(modalSource, /open \? '\/api\/overviews\/monthly' : null/)
  assert.match(modalSource, /const closeModal = useCallback\(\(\) => \{[\s\S]*setActiveTab\('weekly'\)[\s\S]*onClose\(\)/)
})

test('IntelligenceBriefingsModal renders markdown and biweekly UI label', () => {
  assert.match(modalSource, /import ReactMarkdown from 'react-markdown'/)
  assert.match(modalSource, /<ReactMarkdown>\{activeBriefing\.content\}<\/ReactMarkdown>/)
  assert.match(modalSource, />\s*Biweekly\s*</)
  assert.match(modalSource, /No \{activeTab === 'weekly' \? 'weekly' : 'biweekly'\} briefing available yet\./)
})

test('IntelligenceBriefingsModal closes from backdrop and Escape', () => {
  assert.match(modalSource, /if \(event\.key === 'Escape'\) closeModal\(\)/)
  assert.match(modalSource, /<h2 className="text-\[18px\] font-bold text-\[var\(--text\)\]">Weekly Briefs<\/h2>/)
  assert.match(modalSource, /<button[\s\S]*onClick=\{closeModal\}[\s\S]*aria-label="Close weekly briefs"/)
  assert.match(modalSource, /aria-label="Close weekly briefs modal"/)
})
