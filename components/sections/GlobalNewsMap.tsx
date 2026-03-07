'use client'

import { memo } from 'react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { MAP_MARKERS, type MapMarker } from '@/lib/data/map-markers'

const GEO_URL = '/data/world-110m.json'

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

const LEGEND_ITEMS: readonly { label: string; radius: number; opacity: number; isWaterway?: boolean }[] = [
  { label: 'low', radius: 2, opacity: 0.4 },
  { label: 'elevated', radius: 2.5, opacity: 0.6 },
  { label: 'high', radius: 3.5, opacity: 0.8 },
  { label: 'critical', radius: 4.5, opacity: 1.0 },
  { label: 'waterway', radius: 2, opacity: 0.6, isWaterway: true },
]

export const GlobalNewsMap = memo(function GlobalNewsMap() {
  return (
    <section className="border-b border-border">
      <div
        className="flex items-center px-6 border-b border-[var(--border-subtle)]"
        style={{ height: 'var(--section-header-height)' }}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Global Overview
        </span>
      </div>

      <div className="px-2">
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 120, center: [10, 10] }}
          width={800}
          height={340}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="var(--surface-2)"
                  stroke="var(--border-subtle)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {MAP_MARKERS.map((marker) => {
            const r = markerRadius(marker)
            const opacity = markerOpacity(marker)
            const isCritical = marker.intensity === 'critical'
            const isWaterway = marker.category === 'waterway'

            return (
              <Marker key={marker.id} coordinates={[marker.lon, marker.lat]}>
                <circle
                  r={r}
                  fill={isWaterway ? 'var(--text-muted)' : 'var(--accent)'}
                  opacity={opacity}
                  className={isCritical ? 'animate-pulse-marker' : undefined}
                />
                <title>{`${marker.name} — ${marker.subtext}`}</title>
              </Marker>
            )
          })}
        </ComposableMap>
      </div>

      <div className="flex items-center justify-center gap-4 px-6 pb-2.5 pt-0.5">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <svg width={item.radius * 2 + 2} height={item.radius * 2 + 2}>
              <circle
                cx={item.radius + 1}
                cy={item.radius + 1}
                r={item.radius}
                fill={item.isWaterway ? 'var(--text-muted)' : 'var(--accent)'}
                opacity={item.opacity}
              />
            </svg>
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
})
