import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import {
  formatAqiDetail,
  formatBarometerLine,
  formatPollenGrainsPerM3,
  formatPrecipitationDisplay,
  formatTempF,
  formatUvIndexDetail,
  formatWindMph,
  grassPollenBucketLabel,
  treeWeedPollenBucketLabel,
  weatherIconIdForConditions,
  type WeatherDisplayIconId,
} from '../lib/weatherDisplay'
import type { PollenAlertLevel, WeatherCorrelationResult } from '../lib/weatherCorrelationInsights'
import type { WeatherSnapshot } from '../lib/weatherSnapshot'

type Props = {
  weather: WeatherSnapshot
  correlation: WeatherCorrelationResult | null
}

/** Subtle sun — cozy scrapbook palette. Swap per `iconId` when assets exist. */
function WeatherGlyph ({ iconId }: { iconId: WeatherDisplayIconId }) {
  switch (iconId) {
    default:
      return (
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          aria-hidden
          style={{ flexShrink: 0, opacity: 0.92 }}
        >
          <circle cx="12" cy="12" r="4.2" fill="#fde68a" stroke="#d97706" strokeWidth="1.15" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="12"
              y1="3"
              x2="12"
              y2="5.2"
              stroke="#b45309"
              strokeWidth="1.4"
              strokeLinecap="round"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
        </svg>
      )
  }
}

function pressureTrendArrow (delta: number | null): string {
  if (delta === null) return '→'
  if (delta > 3) return '↑'
  if (delta < -3) return '↓'
  return '→'
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid rgba(125, 107, 90, 0.12)',
  fontSize: '0.84rem',
  lineHeight: 1.45,
}

const labelStyle: CSSProperties = {
  color: 'var(--scrap-muted)',
  fontWeight: 500,
  flexShrink: 0,
}

const valueStyle: CSSProperties = {
  color: 'var(--scrap-ink)',
  textAlign: 'right',
}

/** When correlation is still loading or failed, still flag obvious high/moderate grass pollen. */
function pollenAlertDisplay (
  weather: WeatherSnapshot,
  correlation: WeatherCorrelationResult | null,
): { level: PollenAlertLevel; median: number | null } {
  if (correlation) {
    return {
      level: correlation.pollenAlert,
      median: correlation.grassPollenMedianHistory,
    }
  }
  const G = weather.grass_pollen
  if (G == null || !Number.isFinite(G)) return { level: null, median: null }
  if (G > 50) return { level: 'high', median: null }
  if (G > 10) return { level: 'moderate', median: null }
  return { level: null, median: null }
}

function PollenAlertBanner ({
  level,
  median,
}: {
  level: PollenAlertLevel
  median: number | null
}) {
  if (!level) return null
  const base: CSSProperties = {
    fontSize: '0.78rem',
    lineHeight: 1.45,
    padding: '8px 10px',
    borderRadius: 10,
    marginBottom: 10,
    border: '1px solid rgba(180, 83, 9, 0.35)',
    background: 'rgba(254, 243, 199, 0.65)',
    color: 'var(--scrap-ink)',
  }
  if (level === 'high') {
    return (
      <div role="status" style={base}>
        <strong>Pollen alert:</strong> grass pollen is <strong>high</strong> right now.
      </div>
    )
  }
  if (level === 'above_your_usual') {
    return (
      <div role="status" style={base}>
        <strong>Pollen alert:</strong> grass pollen is <strong>higher than your usual</strong> in recent pain logs
        {median != null && Number.isFinite(median)
          ? ` (median ${median < 10 ? median.toFixed(1) : Math.round(median)} grains/m³).`
          : '.'}
      </div>
    )
  }
  return (
    <div role="status" style={base}>
      <strong>Pollen alert:</strong> grass pollen is <strong>elevated</strong> (moderate) right now.
    </div>
  )
}

function PollenNumberLine ({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--scrap-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        {formatPollenGrainsPerM3(value)} ({grassPollenBucketLabel(value)})
      </span>
    </div>
  )
}

function PollenTreeWeedLine ({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--scrap-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        {formatPollenGrainsPerM3(value)} ({treeWeedPollenBucketLabel(value)})
      </span>
    </div>
  )
}

function WeatherMoreModal ({
  weather,
  correlation,
  open,
  onClose,
  titleId,
}: {
  weather: WeatherSnapshot
  correlation: WeatherCorrelationResult | null
  open: boolean
  onClose: () => void
  titleId: string
}) {
  const alertDisp = pollenAlertDisplay(weather, correlation)
  const feelsC = weather.feels_like_c ?? weather.temperature_c
  const pDelta = weather.pressure_change_24h
  const hasPollenDetail =
    weather.grass_pollen != null ||
    weather.tree_pollen != null ||
    weather.weed_pollen != null

  useEffect(() => {
    if (!open) return
    function onKey (e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 260,
        background: 'rgba(30, 77, 52, 0.22)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card shadow"
        style={{
          maxWidth: 400,
          width: '100%',
          maxHeight: '85dvh',
          overflowY: 'auto',
          borderRadius: 16,
          padding: '18px 18px 16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <h3 id={titleId} style={{ margin: 0, fontSize: '1.05rem', color: 'var(--scrap-ink, #4a3728)' }}>
            More weather detail
          </h3>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem', flexShrink: 0 }} onClick={onClose}>
            Close
          </button>
        </div>

        <PollenAlertBanner level={alertDisp.level} median={alertDisp.median} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Feels like</span>
            <span style={valueStyle}>{formatTempF(feelsC)}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Humidity</span>
            <span style={valueStyle}>{`${Math.round(weather.humidity_pct)}%`}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Wind</span>
            <span style={valueStyle}>{formatWindMph(weather.wind_kph)}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Barometer</span>
            <span style={valueStyle}>{formatBarometerLine(weather.pressure_hpa, pDelta)}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={labelStyle}>UV Index</span>
            <span style={valueStyle}>{formatUvIndexDetail(weather.uv_index)}</span>
          </div>

          {hasPollenDetail && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 12,
                borderTop: '1px solid rgba(125, 107, 90, 0.2)',
              }}
            >
              <div style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Pollen (grains/m³)</div>
              <div style={{ display: 'grid', gap: 8, fontSize: '0.84rem', color: 'var(--scrap-ink)' }}>
                {weather.grass_pollen != null && (
                  <PollenNumberLine label="Grass" value={weather.grass_pollen} />
                )}
                {weather.tree_pollen != null && (
                  <PollenTreeWeedLine label="Tree (birch + alder)" value={weather.tree_pollen} />
                )}
                {weather.weed_pollen != null && (
                  <PollenTreeWeedLine label="Weed (ragweed + mugwort)" value={weather.weed_pollen} />
                )}
              </div>
            </div>
          )}

          {correlation && correlation.lines.length > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(125, 107, 90, 0.2)',
              }}
            >
              <div style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>You vs The Forecast</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  color: 'var(--scrap-ink)',
                  listStyle: 'none',
                  listStyleType: 'none',
                }}
              >
                {correlation.lines.map((line, i) => (
                  <li key={i} style={{ marginBottom: 6, listStyle: 'none', listStyleType: 'none' }}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DashboardWeather ({ weather, correlation }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const summaryId = useId()
  const moreTitleId = useId()

  const alertDisp = pollenAlertDisplay(weather, correlation)

  const pDelta = weather.pressure_change_24h
  const g = weather.grass_pollen
  const pollenLabel =
    g === null
      ? null
      : g < 10
        ? 'Low pollen'
        : g <= 50
          ? 'Mod pollen'
          : 'High pollen'

  const iconId = weatherIconIdForConditions(weather.conditions_label)

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          aria-expanded={summaryOpen}
          aria-controls={summaryId}
          title="Weather"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            padding: 0,
            border: '1px solid rgba(125, 107, 90, 0.35)',
            borderRadius: 12,
            background: 'rgba(250, 246, 237, 0.95)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(74, 55, 40, 0.08)',
          }}
        >
          <WeatherGlyph iconId={iconId} />
        </button>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--scrap-muted)',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px 10px',
            }}
          >
            <span style={{ color: 'var(--scrap-ink)', fontWeight: 600 }}>{formatTempF(weather.temperature_c)}</span>
            <span aria-hidden>{pressureTrendArrow(pDelta)}</span>
            {pollenLabel && (
              <span
                style={{
                  fontSize: '0.72rem',
                  opacity: 0.95,
                  borderLeft: '1px solid rgba(125, 107, 90, 0.35)',
                  paddingLeft: 10,
                }}
              >
                {pollenLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {summaryOpen && (
        <div
          id={summaryId}
          role="region"
          className="scrap-sticky scrap-sticky--upcoming"
          style={{
            marginTop: 10,
            padding: '14px 16px 12px',
            textAlign: 'left',
            position: 'relative',
          }}
        >
          <span className="scrap-tape scrap-tape--sky" aria-hidden />
          <h3
            style={{
              margin: '0 0 12px',
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--scrap-ink)',
              letterSpacing: '0.02em',
            }}
          >
            Weather
          </h3>

          <PollenAlertBanner level={alertDisp.level} median={alertDisp.median} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {weather.location_label && weather.location_label.trim() && (
              <div style={rowStyle}>
                <span style={labelStyle}>Location</span>
                <span style={valueStyle}>{weather.location_label.trim()}</span>
              </div>
            )}
            <div style={rowStyle}>
              <span style={labelStyle}>Condition</span>
              <span style={valueStyle}>{weather.conditions_label}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Temperature</span>
              <span style={valueStyle}>{formatTempF(weather.temperature_c)}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Air quality</span>
              <span style={valueStyle}>
                {weather.aqi != null ? formatAqiDetail(weather.aqi) : 'Unavailable'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Precipitation</span>
              <span style={valueStyle}>{formatPrecipitationDisplay(weather.precipitation_mm)}</span>
            </div>
            {weather.grass_pollen != null && (
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={labelStyle}>Grass pollen</span>
                <span style={valueStyle}>
                  {formatPollenGrainsPerM3(weather.grass_pollen)} ({grassPollenBucketLabel(weather.grass_pollen)})
                </span>
              </div>
            )}

            {correlation && correlation.lines.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px solid rgba(125, 107, 90, 0.2)',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 6, display: 'block' }}>You vs The Forecast</div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: '0.8rem',
                    lineHeight: 1.5,
                    color: 'var(--scrap-ink)',
                    listStyle: 'none',
                    listStyleType: 'none',
                  }}
                >
                  {correlation.lines.map((line, i) => (
                    <li key={i} style={{ marginBottom: 4, listStyle: 'none', listStyleType: 'none' }}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                marginTop: 12,
                width: '100%',
                fontSize: '0.88rem',
                justifyContent: 'center',
              }}
              onClick={() => setMoreOpen(true)}
            >
              More
            </button>
          </div>
        </div>
      )}

      <WeatherMoreModal
        weather={weather}
        correlation={correlation}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        titleId={moreTitleId}
      />
    </div>
  )
}
