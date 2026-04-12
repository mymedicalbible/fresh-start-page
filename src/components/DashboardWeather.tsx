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
  panelOpen: boolean
  onToggle: () => void
}

/** Subtle sun — cozy scrapbook palette. Swap per `iconId` when assets exist. */
function WeatherGlyph ({ iconId }: { iconId: WeatherDisplayIconId }) {
  switch (iconId) {
    // Future: case 'rain': return <RainGlyph />
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

export function DashboardWeather ({ weather, panelOpen, onToggle }: Props) {
  const feelsC = weather.feels_like_c ?? weather.temperature_c
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

  const hasPollenDetail =
    weather.grass_pollen != null ||
    weather.tree_pollen != null ||
    weather.weed_pollen != null

  const iconId = weatherIconIdForConditions(weather.conditions_label)

  const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    padding: '6px 0',
    borderBottom: '1px solid rgba(125, 107, 90, 0.12)',
    fontSize: '0.84rem',
    lineHeight: 1.45,
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--scrap-muted)',
    fontWeight: 500,
    flexShrink: 0,
  }
  const valueStyle: CSSProperties = {
    color: 'var(--scrap-ink)',
    textAlign: 'right',
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={panelOpen}
        aria-controls="dash-weather-detail"
        id="dash-weather-chip"
        className="scrap-date-pill"
        style={{
          cursor: 'pointer',
          border: '1px solid rgba(125, 107, 90, 0.35)',
          display: 'inline-flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px 10px',
          fontSize: '0.78rem',
          color: 'var(--scrap-muted)',
          padding: '6px 12px',
          lineHeight: 1.35,
          background: 'rgba(250, 246, 237, 0.85)',
        }}
      >
        <span style={{ color: 'var(--scrap-ink)' }}>{formatTempF(weather.temperature_c)}</span>
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
      </button>

      {panelOpen && (
        <div
          id="dash-weather-detail"
          role="region"
          aria-labelledby="dash-weather-chip"
          className="scrap-sticky scrap-sticky--upcoming"
          style={{
            marginTop: 10,
            padding: '14px 16px 12px',
            textAlign: 'left',
            position: 'relative',
          }}
        >
          <span className="scrap-tape scrap-tape--sky" aria-hidden />
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 14,
              zIndex: 1,
            }}
          >
            <WeatherGlyph iconId={iconId} />
          </div>

          <h3
            style={{
              margin: '0 36px 12px 0',
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
              <span style={labelStyle}>Precipitation</span>
              <span style={valueStyle}>{formatPrecipitationDisplay(weather.precipitation_mm)}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Barometer</span>
              <span style={valueStyle}>{formatBarometerLine(weather.pressure_hpa, pDelta)}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>UV Index</span>
              <span style={valueStyle}>{formatUvIndexDetail(weather.uv_index)}</span>
            </div>
            {weather.aqi != null && (
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={labelStyle}>Air quality</span>
                <span style={valueStyle}>{formatAqiDetail(weather.aqi)}</span>
              </div>
            )}

            {hasPollenDetail && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px solid rgba(125, 107, 90, 0.2)',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Pollen</div>
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
          </div>
        </div>
      )}
    </div>
  )
}
