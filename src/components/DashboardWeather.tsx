import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import {
  formatAqiDetail,
  formatBarometerLine,
  formatPrecipitationDisplay,
  formatTempF,
  formatUvIndexDetail,
  formatWindMph,
  grassPollenBucketLabel,
  treeWeedPollenBucketLabel,
  weatherIconIdForConditions,
  type WeatherDisplayIconId,
} from '../lib/weatherDisplay'
import type { WeatherSnapshot } from '../lib/weatherSnapshot'

type Props = {
  weather: WeatherSnapshot
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

function WeatherMoreModal ({
  weather,
  open,
  onClose,
  titleId,
}: {
  weather: WeatherSnapshot
  open: boolean
  onClose: () => void
  titleId: string
}) {
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
              <div style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Pollen (Open-Meteo)</div>
              <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem', color: 'var(--scrap-ink)' }}>
                {weather.grass_pollen != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--scrap-muted)' }}>Grass</span>
                    <span>{grassPollenBucketLabel(weather.grass_pollen)}</span>
                  </div>
                )}
                {weather.tree_pollen != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--scrap-muted)' }}>Tree</span>
                    <span>{treeWeedPollenBucketLabel(weather.tree_pollen)}</span>
                  </div>
                )}
                {weather.weed_pollen != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--scrap-muted)' }}>Weed</span>
                    <span>{treeWeedPollenBucketLabel(weather.weed_pollen)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <p
            className="muted"
            style={{
              fontSize: '0.78rem',
              lineHeight: 1.5,
              margin: '14px 0 0',
              paddingTop: 12,
              borderTop: '1px solid rgba(125, 107, 90, 0.15)',
            }}
          >
            Open-Meteo combines forecast fields (temperature, humidity, pressure, wind, UV, precipitation) with a separate
            air-quality feed (AQI, pollen). Medical Bible saves a snapshot when you log pain so you can look for patterns
            over time—open Charts for weather-related views.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DashboardWeather ({ weather }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const summaryId = useId()
  const moreTitleId = useId()

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
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Precipitation</span>
              <span style={valueStyle}>{formatPrecipitationDisplay(weather.precipitation_mm)}</span>
            </div>

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
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        titleId={moreTitleId}
      />
    </div>
  )
}
