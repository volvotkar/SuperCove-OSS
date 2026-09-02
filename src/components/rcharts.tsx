import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Recharts wrappers themed to the app (CSS-var fills, ink-token text).
 * Series colors come from the validated --mx-* palette via lib/matrix.
 */

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  fontSize: 12.5,
  color: 'var(--ink)',
}

export type BarSeries = { key: string; label: string; color: string }

export function StackedBars({
  data,
  series,
  height = 280,
  unit,
}: {
  data: Record<string, number | string>[]
  series: BarSeries[]
  height?: number
  unit?: (v: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-sunken)', opacity: 0.5 }}
          contentStyle={tooltipStyle}
          formatter={(v, name) => [unit ? unit(Number(v ?? 0)) : String(v ?? 0), String(name)]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: 'var(--ink-muted)' }}
          iconType="circle"
          iconSize={9}
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            fill={s.color}
            stroke="var(--surface)"
            strokeWidth={1}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function NetRadar({
  data,
  seriesA,
  seriesB,
  height = 300,
}: {
  data: { axis: string; a: number; b: number }[]
  seriesA: string
  seriesB: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--ink-muted)', fontSize: 11.5 }} />
        <Radar
          name={seriesA}
          dataKey="a"
          stroke="var(--mx-schedule)"
          fill="var(--mx-schedule)"
          fillOpacity={0.35}
          strokeWidth={2}
        />
        <Radar
          name={seriesB}
          dataKey="b"
          stroke="var(--mx-delegate)"
          fill="var(--mx-delegate)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => `${Math.round(Number(v ?? 0) * 10) / 10}h`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-muted)' }} iconType="circle" iconSize={9} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
