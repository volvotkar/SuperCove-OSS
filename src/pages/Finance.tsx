import { useMemo, useState } from 'react'
import { BellOff, BellRing, CalendarClock, Check, HandCoins, Receipt, Tags, Trash2 } from 'lucide-react'
import { useDelete, useRows, useUpdate } from '../lib/data'
import type { Expense, FinanceCategory, Payment, Project } from '../lib/types'
import { daysFromToday, money, shortDate, todayISO } from '../lib/format'
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader } from '../components/ui'
import { ExpenseForm, PaymentForm } from '../features/finance/forms'
import { CategoriesModal } from '../features/finance/CategoriesModal'

export function Finance() {
  const { data: expenses = [] } = useRows<Expense>('expenses', { column: 'spent_on', ascending: false })
  const { data: payments = [] } = useRows<Payment>('payments', { column: 'created_at', ascending: false })
  const { data: categories = [] } = useRows<FinanceCategory>('finance_categories', { column: 'name' })
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })

  const [adding, setAdding] = useState<'expense' | 'payment' | null>(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [lens, setLens] = useState<'month' | 'all'>('month')

  const stats = useMemo(() => {
    const monthPrefix = todayISO().slice(0, 7)
    const inPeriod = (d: string | null) => lens === 'all' || (d ?? '').startsWith(monthPrefix)
    // Outstanding money is a snapshot — the lens doesn't apply to it.
    const expected = payments.filter((p) => p.status === 'awaited').reduce((s, p) => s + Number(p.amount), 0)
    const received = payments
      .filter((p) => p.status === 'completed' && inPeriod(p.received_on))
      .reduce((s, p) => s + Number(p.amount), 0)
    const periodExpenses = expenses.filter((e) => inPeriod(e.spent_on))
    const spent = periodExpenses.reduce((s, e) => s + Number(e.amount), 0)
    const net = received - spent

    const byCategory = new Map<string, number>()
    for (const e of periodExpenses) {
      const key = e.category_id ?? 'none'
      byCategory.set(key, (byCategory.get(key) ?? 0) + Number(e.amount))
    }
    return { expected, received, spent, net, byCategory }
  }, [payments, expenses, lens])

  const followUps = useMemo(
    () =>
      payments
        .filter((p) => p.status === 'awaited' && p.follow_up_on)
        .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!)),
    [payments],
  )

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name

  return (
    <div>
      <PageHeader
        title="Finance"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setManagingCategories(true)}
              title="Manage categories"
              className="grid h-9 w-9 place-items-center rounded-field border border-line-strong bg-surface text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Tags size={16} />
            </button>
            <Button variant="ghost" onClick={() => setAdding('payment')}>
              <HandCoins size={15} className="text-pos" /> Payment
            </Button>
            <Button onClick={() => setAdding('expense')}>
              <Receipt size={15} /> Expense
            </Button>
          </div>
        }
      />

      {/* Period lens — outstanding money is a snapshot, so it ignores the lens */}
      <div className="mb-3 flex w-fit rounded-field border border-line bg-surface p-0.5">
        {(
          [
            { id: 'month', label: 'This month' },
            { id: 'all', label: 'All time' },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setLens(o.id)}
            className={`rounded-[7px] px-3 py-1 text-[12.5px] font-medium transition-colors ${
              lens === o.id ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Awaited (outstanding)" value={money(stats.expected)} tone="awaited" />
        <Stat label={lens === 'month' ? 'Received this month' : 'Received'} value={money(stats.received)} tone="pos" />
        <Stat label={lens === 'month' ? 'Spent this month' : 'Spent'} value={money(stats.spent)} tone="neg" />
        <Stat
          label={lens === 'month' ? 'Net this month' : 'Net (all time)'}
          value={`${stats.net < 0 ? '−' : '+'}${money(Math.abs(stats.net))}`}
          tone={stats.net < 0 ? 'neg' : 'pos'}
        />
      </div>

      {/* Where it went (selected period) */}
      {stats.byCategory.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...stats.byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([catId, amount]) => (
              <span
                key={catId}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px]"
              >
                <span className="font-medium text-ink-muted">
                  {catId === 'none' ? 'Uncategorised' : (catName(catId) ?? '?')}
                </span>
                <span className="tnum font-semibold">{money(amount)}</span>
              </span>
            ))}
        </div>
      )}

      {/* Follow-ups */}
      <section className="mt-8">
        <SectionTitle icon={<BellRing size={14} />} text="Follow up on this" />
        {followUps.length === 0 ? (
          <EmptyState>No follow-ups pending. Awaited payments with a follow-up date land here.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {followUps.map((p) => {
                const d = daysFromToday(p.follow_up_on!)
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                        d <= 0 ? 'bg-neg-soft text-neg' : 'bg-awaited-soft text-awaited'
                      }`}
                    >
                      {d < 0 ? `Overdue ${-d}d` : d === 0 ? 'Due today' : `In ${d}d`}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* What the money is for leads; who it's from is context. */}
                      <div className="truncate text-[14px] font-medium">
                        {p.note || p.counterparty}
                      </div>
                      <div className="truncate text-[12.5px] text-ink-faint">
                        {p.note ? `from ${p.counterparty} · ` : ''}
                        {shortDate(p.follow_up_on!)}
                        {projName(p.project_id) ? ` · ${projName(p.project_id)}` : ''}
                      </div>
                    </div>
                    <span className="tnum text-[14px] font-semibold">{money(Number(p.amount))}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <MarkReceived payment={p} />
                      <RescheduleFollowUp payment={p} />
                      <DismissFollowUp payment={p} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Ledgers */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle icon={<HandCoins size={14} />} text="Payments" />
          {payments.length === 0 ? (
            <EmptyState>No payments yet. Log who owes you and when to follow up.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <PaymentRow key={p.id} p={p} projName={projName(p.project_id)} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <SectionTitle icon={<Receipt size={14} />} text="Expenses" />
          {expenses.length === 0 ? (
            <EmptyState>No expenses yet. First one takes ten seconds.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {expenses.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    e={e}
                    catName={catName(e.category_id)}
                    projName={projName(e.project_id)}
                  />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>

      {adding === 'expense' && (
        <ExpenseForm categories={categories} projects={projects} onClose={() => setAdding(null)} />
      )}
      {adding === 'payment' && (
        <PaymentForm projects={projects} onClose={() => setAdding(null)} />
      )}
      {managingCategories && <CategoriesModal onClose={() => setManagingCategories(false)} />}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'awaited' }) {
  const dot = { pos: 'bg-pos', neg: 'bg-neg', awaited: 'bg-awaited' }[tone]
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
    </Card>
  )
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
      {icon}
      {text}
    </h2>
  )
}

/**
 * Push the follow-up out to a new date. Deliberately separate from the ✓ —
 * rescheduling a nudge must never be mistaken for "the money arrived".
 */
function RescheduleFollowUp({ payment }: { payment: Payment }) {
  const update = useUpdate<Payment>('payments')
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(payment.follow_up_on ?? todayISO())

  return (
    <>
      <button
        type="button"
        title="Reschedule this follow-up"
        onClick={() => {
          setDate(payment.follow_up_on ?? todayISO())
          setOpen(true)
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-awaited-soft hover:text-awaited"
      >
        <CalendarClock size={15} />
      </button>
      {open && (
        <Modal title="Reschedule follow-up" onClose={() => setOpen(false)}>
          <p className="mb-4 truncate rounded-field bg-sunken px-3 py-2 text-[13.5px] text-ink-muted">
            {payment.note || payment.counterparty} · {money(Number(payment.amount))}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate(
                { id: payment.id, patch: { follow_up_on: date } },
                { onSuccess: () => setOpen(false) },
              )
            }}
            className="flex flex-col gap-3.5"
          >
            <label>
              <Label>Follow up on</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Reschedule'}
            </Button>
            {update.isError && <p className="text-[13px] text-neg">{update.error.message}</p>}
          </form>
        </Modal>
      )}
    </>
  )
}

/**
 * Stop nagging about this one. Clears only the follow-up date — the payment
 * stays in the ledger, still awaited, with its amount untouched.
 */
function DismissFollowUp({ payment }: { payment: Payment }) {
  const update = useUpdate<Payment>('payments')
  return (
    <button
      type="button"
      title="Dismiss — keeps the payment, drops the reminder"
      onClick={() => update.mutate({ id: payment.id, patch: { follow_up_on: null } })}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
    >
      <BellOff size={15} />
    </button>
  )
}

function MarkReceived({ payment }: { payment: Payment }) {
  const update = useUpdate<Payment>('payments')
  return (
    <button
      type="button"
      title="Mark received"
      onClick={() =>
        update.mutate({ id: payment.id, patch: { status: 'completed', received_on: todayISO() } })
      }
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-pos-soft hover:text-pos"
    >
      <Check size={15} />
    </button>
  )
}

export function PaymentRow({ p, projName }: { p: Payment; projName?: string }) {
  const del = useDelete('payments')
  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Lead with what it's for; the counterparty moves to the meta line. */}
          <span className="truncate text-[14px] font-medium">{p.note || p.counterparty}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              p.status === 'completed' ? 'bg-pos-soft text-pos' : 'bg-awaited-soft text-awaited'
            }`}
          >
            {p.status === 'completed' ? 'Received' : 'Awaited'}
          </span>
        </div>
        <div className="truncate text-[12.5px] text-ink-faint">
          {p.note ? `from ${p.counterparty} · ` : ''}
          {p.status === 'completed' && p.received_on
            ? `received ${shortDate(p.received_on)}`
            : p.follow_up_on
              ? `follow up ${shortDate(p.follow_up_on)}`
              : 'no follow-up date'}
          {projName ? ` · ${projName}` : ''}
        </div>
      </div>
      <span className="tnum text-[14px] font-semibold text-pos">+{money(Number(p.amount))}</span>
      {p.status === 'awaited' && <MarkReceived payment={p} />}
      <button
        type="button"
        title="Delete"
        onClick={() => del.mutate(p.id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

export function ExpenseRow({ e, catName, projName }: { e: Expense; catName?: string; projName?: string }) {
  const del = useDelete('expenses')
  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{e.note || catName || 'Expense'}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-faint">
          {shortDate(e.spent_on)}
          {catName ? ` · ${catName}` : ''}
          {projName ? ` · ${projName}` : ''}
        </div>
      </div>
      <span className="tnum text-[14px] font-semibold text-neg">−{money(Number(e.amount))}</span>
      <button
        type="button"
        title="Delete"
        onClick={() => del.mutate(e.id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}
