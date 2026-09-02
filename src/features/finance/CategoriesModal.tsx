import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../../lib/data'
import type { FinanceCategory } from '../../lib/types'
import { Button, Input, Modal } from '../../components/ui'

/** Add / rename / delete expense categories. Deleting keeps the expenses —
 *  they just lose the tag (FK is on delete set null). */
export function CategoriesModal({ onClose }: { onClose: () => void }) {
  const { data: categories = [] } = useRows<FinanceCategory>('finance_categories', { column: 'name' })
  const insert = useInsert<FinanceCategory>('finance_categories')
  const [name, setName] = useState('')

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insert.mutate({ name: name.trim() }, { onSuccess: () => setName('') })
  }

  return (
    <Modal title="Categories" onClose={onClose}>
      <ul className="flex flex-col gap-1">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
        {categories.length === 0 && (
          <li className="py-3 text-center text-[13px] text-ink-faint">No categories yet.</li>
        )}
      </ul>

      <form onSubmit={add} className="mt-3 flex gap-2 border-t border-line pt-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category…"
        />
        <Button type="submit" disabled={!name.trim() || insert.isPending}>
          <Plus size={15} /> Add
        </Button>
      </form>
      {insert.isError && <p className="mt-2 text-[13px] text-neg">{insert.error.message}</p>}
      <p className="mt-3 text-[12px] text-ink-faint">
        Deleting a category keeps its expenses — they just lose the tag.
      </p>
    </Modal>
  )
}

function CategoryRow({ category }: { category: FinanceCategory }) {
  const update = useUpdate<FinanceCategory>('finance_categories')
  const del = useDelete('finance_categories')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(category.name)

  function save(e?: React.FormEvent) {
    e?.preventDefault()
    const next = draft.trim()
    if (!next || next === category.name) {
      setEditing(false)
      setDraft(category.name)
      return
    }
    update.mutate({ id: category.id, patch: { name: next } }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={save} className="flex items-center gap-1.5">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus className="py-1.5" />
          <button
            type="submit"
            title="Save"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-pos hover:bg-pos-soft"
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            title="Cancel"
            onClick={() => {
              setEditing(false)
              setDraft(category.name)
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken"
          >
            <X size={15} />
          </button>
        </form>
        {update.isError && <p className="mt-1 text-[12.5px] text-neg">{update.error.message}</p>}
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-2 rounded-field px-2 py-1.5 hover:bg-sunken">
      <span className="min-w-0 flex-1 truncate text-[14px]">{category.name}</span>
      <button
        type="button"
        title="Rename"
        onClick={() => setEditing(true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-sunken hover:text-ink sm:group-hover:opacity-100"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        title="Delete category"
        onClick={() => {
          if (window.confirm(`Delete “${category.name}”? Its expenses keep their records but lose this tag.`))
            del.mutate(category.id)
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}
