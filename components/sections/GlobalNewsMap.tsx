'use client'

import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { MAP_MARKERS, CONFLICT_ZONES, type MapMarker } from '@/lib/data/map-markers'
import { US_DATA_CENTERS, US_NUCLEAR_FACILITIES, type USDataCenter, type USNuclearFacility } from '@/lib/data/us-markers'

const WORLD_GEO_URL = '/data/world-110m.json'
const US_GEO_URL = '/data/us-states-10m.json'

type SelectedItem =
  | { type: 'world'; marker: MapMarker }
  | { type: 'datacenter'; dc: USDataCenter }
  | { type: 'nuclear'; nf: USNuclearFacility }

// --- Helpers ---

function markerRadius(marker: MapMarker): number {
  if (marker.category === 'waterway') return 2
  switch (marker.intensity) {
    case 'critical': return 4.5
    case 'high': return 3.5
    case 'elevated': return 2.5
    case 'low':
    default: return 2
  }
}

function markerOpacity(marker: MapMarker): number {
  if (marker.category === 'waterway') return 0.6
  switch (marker.intensity) {
    case 'critical': return 1.0
    case 'high': return 0.8
    case 'elevated': return 0.6
    case 'low':
    default: return 0.4
  }
}

function dcRadius(chipCount: number): number {
  if (chipCount >= 100000) return 5
  if (chipCount >= 50000) return 4
  return 3
}

function formatChips(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

function buildConflictZoneGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: CONFLICT_ZONES.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [zone.coords],
      },
    })),
  }
}

// --- Legend configs ---

const WORLD_LEGEND: { label: string; radius: number; opacity: number; isWaterway?: boolean; isZone?: boolean }[] = [
  { label: 'low', radius: 2, opacity: 0.4 },
  { label: 'elevated', radius: 2.5, opacity: 0.6 },
  { label: 'high', radius: 3.5, opacity: 0.8 },
  { label: 'critical', radius: 4.5, opacity: 1.0 },
  { label: 'waterway', radius: 2, opacity: 0.6, isWaterway: true },
  { label: 'conflict zone', radius: 0, opacity: 0.08, isZone: true },
]

const US_LEGEND: { label: string; render: () => React.ReactNode }[] = [
  {
    label: '100K+ chips',
    render: () => (
      <svg width={12} height={12}><circle cx={6} cy={6} r={5} fill="var(--accent)" opacity={0.7} /></svg>
    ),
  },
  {
    label: '50K+',
    render: () => (
      <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="var(--accent)" opacity={0.7} /></svg>
    ),
  },
  {
    label: '10K+',
    render: () => (
      <svg width={8} height={8}><circle cx={4} cy={4} r={3} fill="var(--accent)" opacity={0.7} /></svg>
    ),
  },
  {
    label: 'planned',
    render: () => (
      <svg width={10} height={10}><circle cx={5} cy={5} r={3.5} fill="var(--accent)" opacity={0.4} strokeDasharray="2,2" stroke="var(--accent)" strokeWidth={0.8} /></svg>
    ),
  },
  {
    label: 'nuclear',
    render: () => (
      <svg width={8} height={8}><rect x={1.5} y={1.5} width={5} height={5} fill="var(--red, #ef4444)" opacity={0.5} transform="rotate(45, 4, 4)" /></svg>
    ),
  },
]

// --- Component ---

export function GlobalNewsMap() {
  const [view, setView] = useState<'world' | 'us'>('world')
  const [selected, setSelected] = useState<SelectedItem | null>(null)

  const conflictGeoJSON = useMemo(buildConflictZoneGeoJSON, [])

  const clearSelection = () => setSelected(null)

  return (
    <section className="border-b border-border">
      {/* Header with toggle */}
      <div
        className="flex items-center justify-between px-6 border-b border-[var(--border-subtle)]"
        style={{ height: 'var(--section-header-height)' }}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Global Overview
        </span>
        <div className="flex font-mono text-[9px] uppercase tracking-wider">
          <button
            onClick={() => { setView('world'); clearSelection() }}
            className={`px-2 py-0.5 border border-[var(--border-subtle)] rounded-l transition-colors ${
              view === 'world'
                ? 'bg-[var(--surface-2)] text-[var(--text)]'
                : 'text-text-muted hover:text-[var(--text)]'
            }`}
          >
            World
          </button>
          <button
            onClick={() => { setView('us'); clearSelection() }}
            className={`px-2 py-0.5 border border-[var(--border-subtle)] border-l-0 rounded-r transition-colors ${
              view === 'us'
                ? 'bg-[var(--surface-2)] text-[var(--text)]'
                : 'text-text-muted hover:text-[var(--text)]'
            }`}
          >
            US
          </button>
        </div>
      </div>

      {/* Map area */}
      <div className="px-2">
        {view === 'world' ? (
          <ComposableMap
            projection="geoNaturalEarth1"
            projectionConfig={{ scale: 120, center: [10, 10] }}
            width={800}
            height={340}
            style={{ width: '100%', height: 'auto' }}
          >
            {/* Country polygons */}
            <Geographies geography={WORLD_GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--surface-2)"
                    stroke="var(--border-subtle)"
                    strokeWidth={0.4}
                    onClick={clearSelection}
                    style={{
                      default: { outline: 'none', cursor: 'default' },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Conflict zone shading */}
            <Geographies geography={conflictGeoJSON}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--accent)"
                    fillOpacity={0.08}
                    stroke="none"
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Markers */}
            {MAP_MARKERS.map((marker) => {
              const r = markerRadius(marker)
              const opacity = markerOpacity(marker)
              const isCritical = marker.intensity === 'critical'
              const isWaterway = marker.category === 'waterway'
              const isSelected = selected?.type === 'world' && selected.marker.id === marker.id

              return (
                <Marker key={marker.id} coordinates={[marker.lon, marker.lat]}>
                  <circle
                    r={isSelected ? r + 1 : r}
                    fill={isWaterway ? 'var(--text-muted)' : 'var(--accent)'}
                    opacity={opacity}
                    className={isCritical ? 'animate-pulse-marker' : undefined}
                    onClick={(e) => { e.stopPropagation(); setSelected({ type: 'world', marker }) }}
                    cursor="pointer"
                  />
                  {!isSelected && <title>{`${marker.name} — ${marker.subtext}`}</title>}
                </Marker>
              )
            })}
          </ComposableMap>
        ) : (
          <ComposableMap
            projection="geoAlbersUsa"
            width={800}
            height={440}
            style={{ width: '100%', height: 'auto' }}
          >
            {/* State polygons */}
            <Geographies geography={US_GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--surface-2)"
                    stroke="var(--border-subtle)"
                    strokeWidth={0.4}
                    onClick={clearSelection}
                    style={{
                      default: { outline: 'none', cursor: 'default' },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Data center markers */}
            {US_DATA_CENTERS.map((dc) => {
              const r = dcRadius(dc.chipCount)
              const isPlanned = dc.status === 'planned'
              const isSelected = selected?.type === 'datacenter' && selected.dc.id === dc.id

              return (
                <Marker key={dc.id} coordinates={[dc.lon, dc.lat]}>
                  <circle
                    r={isSelected ? r + 1 : r}
                    fill="var(--accent)"
                    opacity={isPlanned ? 0.4 : 0.7}
                    onClick={(e) => { e.stopPropagation(); setSelected({ type: 'datacenter', dc }) }}
                    cursor="pointer"
                    strokeDasharray={isPlanned ? '2,2' : undefined}
                    stroke={isPlanned ? 'var(--accent)' : undefined}
                    strokeWidth={isPlanned ? 0.8 : undefined}
                  />
                  {!isSelected && <title>{`${dc.name} — ${dc.owner} (${formatChips(dc.chipCount)} chips)`}</title>}
                </Marker>
              )
            })}

            {/* Nuclear facility markers (diamonds) */}
            {US_NUCLEAR_FACILITIES.map((nf) => {
              const size = nf.type === 'plant' ? 2.5 : 3
              const isSelected = selected?.type === 'nuclear' && selected.nf.id === nf.id

              return (
                <Marker key={nf.id} coordinates={[nf.lon, nf.lat]}>
                  <rect
                    x={-size}
                    y={-size}
                    width={size * 2}
                    height={size * 2}
                    fill="var(--red, #ef4444)"
                    opacity={nf.status === 'active' ? 0.5 : 0.25}
                    transform={`rotate(45)`}
                    onClick={(e) => { e.stopPropagation(); setSelected({ type: 'nuclear', nf }) }}
                    cursor="pointer"
                  />
                  {!isSelected && <title>{`${nf.name} — ${nf.type}`}</title>}
                </Marker>
              )
            })}
          </ComposableMap>
        )}
      </div>

      {/* Info bar or Legend */}
      {selected ? (
        <InfoBar selected={selected} onClose={clearSelection} />
      ) : view === 'world' ? (
        <WorldLegend />
      ) : (
        <USLegend />
      )}
    </section>
  )
}

// --- Info Bar ---

function InfoBar({ selected, onClose }: { selected: SelectedItem; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-0.5 px-6 pb-2.5 pt-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <InfoDot selected={selected} />
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">
            {infoName(selected)}
          </span>
          <span className="font-mono text-[9px] text-text-muted truncate">
            {infoSubtext(selected)}
          </span>
          {infoBadge(selected)}
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[10px] text-text-muted hover:text-[var(--text)] ml-auto shrink-0 px-1"
        >
          ✕
        </button>
      </div>
      <p className="font-mono text-[11px] text-text-muted leading-relaxed">
        {infoDescription(selected)}
      </p>
    </div>
  )
}

function InfoDot({ selected }: { selected: SelectedItem }) {
  if (selected.type === 'nuclear') {
    return (
      <svg width={8} height={8} className="shrink-0">
        <rect x={1.5} y={1.5} width={5} height={5} fill="var(--red, #ef4444)" opacity={0.5} transform="rotate(45, 4, 4)" />
      </svg>
    )
  }
  const isWaterway = selected.type === 'world' && selected.marker.category === 'waterway'
  return (
    <svg width={8} height={8} className="shrink-0">
      <circle cx={4} cy={4} r={3} fill={isWaterway ? 'var(--text-muted)' : 'var(--accent)'} opacity={0.8} />
    </svg>
  )
}

function infoName(s: SelectedItem): string {
  switch (s.type) {
    case 'world': return s.marker.name
    case 'datacenter': return s.dc.name
    case 'nuclear': return s.nf.name
  }
}

function infoSubtext(s: SelectedItem): string {
  switch (s.type) {
    case 'world': return s.marker.subtext
    case 'datacenter': return s.dc.owner
    case 'nuclear': return s.nf.type === 'plant' ? 'Nuclear Power Plant' : s.nf.type === 'enrichment' ? 'Enrichment Facility' : 'Weapons Facility'
  }
}

function infoDescription(s: SelectedItem): string {
  switch (s.type) {
    case 'world': return s.marker.description
    case 'datacenter': {
      const parts = [`${formatChips(s.dc.chipCount)} chips`, s.dc.chipType]
      if (s.dc.powerMW) parts.push(`${s.dc.powerMW} MW`)
      parts.push(s.dc.status === 'planned' ? 'Planned' : 'Existing')
      return parts.join(' · ')
    }
    case 'nuclear': return `Status: ${s.nf.status}`
  }
}

function infoBadge(s: SelectedItem): React.ReactNode {
  if (s.type === 'world' && s.marker.intensity) {
    return (
      <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-text-muted shrink-0">
        {s.marker.intensity}
      </span>
    )
  }
  if (s.type === 'datacenter') {
    return (
      <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-text-muted shrink-0">
        {formatChips(s.dc.chipCount)}
      </span>
    )
  }
  return null
}

// --- Legends ---

function WorldLegend() {
  return (
    <div className="flex items-center justify-center gap-4 px-6 pb-2.5 pt-0.5 flex-wrap">
      {WORLD_LEGEND.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.isZone ? (
            <svg width={10} height={8}>
              <rect x={0} y={0} width={10} height={8} fill="var(--accent)" opacity={0.08} rx={1} />
            </svg>
          ) : (
            <svg width={item.radius * 2 + 2} height={item.radius * 2 + 2}>
              <circle
                cx={item.radius + 1}
                cy={item.radius + 1}
                r={item.radius}
                fill={item.isWaterway ? 'var(--text-muted)' : 'var(--accent)'}
                opacity={item.opacity}
              />
            </svg>
          )}
          <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function USLegend() {
  return (
    <div className="flex items-center justify-center gap-4 px-6 pb-2.5 pt-0.5 flex-wrap">
      {US_LEGEND.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.render()}
          <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}
