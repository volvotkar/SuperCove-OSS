/**
 * Hand-rolled SVG charts (no library — consistent with the zero-dep design
 * system). Built to the dataviz method: 2px surface gaps between fills,
 * rounded data ends, legends whenever there are ≥2 series, text in ink
 * tokens (never series color), native hover titles, one axis.
 */

export type Slice = { key: string; label: string; value: number; color: string }

export function Legend({ items, unit }: { items: Slice[]; unit?: (v: number) => string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-[12.5px]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate text-ink-muted">{s.label}</span>
          <span className="tnum shrink-0 font-semibold">{unit ? unit(s.value) : s.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** Donut with a hero number in the middle; 2px surface gaps between segments. */
export function Donut({
  slices,
  centerLabel,
  centerSub,
  unit,
}: {
  slices: Slice[]
  centerLabel: string
  centerSub?: string
  unit?: (v: number) => string
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const shown = slices.filter((s) => s.value > 0)
  const R = 60
  const r = 40
  const C = 64

  let angle = -Math.PI / 2
  const paths = shown.map((s) => {
    const frac = total === 0 ? 0 : s.value / total
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, rad: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`
    return {
      s,
      // A single slice at 100% can't be an arc (start == end) — draw it as a
      // stroked ring instead so it doesn't collapse into a wedge artifact.
      full: frac >= 0.999,
      d: `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`,
    }
  })

  return (
    <div className="flex items-center gap-6">
      <svg width="150" height="150" viewBox="0 0 128 128" className="shrink-0" role="img" aria-label={centerLabel}>
        {total === 0 && (
          <circle cx={C} cy={C} r={(R + r) / 2} fill="none" strokeWidth={R - r} className="stroke-[var(--surface-sunken)]" />
        )}
        {paths.map(({ s, d, full }) =>
          full ? (
            <circle key={s.key} cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={s.color} strokeWidth={R - r}>
              <title>{`${s.label}: ${unit ? unit(s.value) : s.value} (100%)`}</title>
            </circle>
          ) : (
            <path
              key={s.key}
              d={d}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
              strokeLinejoin="round"
            >
              <title>{`${s.label}: ${unit ? unit(s.value) : s.value}${total ? ` (${Math.round((s.value / total) * 100)}%)` : ''}`}</title>
            </path>
          ),
        )}
        <text x={C} y={C - 2} textAnchor="middle" className="tnum fill-[var(--ink)] text-[19px] font-semibold">
          {centerLabel}
        </text>
        {centerSub && (
          <text x={C} y={C + 15} textAnchor="middle" className="fill-[var(--ink-faint)] text-[10px]">
            {centerSub}
          </text>
        )}
      </svg>
      <Legend items={shown.length ? shown : slices} unit={unit} />
    </div>
  )
}

/** GitHub-style month heatmap: sequential single hue, light→dark by intensity. */
export function MonthHeatmap({
  month, // 'YYYY-MM'
  intensity, // date ISO -> 0..1 (or undefined for none)
  title,
}: {
  month: string
  intensity: Map<string, number>
  title: (iso: string) => string
}) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const first = new Date(y, m - 1, 1)
  const firstCol = (first.getDay() + 6) % 7 // Mon = 0
  const cell = 30
  const gap = 6
  const labelW = 24
  const weeks = Math.ceil((firstCol + daysInMonth) / 7)
  const W = weeks * (cell + gap) + labelW
  const H = 7 * (cell + gap)
  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full" role="img" aria-label={`Habit heatmap for ${month}`}>
      {dayNames.map((n, r) => (
        <text
          key={r}
          x={0}
          y={r * (cell + gap) + cell - 5}
          className="fill-[var(--ink-faint)] text-[10px]"
        >
          {n}
        </text>
      ))}
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1
        const iso = `${month}-${String(day).padStart(2, '0')}`
        const idx = firstCol + i
        const col = Math.floor(idx / 7)
        const row = idx % 7
        const v = intensity.get(iso)
        return (
          <rect
            key={iso}
            x={labelW + col * (cell + gap)}
            y={row * (cell + gap)}
            width={cell}
            height={cell}
            rx={4}
            fill={v === undefined || v === 0 ? 'var(--surface-sunken)' : 'var(--pos)'}
            opacity={v === undefined || v === 0 ? 1 : 0.35 + 0.65 * v}
          >
            <title>{title(iso)}</title>
          </rect>
        )
      })}
    </svg>
  )
}
