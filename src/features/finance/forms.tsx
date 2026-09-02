import { useState } from 'react'
import { useInsert } from '../../lib/data'
import type { Expense, FinanceCategory, Payment, Project } from '../../lib/types'
import { currencySymbol, todayISO } from '../../lib/format'
import { Button, Input, Label, Modal, Select } from '../../components/ui'

export function ExpenseForm({
  categories,
  projects,
  defaultProjectId,
  onClose,
}: {
  categories: FinanceCategory[]
  projects: Project[]
  defaultProjectId?: string
  onClose: () => void
}) {
  const insert = useInsert<Expense>('expenses')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    insert.mutate(
      {
        amount: amt,
        category_id: categoryId || null,
        project_id: projectId || null,
        spent_on: date,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal title="Add expense" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>Amount ({currencySymbol})</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Project</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
        </label>
        <Button type="submit" disabled={insert.isPending} className="mt-1">
          {insert.isPending ? 'Saving…' : 'Save expense'}
        </Button>
        {insert.isError && <p className="text-[13px] text-neg">{insert.error.message}</p>}
      </form>
    </Modal>
  )
}

export function PaymentForm({
  projects,
  defaultProjectId,
  onClose,
}: {
  projects: Project[]
  defaultProjectId?: string
  onClose: () => void
}) {
  const insert = useInsert<Payment>('payments')
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'awaited' | 'completed'>('awaited')
  const [followUp, setFollowUp] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const [note, setNote] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0 || !counterparty.trim()) return
    insert.mutate(
      {
        counterparty: counterparty.trim(),
        amount: amt,
        status,
        follow_up_on: status === 'awaited' && followUp ? followUp : null,
        received_on: status === 'completed' ? todayISO() : null,
        project_id: projectId || null,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal title="Add payment" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>From whom</Label>
          <Input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="Client, buyer, …"
            autoFocus
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Amount ({currencySymbol})</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </label>
          <label>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as 'awaited' | 'completed')}>
              <option value="awaited">Awaited</option>
              <option value="completed">Completed</option>
            </Select>
          </label>
        </div>
        {status === 'awaited' && (
          <label>
            <Label>Follow up on</Label>
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
        )}
        <label>
          <Label>Project</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          {/* This is what the payment lists lead with, so ask for it plainly. */}
          <Label>What’s this for?</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Site work — phase 2"
          />
        </label>
        <Button type="submit" disabled={insert.isPending} className="mt-1">
          {insert.isPending ? 'Saving…' : 'Save payment'}
        </Button>
        {insert.isError && <p className="text-[13px] text-neg">{insert.error.message}</p>}
      </form>
    </Modal>
  )
}
