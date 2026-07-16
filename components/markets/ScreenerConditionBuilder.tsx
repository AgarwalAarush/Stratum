'use client'

import {
  CaretDown,
  Check,
  MagnifyingGlass,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ScreenerFilter,
  ScreenerFilterField,
  ScreenerFilterOperator,
} from '@/lib/markets/types'

interface ScreenerConditionBuilderProps {
  filters: ScreenerFilter[]
  onChange: (filters: ScreenerFilter[]) => void
}

type ConditionCategory =
  | 'price-returns'
  | 'volume-liquidity'
  | 'trend'
  | '52-week'
  | 'listing'

interface ConditionDefinition {
  field: ScreenerFilterField
  title: string
  description: string
  category: ConditionCategory
  kind: 'number' | 'boolean' | 'exchange'
  unit?: string
  defaultOperator: ScreenerFilterOperator
  defaultValue: number | string | boolean
}

const CONDITION_DEFINITIONS: ConditionDefinition[] = [
  { field: 'price', title: 'Price', description: 'Current last traded price', category: 'price-returns', kind: 'number', unit: '$', defaultOperator: 'gt', defaultValue: 10 },
  { field: 'dailyChange', title: 'Price change', description: 'Return over the current trading day', category: 'price-returns', kind: 'number', unit: '%', defaultOperator: 'gt', defaultValue: 2 },
  { field: 'gap', title: 'Gap', description: "Difference between today's open and prior close", category: 'price-returns', kind: 'number', unit: '%', defaultOperator: 'gt', defaultValue: 2 },
  { field: 'volume', title: 'Volume', description: 'Shares traded during the current session', category: 'volume-liquidity', kind: 'number', defaultOperator: 'gt', defaultValue: 5_000_000 },
  { field: 'relativeVolume', title: 'Relative volume', description: 'Volume compared with the 20-day average', category: 'volume-liquidity', kind: 'number', unit: '×', defaultOperator: 'gt', defaultValue: 1.5 },
  { field: 'above50DayAverage', title: 'Trend', description: 'Price position relative to the 50-day average', category: 'trend', kind: 'boolean', defaultOperator: 'eq', defaultValue: true },
  { field: 'fiftyTwoWeekPosition', title: '52-week position', description: 'Current price position inside the 52-week range', category: '52-week', kind: 'number', unit: '%', defaultOperator: 'gte', defaultValue: 85 },
  { field: 'exchange', title: 'Exchange', description: 'Primary US listing venue', category: 'listing', kind: 'exchange', defaultOperator: 'eq', defaultValue: 'NASDAQ' },
  { field: 'tradable', title: 'Tradable', description: 'Eligible for trading through the connected market feed', category: 'listing', kind: 'boolean', defaultOperator: 'eq', defaultValue: true },
]

const CATEGORIES: Array<{ id: 'all' | ConditionCategory; label: string }> = [
  { id: 'all', label: 'All conditions' },
  { id: 'price-returns', label: 'Price & returns' },
  { id: 'volume-liquidity', label: 'Volume & liquidity' },
  { id: 'trend', label: 'Trend & moving averages' },
  { id: '52-week', label: '52-week context' },
  { id: 'listing', label: 'Listing & trading' },
]

const OPERATOR_LABELS: Record<ScreenerFilterOperator, string> = {
  gt: 'More than',
  gte: 'At least',
  lt: 'Less than',
  lte: 'At most',
  eq: 'Equal to',
}

const OPERATOR_SYMBOLS: Record<ScreenerFilterOperator, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
}

function definitionFor(field: ScreenerFilterField): ConditionDefinition {
  return CONDITION_DEFINITIONS.find((definition) => definition.field === field)!
}

function directionalField(field: ScreenerFilterField): boolean {
  return field === 'dailyChange' || field === 'gap'
}

function numberLabel(field: ScreenerFilterField, value: number, unit?: string): string {
  const magnitude = directionalField(field) ? value : Math.abs(value)
  if (field === 'volume') {
    if (magnitude >= 1_000_000) return `${(magnitude / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`
    if (magnitude >= 1_000) return `${(magnitude / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`
  }
  if (unit === '$') return `$${magnitude.toLocaleString('en-US')}`
  return `${magnitude.toLocaleString('en-US')}${unit ?? ''}`
}

export function formatScreenerFilter(filter: ScreenerFilter): string {
  const definition = definitionFor(filter.field)
  if (filter.field === 'above50DayAverage') return filter.value ? 'Above 50D MA' : 'Below 50D MA'
  if (filter.field === 'tradable') return `Tradable ${filter.value ? 'Yes' : 'No'}`
  if (filter.field === 'exchange') return `Exchange ${String(filter.value)}`
  const value = numberLabel(filter.field, Number(filter.value), definition.unit)
  return `${definition.title} ${OPERATOR_SYMBOLS[filter.operator]} ${value}`
}

function createDraft(definition: ConditionDefinition): ScreenerFilter {
  return {
    id: definition.field,
    field: definition.field,
    operator: definition.defaultOperator,
    value: definition.defaultValue,
    label: '',
  }
}

function withLabel(filter: ScreenerFilter): ScreenerFilter {
  return { ...filter, label: formatScreenerFilter(filter) }
}

interface ConditionFormProps {
  draft: ScreenerFilter
  onChange: (draft: ScreenerFilter) => void
}

function ConditionForm({ draft, onChange }: ConditionFormProps) {
  const definition = definitionFor(draft.field)
  const isDirectional = directionalField(draft.field)
  const direction = draft.operator === 'lt' || draft.operator === 'lte' || Number(draft.value) < 0 ? 'down' : 'up'

  const setDirection = (nextDirection: 'up' | 'down') => {
    const inclusive = draft.operator === 'gte' || draft.operator === 'lte'
    onChange({
      ...draft,
      operator: nextDirection === 'up' ? (inclusive ? 'gte' : 'gt') : (inclusive ? 'lte' : 'lt'),
      value: nextDirection === 'up' ? Math.abs(Number(draft.value)) : -Math.abs(Number(draft.value)),
    })
  }

  const numericOperators: ScreenerFilterOperator[] = isDirectional
    ? direction === 'up' ? ['gt', 'gte'] : ['lt', 'lte']
    : ['gt', 'gte', 'lt', 'lte', 'eq']

  return (
    <div className="market-condition-form">
      <div className="market-condition-form-heading">
        <strong>{definition.title}</strong>
        <span>{definition.description}</span>
      </div>

      {isDirectional && (
        <fieldset className="market-condition-fieldset">
          <legend>Direction</legend>
          <div className="market-condition-segmented">
            <button type="button" className={direction === 'up' ? 'market-condition-segment-active' : ''} onClick={() => setDirection('up')}>Up</button>
            <button type="button" className={direction === 'down' ? 'market-condition-segment-active' : ''} onClick={() => setDirection('down')}>Down</button>
          </div>
        </fieldset>
      )}

      {definition.kind === 'number' && (
        <>
          <label className="market-condition-control">
            <span>Operator</span>
            <select value={draft.operator} onChange={(event) => onChange({ ...draft, operator: event.target.value as ScreenerFilterOperator })}>
              {numericOperators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}
            </select>
          </label>
          <label className="market-condition-control">
            <span>Threshold</span>
            <span className="market-condition-input-shell">
              {definition.unit === '$' && <i>$</i>}
              <input
                type="number"
                min="0"
                step={draft.field === 'volume' ? 100000 : 0.1}
                value={Math.abs(Number(draft.value))}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  onChange({ ...draft, value: isDirectional && direction === 'down' ? -nextValue : nextValue })
                }}
              />
              {definition.unit && definition.unit !== '$' && <i>{definition.unit}</i>}
            </span>
          </label>
        </>
      )}

      {definition.kind === 'boolean' && (
        <label className="market-condition-control">
          <span>{draft.field === 'above50DayAverage' ? 'Position' : 'Value'}</span>
          <select value={String(draft.value)} onChange={(event) => onChange({ ...draft, value: event.target.value === 'true' })}>
            {draft.field === 'above50DayAverage' ? (
              <><option value="true">Above 50D MA</option><option value="false">Below 50D MA</option></>
            ) : (
              <><option value="true">Yes</option><option value="false">No</option></>
            )}
          </select>
        </label>
      )}

      {definition.kind === 'exchange' && (
        <label className="market-condition-control">
          <span>Exchange</span>
          <select value={String(draft.value)} onChange={(event) => onChange({ ...draft, value: event.target.value })}>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
            <option value="AMEX">AMEX</option>
          </select>
        </label>
      )}

      <div className="market-condition-preview">
        <span>Condition preview</span>
        <output>{formatScreenerFilter(withLabel(draft))}</output>
      </div>
    </div>
  )
}

export function ScreenerConditionBuilder({ filters, onChange }: ScreenerConditionBuilderProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'all' | ConditionCategory>('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<ScreenerFilter>(() => createDraft(CONDITION_DEFINITIONS[1]!))
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const editorRef = useRef<HTMLElement>(null)
  const modalRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!addOpen) return
    const trigger = addButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => searchRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => element.offsetParent !== null)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [addOpen])

  useEffect(() => {
    if (!editingId) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>('button, select, input')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [editingId])

  const visibleDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return CONDITION_DEFINITIONS.filter((definition) => {
      const inCategory = activeCategory === 'all' || definition.category === activeCategory
      const matchesSearch = !query || `${definition.title} ${definition.description}`.toLowerCase().includes(query)
      return inCategory && matchesSearch
    })
  }, [activeCategory, search])

  const openEditor = (filter: ScreenerFilter) => {
    setDraft({ ...filter })
    setEditingId(filter.id)
  }

  const openAdd = () => {
    const next = CONDITION_DEFINITIONS.find((definition) => !filters.some((filter) => filter.field === definition.field)) ?? CONDITION_DEFINITIONS[0]!
    setDraft(createDraft(next))
    setActiveCategory('all')
    setSearch('')
    setEditingId(null)
    setAddOpen(true)
  }

  const applyEdit = () => {
    onChange(filters.map((filter) => filter.id === editingId ? withLabel(draft) : filter))
    setEditingId(null)
  }

  const addCondition = () => {
    const existing = filters.find((filter) => filter.field === draft.field)
    if (existing) {
      onChange(filters.map((filter) => filter.id === existing.id ? withLabel({ ...draft, id: existing.id }) : filter))
    } else {
      onChange([...filters, withLabel({ ...draft, id: draft.field })])
    }
    setAddOpen(false)
  }

  const removeCondition = (id: string) => {
    onChange(filters.filter((filter) => filter.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <>
      <div className="market-filter-chips">
        {filters.map((filter) => (
          <span key={filter.id} className={`market-filter-chip-shell ${editingId === filter.id ? 'market-filter-chip-shell-active' : ''}`}>
            <button type="button" className="market-filter-chip-main" onClick={() => openEditor(filter)} aria-haspopup="dialog" aria-expanded={editingId === filter.id}>
              <span>{formatScreenerFilter(filter)}</span>
              <CaretDown size={12} aria-hidden="true" />
            </button>
            <button type="button" className="market-filter-chip-remove" onClick={() => removeCondition(filter.id)} aria-label={`Remove ${formatScreenerFilter(filter)}`}>
              <X size={12} />
            </button>

            {editingId === filter.id && (
              <>
                <button type="button" className="market-condition-popover-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setEditingId(null)} />
                <section ref={editorRef} className="market-condition-popover" role="dialog" aria-label={`Edit ${definitionFor(filter.field).title} condition`}>
                  <header>
                    <strong>{definitionFor(filter.field).title}</strong>
                    <div>
                      <button type="button" onClick={() => setDraft({ ...filter })}>Reset</button>
                      <button type="button" aria-label="Delete condition" onClick={() => removeCondition(filter.id)}><Trash size={15} /></button>
                    </div>
                  </header>
                  <ConditionForm draft={draft} onChange={setDraft} />
                  <footer>
                    <button type="button" className="market-condition-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    <button type="button" className="markets-primary-button" onClick={applyEdit}>Apply changes</button>
                  </footer>
                </section>
              </>
            )}
          </span>
        ))}
        <button ref={addButtonRef} type="button" className="market-add-condition" onClick={openAdd} disabled={filters.length >= CONDITION_DEFINITIONS.length}>
          + Add condition
        </button>
      </div>

      {addOpen && (
        <div className="market-condition-modal-layer">
          <button type="button" className="market-condition-modal-backdrop" aria-label="Close add condition dialog" onClick={() => setAddOpen(false)} />
          <section ref={modalRef} className="market-condition-modal" role="dialog" aria-modal="true" aria-labelledby="market-condition-modal-title">
            <header className="market-condition-modal-header">
              <h2 id="market-condition-modal-title">Add condition</h2>
              <button type="button" aria-label="Close add condition dialog" onClick={() => setAddOpen(false)}><X size={18} /></button>
            </header>
            <div className="market-condition-search">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${CONDITION_DEFINITIONS.length} supported conditions`} aria-label="Search screener conditions" />
            </div>
            <div className="market-condition-modal-body">
              <nav className="market-condition-categories" aria-label="Condition categories">
                {CATEGORIES.map((category) => {
                  const count = category.id === 'all' ? CONDITION_DEFINITIONS.length : CONDITION_DEFINITIONS.filter((definition) => definition.category === category.id).length
                  return (
                    <button key={category.id} type="button" className={activeCategory === category.id ? 'market-condition-category-active' : ''} onClick={() => setActiveCategory(category.id)}>
                      <span>{category.label}</span><span>{count}</span>
                    </button>
                  )
                })}
              </nav>
              <div className="market-condition-options" role="listbox" aria-label="Available conditions">
                {visibleDefinitions.length === 0 ? (
                  <p>No supported conditions match “{search}”.</p>
                ) : visibleDefinitions.map((definition) => {
                  const selected = draft.field === definition.field
                  const alreadyAdded = filters.some((filter) => filter.field === definition.field)
                  return (
                    <button key={definition.field} type="button" role="option" aria-selected={selected} className={selected ? 'market-condition-option-active' : ''} onClick={() => setDraft(createDraft(definition))}>
                      <span><strong>{definition.title}</strong><small>{definition.description}</small></span>
                      {selected ? <Check size={17} /> : alreadyAdded ? <small>Added</small> : null}
                    </button>
                  )
                })}
              </div>
              <aside className="market-condition-config">
                <ConditionForm draft={draft} onChange={setDraft} />
              </aside>
            </div>
            <footer className="market-condition-modal-footer">
              <span>{filters.some((filter) => filter.field === draft.field) ? 'This will update the existing condition.' : 'The condition will be added to the current screen.'}</span>
              <div>
                <button type="button" className="market-condition-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
                <button type="button" className="markets-primary-button" onClick={addCondition}>{filters.some((filter) => filter.field === draft.field) ? 'Update condition' : 'Add condition'}</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
