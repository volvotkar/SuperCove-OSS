import { useMemo, useState } from 'react'
import { Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import type { Contact } from '../lib/types'
import { shortDate, todayISO } from '../lib/format'
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader } from '../components/ui'

export function Contacts() {
  const { data: contacts = [] } = useRows<Contact>('contacts', { column: 'name' })
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.notes?.toLowerCase().includes(q),
    )
  }, [contacts, query])

  return (
    <div>
      <PageHeader
        title="Contacts"
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus size={15} /> Contact
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, number, notes…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          {contacts.length === 0
            ? 'No contacts yet — mentors, suppliers, key people.'
            : 'Nothing matches that search.'}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {filtered.map((c) => (
              <ContactRow key={c.id} c={c} onEdit={() => setEditing(c)} />
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <ContactForm contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function ContactRow({ c, onEdit }: { c: Contact; onEdit: () => void }) {
  const del = useDelete('contacts')
  const update = useUpdate<Contact>('contacts')

  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tide-soft text-[13px] font-semibold text-tide">
        {c.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{c.name}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-faint">
          {[c.phone, c.notes].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          update.mutate({ id: c.id, patch: { last_interaction_on: todayISO() } })
        }
        title="Mark interaction today"
        className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-[11.5px] font-medium text-ink-muted transition-colors hover:bg-tide-soft hover:text-tide"
      >
        {c.last_interaction_on ? `last: ${shortDate(c.last_interaction_on)}` : 'log touch'}
      </button>
      {c.phone && (
        <a
          href={`tel:${c.phone}`}
          title="Call"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-pos-soft hover:text-pos"
        >
          <Phone size={14} />
        </a>
      )}
      <button
        type="button"
        title="Edit"
        onClick={onEdit}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-sunken sm:group-hover:opacity-100"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        title="Delete"
        onClick={() => del.mutate(c.id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

function ContactForm({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const insert = useInsert<Contact>('contacts')
  const update = useUpdate<Contact>('contacts')
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')

  const busy = insert.isPending || update.isPending
  const err = insert.error || update.error

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const row = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null }
    if (contact) update.mutate({ id: contact.id, patch: row }, { onSuccess: onClose })
    else insert.mutate(row, { onSuccess: onClose })
  }

  return (
    <Modal title={contact ? 'Edit contact' : 'New contact'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          <Label>Phone</Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          <Label>Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who they are, what they supply…"
          />
        </label>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? 'Saving…' : 'Save contact'}
        </Button>
        {err && <p className="text-[13px] text-neg">{err.message}</p>}
      </form>
    </Modal>
  )
}
