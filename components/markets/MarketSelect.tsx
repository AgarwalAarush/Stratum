'use client'

import { CaretDown, Check } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'

export interface MarketSelectOption {
  value: string
  label: string
}

interface MarketSelectProps {
  options: MarketSelectOption[]
  value?: string
  defaultValue?: string
  name?: string
  ariaLabel?: string
  disabled?: boolean
  onChange?: (value: string) => void
}

export function MarketSelect({
  options,
  value,
  defaultValue,
  name,
  ariaLabel,
  disabled = false,
  onChange,
}: MarketSelectProps) {
  const [open, setOpen] = useState(false)
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const selectedValue = value ?? uncontrolledValue
  const selected = options.find((option) => option.value === selectedValue) ?? options[0]

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  const select = (nextValue: string) => {
    if (value === undefined) setUncontrolledValue(nextValue)
    onChange?.(nextValue)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="market-select">
      {name ? <input type="hidden" name={name} value={selectedValue} readOnly /> : null}
      <button
        ref={triggerRef}
        type="button"
        className="market-select-trigger"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{selected?.label ?? 'Choose an option'}</span>
        <CaretDown size={14} weight="bold" aria-hidden="true" />
      </button>
      {open ? <div id={listboxId} className="market-select-menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => {
          const active = option.value === selectedValue
          return <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => select(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
                triggerRef.current?.focus()
              }
            }}
          >
            <span>{option.label}</span>
            {active ? <Check size={15} weight="bold" aria-hidden="true" /> : <span aria-hidden="true" />}
          </button>
        })}
      </div> : null}
    </div>
  )
}

interface MarketMultiSelectProps {
  options: MarketSelectOption[]
  value: string[]
  ariaLabel?: string
  onChange: (value: string[]) => void
}

export function MarketMultiSelect({ options, value, ariaLabel, onChange }: MarketMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selected = options.filter((option) => value.includes(option.value))
  const label = selected.length === 0
    ? 'Choose one or more'
    : selected.length <= 2
      ? selected.map((option) => option.label).join(', ')
      : `${selected.slice(0, 2).map((option) => option.label).join(', ')} +${selected.length - 2}`

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  return (
    <div ref={rootRef} className="market-select market-multi-select">
      <button
        type="button"
        className="market-select-trigger"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{label}</span>
        <CaretDown size={14} weight="bold" aria-hidden="true" />
      </button>
      {open ? <div id={listboxId} className="market-select-menu" role="listbox" aria-label={ariaLabel} aria-multiselectable="true">
        {options.map((option) => {
          const active = value.includes(option.value)
          return <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onChange(active ? value.filter((item) => item !== option.value) : [...value, option.value])}
          >
            <span>{option.label}</span>
            {active ? <Check size={15} weight="bold" aria-hidden="true" /> : <span aria-hidden="true" />}
          </button>
        })}
        {value.length > 0 ? <button type="button" className="market-select-clear" onClick={() => onChange([])}>Clear selection</button> : null}
      </div> : null}
    </div>
  )
}
