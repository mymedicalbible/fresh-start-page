import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { PainChartPoint, SymptomChartPoint } from '../lib/summaryChartData'

const PAIN_LINE = '#a78bfa'
const PAIN_FILL = '#e9d5ff'
const FLARE_DOT = '#fb923c'
const EP_LINE = '#34d399'
const EP_FILL = '#d1fae5'

type DotProps = { cx?: number; cy?: number; payload?: PainChartPoint }

function PainDot (props: DotProps) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null
  const isFlare = payload.intensity >= 7
  if (isFlare) {
    return <circle cx={cx} cy={cy} r={10} fill={FLARE_DOT} stroke={PAIN_LINE} strokeWidth={2} />
  }
  return <circle cx={cx} cy={cy} r={4} fill={PAIN_LINE} />
}

function SymptomDot (props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx == null || cy == null) return null
  return <circle cx={cx} cy={cy} r={5} fill={EP_LINE} />
}

export function PainSummaryChart ({ data, title = 'Pain intensity' }: { data: PainChartPoint[]; title?: string }) {
  if (data.length === 0) {
    return (
      <div className="muted" style={{ fontSize: '0.82rem', padding: '12px 0' }}>
        No data.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8, color: '#1e4d34' }}>{title}</div>
      <div className="charts-wrap" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="painArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PAIN_FILL} stopOpacity={0.9} />
                <stop offset="100%" stopColor={PAIN_FILL} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tickFormatter={(v) => `${v}/10`} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={40} />
            <Tooltip formatter={(v: number) => [`${v}/10`, 'Pain']} labelFormatter={(l) => l} />
            <Area type="monotone" dataKey="intensity" stroke="none" fill="url(#painArea)" />
            <Line
              type="monotone"
              dataKey="intensity"
              stroke={PAIN_LINE}
              strokeWidth={2.5}
              dot={(p: DotProps) => <PainDot {...p} />}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SymptomSummaryChart ({ data, title = 'Symptom activity' }: { data: SymptomChartPoint[]; title?: string }) {
  if (data.length === 0) {
    return (
      <div className="muted" style={{ fontSize: '0.82rem', padding: '12px 0' }}>
        No symptom logs in this window.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8, color: '#1e4d34' }}>{title}</div>
      <div className="charts-wrap" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="epArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EP_FILL} stopOpacity={0.85} />
                <stop offset="100%" stopColor={EP_FILL} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#d4eadc" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#6b7c72" />
            <YAxis domain={[0, 10]} ticks={[0, 3, 6, 9, 10]} tickFormatter={(v) => `${v}`} tick={{ fontSize: 10 }} stroke="#6b7c72" width={32} />
            <Tooltip formatter={(v: number) => [v, 'Score']} labelFormatter={(l) => l} />
            <Area type="monotone" dataKey="score" stroke="none" fill="url(#epArea)" />
            <Line
              type="monotone"
              dataKey="score"
              stroke={EP_LINE}
              strokeWidth={2.5}
              dot={(p: { cx?: number; cy?: number }) => <SymptomDot {...p} />}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
