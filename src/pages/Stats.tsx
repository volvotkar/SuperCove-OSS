import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRows } from '../lib/data'
import type {
  Expense,
  InventoryProduct,
  InventorySale,
  Payment,
  Quadrant,
  TimeLog,
  Todo,
} from '../lib/types'
import { NONE_META, QUADRANTS, QUADRANT_META, RETRO_META, RETRO_NONE, quadrantColor } from '../lib/matrix'
import { money, shortDate, todayISO } from '../lib/format'
import { durationLabel } from '../features/timelog/TimeLogCard'
import { Button, Card, EmptyState, PageHeader } from '../components/ui'
import { Donut, type Slice } from '../components/charts'
import { NetRadar, StackedBars } from '../components/rcharts'

const TABS = ['Time', 'Tasks', 'Finance'] as const
type Tab = (typeof TABS)[number]

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(iso: string): Date {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function Stats() {
  const [tab, setTab] = useState<Tab>('Time')
  // Week anchor (Monday) shared by Time + Tasks tabs
  const [weekStart, setWeekStart] = useState(() => toISO(mondayOf(todayISO())))

  function shiftWeek(dir: -1 | 1) {
    setWeekStart((w) => toISO(addDays(new Date(w + 'T00:00:00'), dir * 7)))
  }

  const weekDates = useMemo(() => {
    const start = new Date(weekStart + 'T00:00:00')
    return Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)))
  }, [weekStart])

  const showWeekNav = tab === 'Time' || tab === 'Tasks'
  const thisWeek = weekStart === toISO(mondayOf(todayISO()))

  return (
    <div>
      <PageHeader
        title="Statistics"
        action={
          showWeekNav ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className="grid h-8 w-8 place-items-center rounded-field text-ink-muted hover:bg-sunken"
                aria-label="Previous week"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tnum min-w-[120px] text-center text-[13px] font-medium text-ink-muted">
                Week of {shortDate(weekStart)}
              </span>
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className="grid h-8 w-8 place-items-center rounded-field text-ink-muted hover:bg-sunken"
                aria-label="Next week"
              >
                <ChevronRight size={16} />
              </button>
              {!thisWeek && (
                <Button
                  variant="ghost"
                  onClick={() => setWeekStart(toISO(mondayOf(todayISO())))}
                  className="px-3 py-1.5 text-[13px]"
                >
                  This week
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 flex w-fit rounded-field border border-line bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-[7px] px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
              tab === t ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Time' && <TimeTab weekDates={weekDates} />}
      {tab === 'Tasks' && <TasksTab weekDates={weekDates} />}
      {tab === 'Finance' && <FinanceTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ Time */

function minsByQuadrant(logs: TimeLog[], dates: string[]): Map<Quadrant | 'none', number> {
  const by = new Map<Quadrant | 'none', number>()
  for (const l of logs) {
    if (!dates.includes(l.on_date)) continue
    const k = l.quadrant ?? 'none'
    by.set(k, (by.get(k) ?? 0) + (l.end_min - l.start_min))
  }
  return by
}

const h1 = (mins: number) => Math.round((mins / 60) * 10) / 10

function TimeTab({ weekDates }: { weekDates: string[] }) {
  const { data: logs = [] } = useRows<TimeLog>('time_logs', { column: 'on_date' })
  const today = todayISO()
  const [scope, setScope] = useState<'day' | 'week'>('day')
  const defaultDay = weekDates.includes(today) ? today : weekDates[0]
  const [day, setDay] = useState(defaultDay)
  const shownDay = weekDates.includes(day) ? day : defaultDay

  const scopeDates = scope === 'day' ? [shownDay] : weekDates
  const scopeMins = minsByQuadrant(logs, scopeDates)
  const dayMins = minsByQuadrant(logs, [shownDay])
  const weekMins = minsByQuadrant(logs, weekDates)
  const daysLogged = new Set(logs.filter((l) => weekDates.includes(l.on_date)).map((l) => l.on_date)).size || 1

  // Radar axes are overlapping DIMENSIONS, not the exclusive buckets: an
  // important-&-urgent block counts toward both Important and Urgent. Life is
  // excluded — it isn't important/urgent-classifiable and sleep would flatten
  // the shape (it lives in the board + Life row instead).
  const importantDay = (dayMins.get('do_now') ?? 0) + (dayMins.get('schedule') ?? 0)
  const urgentDay = (dayMins.get('do_now') ?? 0) + (dayMins.get('delegate') ?? 0)
  const neitherDay = dayMins.get('skip') ?? 0
  const importantWk = (weekMins.get('do_now') ?? 0) + (weekMins.get('schedule') ?? 0)
  const urgentWk = (weekMins.get('do_now') ?? 0) + (weekMins.get('delegate') ?? 0)
  const neitherWk = weekMins.get('skip') ?? 0
  const radarData = [
    { axis: 'Important', a: h1(importantDay), b: h1(importantWk / daysLogged) },
    { axis: 'Urgent', a: h1(urgentDay), b: h1(urgentWk / daysLogged) },
    { axis: 'Neither', a: h1(neitherDay), b: h1(neitherWk / daysLogged) },
  ]

  const barData = weekDates.map((iso) => {
    const by = minsByQuadrant(logs, [iso])
    const row: Record<string, number | string> = {
      label: new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(iso + 'T00:00:00')),
    }
    for (const q of QUADRANTS) row[q] = h1(by.get(q) ?? 0)
    row.none = h1(by.get('none') ?? 0)
    return row
  })

  const barSeries = [
    ...QUADRANTS.map((q) => ({ key: q, label: RETRO_META[q].short, color: quadrantColor(q) })),
    { key: 'none', label: RETRO_NONE.short, color: quadrantColor(null) },
  ]

  if (logs.length === 0) {
    return <EmptyState>No time logged yet — the Time log lives under Calendar.</EmptyState>
  }

  const scopeTotal = [...scopeMins.values()].reduce((s, v) => s + v, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
              Where the {scope} went
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-field border border-line p-0.5">
                {(['day', 'week'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setScope(sc)}
                    className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium ${
                      scope === sc ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {sc === 'day' ? 'Day' : 'Week'}
                  </button>
                ))}
              </div>
              {scope === 'day' && (
                <div className="flex gap-0.5">
                  {weekDates.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setDay(iso)}
                      className={`tnum rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        iso === shownDay ? 'bg-tide text-tide-ink' : 'text-ink-faint hover:bg-sunken'
                      }`}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <QuadrantBoard mins={scopeMins} total={scopeTotal} />
        </Card>

        <Card className="px-4 py-4">
          <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
            Important vs urgent — {shortDate(shownDay)} vs week avg
          </h2>
          <p className="mb-1 text-[12px] text-ink-faint">
            Hours/day. A block that’s both counts toward Important and Urgent. Life excluded.
          </p>
          <NetRadar data={radarData} seriesA={shortDate(shownDay)} seriesB="Week avg" />
        </Card>
      </div>

      <Card className="px-4 py-4">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Week — hours by matrix
        </h2>
        <StackedBars data={barData} series={barSeries} unit={(v) => `${v}h`} />
      </Card>
    </div>
  )
}

/** The 2×2 Eisenhower board: importance ↑, urgency →. */
function QuadrantBoard({ mins, total }: { mins: Map<Quadrant | 'none', number>; total: number }) {
  const cell = (q: Quadrant) => {
    const v = mins.get(q) ?? 0
    const pct = total ? Math.round((v / total) * 100) : 0
    return (
      <div
        className="flex min-h-[124px] flex-col justify-between rounded-card border p-4"
        style={{ borderColor: quadrantColor(q), background: 'color-mix(in oklab, ' + quadrantColor(q) + ' 9%, transparent)' }}
      >
        <span className="text-[13px] font-semibold" style={{ color: quadrantColor(q) }}>
          {RETRO_META[q].label}
        </span>
        <span>
          <span className="tnum block text-[26px] font-semibold tracking-tight">{durationLabel(Math.round(v))}</span>
          <span className="tnum text-[12px] text-ink-faint">{pct}% of logged</span>
        </span>
      </div>
    )
  }
  const noneV = mins.get('none') ?? 0
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col items-center justify-center">
          <span className="rotate-180 text-[10px] font-semibold uppercase tracking-wide text-ink-faint [writing-mode:vertical-rl]">
            Important →
          </span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          {cell('schedule')}
          {cell('do_now')}
          {cell('skip')}
          {cell('delegate')}
        </div>
      </div>
      <div className="mt-1 pl-6 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        Urgent →
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-field bg-sunken px-3.5 py-2.5 text-[13.5px]">
        <span className="flex items-center gap-2 text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: quadrantColor(null) }} />
          {RETRO_NONE.label}
        </span>
        <span className="tnum font-semibold">{durationLabel(Math.round(noneV))}</span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Tasks */

function TasksTab({ weekDates }: { weekDates: string[] }) {
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })

  // Crossed-out tasks are out of play — they'd otherwise skew the quadrant mix.
  const open = todos.filter((t) => !t.done && !t.cancelled_at)
  const doneThisWeek = todos.filter(
    (t) =>
      t.done && !t.cancelled_at && t.completed_at && weekDates.includes(t.completed_at.slice(0, 10)),
  )

  const toSlices = (list: Todo[]): Slice[] => {
    const by = new Map<string, number>()
    for (const t of list) by.set(t.priority ?? 'none', (by.get(t.priority ?? 'none') ?? 0) + 1)
    return [
      ...QUADRANTS.map((q) => ({
        key: q,
        label: QUADRANT_META[q].label,
        value: by.get(q) ?? 0,
        color: quadrantColor(q),
      })),
      { key: 'none', label: NONE_META.label, value: by.get('none') ?? 0, color: quadrantColor(null) },
    ]
  }

  if (todos.length === 0) return <EmptyState>No tasks yet.</EmptyState>

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="px-4 py-4">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Open tasks by quadrant
        </h2>
        <Donut slices={toSlices(open)} centerLabel={String(open.length)} centerSub="open" />
      </Card>
      <Card className="px-4 py-4">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Completed this week
        </h2>
        {doneThisWeek.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-faint">Nothing completed this week yet.</p>
        ) : (
          <Donut
            slices={toSlices(doneThisWeek)}
            centerLabel={String(doneThisWeek.length)}
            centerSub="done"
          />
        )}
      </Card>
      <p className="text-[12.5px] text-ink-faint lg:col-span-2">
        A healthy week completes more Schedule than Do now — firefighting shows up here first.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- Finance */

function FinanceTab() {
  const { data: expenses = [] } = useRows<Expense>('expenses', { column: 'spent_on' })
  const { data: payments = [] } = useRows<Payment>('payments', { column: 'created_at' })
  const { data: products = [] } = useRows<InventoryProduct>('inventory_products', { column: 'name' })
  const { data: sales = [] } = useRows<InventorySale>('inventory_sales', { column: 'sold_on' })

  // Last 6 months, oldest → newest
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }, [])

  const monthly = months.map((m) => {
    const inflow = payments
      .filter((p) => p.status === 'completed' && p.received_on?.startsWith(m))
      .reduce((s, p) => s + Number(p.amount), 0)
    const out = expenses.filter((e) => e.spent_on.startsWith(m)).reduce((s, e) => s + Number(e.amount), 0)
    const [yy, mm] = m.split('-').map(Number)
    return {
      label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(yy, mm - 1, 1)),
      in: inflow,
      out,
    }
  })

  // Inventory gross profit per product
  const profitRows = products
    .map((p) => {
      const ps = sales.filter((s) => s.product_id === p.id)
      const units = ps.reduce((s, x) => s + x.units, 0)
      const revenue = ps.reduce((s, x) => s + x.units * Number(x.unit_price), 0)
      const cogs = units * Number(p.cost_per_unit)
      return { p, units, revenue, cogs, profit: revenue - cogs }
    })
    .filter((r) => r.units > 0)
    .sort((a, b) => b.profit - a.profit)

  const totalProfit = profitRows.reduce((s, r) => s + r.profit, 0)

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-4 py-4">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Cashflow — last 6 months
        </h2>
        <p className="mb-3 text-[12px] text-ink-faint">Money in and out, per month.</p>
        <StackedBars
          data={monthly}
          series={[
            { key: 'in', label: 'Received', color: 'var(--pos)' },
            { key: 'out', label: 'Spent', color: 'var(--neg)' },
          ]}
          unit={(v) => money(Math.round(v))}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
            Inventory gross profit
          </h2>
          <span className={`tnum text-[14px] font-semibold ${totalProfit < 0 ? 'text-neg' : 'text-pos'}`}>
            {totalProfit < 0 ? '−' : '+'}
            {money(Math.abs(totalProfit))}
          </span>
        </div>
        {profitRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
            No sales logged yet — profit shows up once Inventory has sales.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Units sold</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Profit</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profitRows.map(({ p, units, revenue, cogs, profit }) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="tnum px-4 py-2.5 text-right">{units}</td>
                    <td className="tnum px-4 py-2.5 text-right">{money(revenue)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-ink-muted">{money(cogs)}</td>
                    <td className={`tnum px-4 py-2.5 text-right font-semibold ${profit < 0 ? 'text-neg' : 'text-pos'}`}>
                      {profit < 0 ? '−' : '+'}
                      {money(Math.abs(profit))}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">
                      {revenue > 0 ? `${Math.round((profit / revenue) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
