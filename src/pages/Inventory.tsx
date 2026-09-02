import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Package, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import type { InventoryProduct, InventorySale } from '../lib/types'
import { currencySymbol, money, shortDate, todayISO } from '../lib/format'
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select } from '../components/ui'

export function Inventory() {
  const { data: products = [] } = useRows<InventoryProduct>('inventory_products', { column: 'name' })
  const { data: sales = [] } = useRows<InventorySale>('inventory_sales', { column: 'sold_on', ascending: false })
  const [adding, setAdding] = useState<'product' | 'sale' | null>(null)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)

  const stats = useMemo(() => {
    const stockValue = products.reduce((s, p) => s + p.stock_units * Number(p.cost_per_unit), 0)
    const undelivered = sales.filter((s) => !s.delivered).reduce((n, s) => n + s.units, 0)
    const unpaidValue = sales
      .filter((s) => !s.paid)
      .reduce((n, s) => n + s.units * Number(s.unit_price), 0)
    return { stockValue, undelivered, unpaidValue }
  }, [products, sales])

  return (
    <div>
      <PageHeader
        title="Inventory"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAdding('product')}>
              <Package size={15} /> Product
            </Button>
            <Button onClick={() => setAdding('sale')} disabled={products.length === 0}>
              <Plus size={15} /> Sale
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Stock value (at cost)" value={money(stats.stockValue)} />
        <StatCard label="Units to deliver" value={String(stats.undelivered)} />
        <StatCard label="Unpaid sales" value={money(stats.unpaidValue)} />
      </div>

      {/* Products */}
      <section className="mt-8">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Products
        </h2>
        {products.length === 0 ? (
          <EmptyState>No products yet — add your first product to start.</EmptyState>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5 text-right">In stock</th>
                    <th className="px-4 py-2.5 text-right">Cost/unit</th>
                    <th className="px-4 py-2.5 text-right">Sale price</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {products.map((p) => (
                    <ProductRow key={p.id} p={p} onEdit={setEditingProduct} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Sales */}
      <section className="mt-8">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Sales
        </h2>
        {sales.length === 0 ? (
          <EmptyState>
            No sales logged. A sale updates stock and creates its Finance entry automatically.
          </EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {sales.map((s) => (
                <SaleRow key={s.id} sale={s} product={products.find((p) => p.id === s.product_id)} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {adding === 'product' && <ProductForm onClose={() => setAdding(null)} />}
      {editingProduct && (
        <ProductForm product={editingProduct} onClose={() => setEditingProduct(null)} />
      )}
      {adding === 'sale' && <SaleForm products={products} onClose={() => setAdding(null)} />}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[12.5px] font-medium text-ink-muted">{label}</div>
      <div className="tnum mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
    </Card>
  )
}

function ProductRow({ p, onEdit }: { p: InventoryProduct; onEdit: (p: InventoryProduct) => void }) {
  const del = useDelete('inventory_products')
  return (
    <tr className="group">
      <td className="px-4 py-3 font-medium">
        <span className="flex flex-wrap items-center gap-1.5">
          {p.name}
          {p.label && (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
              {p.label}
            </span>
          )}
        </span>
      </td>
      <td
        className={`tnum px-4 py-3 text-right font-semibold ${
          p.stock_units === 0 ? 'text-neg' : p.stock_units <= 5 ? 'text-awaited' : ''
        }`}
      >
        {p.stock_units}
      </td>
      <td className="tnum px-4 py-3 text-right text-ink-muted">{money(Number(p.cost_per_unit))}</td>
      <td className="tnum px-4 py-3 text-right text-ink-muted">{money(Number(p.sale_price))}</td>
      <td className="px-2 py-3">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            title="Edit product"
            onClick={() => onEdit(p)}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-all hover:bg-sunken hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            title="Delete product"
            onClick={() => {
              if (window.confirm(`Delete “${p.name}” and its sales history?`)) del.mutate(p.id)
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-all hover:bg-neg-soft hover:text-neg sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function SaleRow({ sale, product }: { sale: InventorySale; product?: InventoryProduct }) {
  const update = useUpdate<InventorySale>('inventory_sales')
  const del = useDelete('inventory_sales')
  const qc = useQueryClient()
  const value = sale.units * Number(sale.unit_price)
  // DB triggers touch payments (paid toggle) and product stock (delete) —
  // refresh those caches alongside the sale row.
  const syncPayments = () => qc.invalidateQueries({ queryKey: ['payments'] })
  const syncProducts = () => qc.invalidateQueries({ queryKey: ['inventory_products'] })

  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">
          {product?.name ?? '?'} × {sale.units}
          <span className="ml-2 font-normal text-ink-muted">→ {sale.buyer}</span>
        </div>
        <div className="text-[12.5px] text-ink-faint">{shortDate(sale.sold_on)}</div>
      </div>
      <span className="tnum text-[14px] font-semibold">{money(value)}</span>

      {/* Delivered / Paid state chips — click to toggle */}
      <button
        type="button"
        onClick={() => update.mutate({ id: sale.id, patch: { delivered: !sale.delivered } })}
        title={sale.delivered ? 'Delivered — click to undo' : 'Mark delivered'}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold transition-colors ${
          sale.delivered ? 'bg-pos-soft text-pos' : 'bg-sunken text-ink-faint hover:text-ink'
        }`}
      >
        <Truck size={11} /> {sale.delivered ? 'Delivered' : 'To deliver'}
      </button>
      <button
        type="button"
        onClick={() =>
          update.mutate({ id: sale.id, patch: { paid: !sale.paid } }, { onSuccess: syncPayments })
        }
        title={sale.paid ? 'Paid — click to undo' : 'Mark paid (updates Finance)'}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold transition-colors ${
          sale.paid ? 'bg-pos-soft text-pos' : 'bg-awaited-soft text-awaited'
        }`}
      >
        <Check size={11} /> {sale.paid ? 'Paid' : 'Awaited'}
      </button>

      <button
        type="button"
        title="Delete sale (restores stock; keeps the payment record)"
        onClick={() => {
          if (window.confirm('Delete this sale? Stock is restored; the Finance entry stays.'))
            del.mutate(sale.id, { onSuccess: syncProducts })
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

/**
 * Add or edit a product. Editing a product fires no DB triggers (all three
 * live on `inventory_sales`), so this is a plain update — but the table has
 * `unique (owner_id, name)` and three `check >= 0` constraints, so errors must
 * be shown rather than swallowed.
 */
function ProductForm({
  product,
  onClose,
}: {
  product?: InventoryProduct | null
  onClose: () => void
}) {
  const editing = !!product
  const insert = useInsert<InventoryProduct>('inventory_products')
  const update = useUpdate<InventoryProduct>('inventory_products')
  const mutation = editing ? update : insert

  const [name, setName] = useState(product?.name ?? '')
  const [label, setLabel] = useState(product?.label ?? '')
  const [cost, setCost] = useState(product ? String(product.cost_per_unit) : '')
  const [price, setPrice] = useState(product ? String(product.sale_price) : '')
  const [stock, setStock] = useState(product ? String(product.stock_units) : '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const patch = {
      name: name.trim(),
      label: label.trim() || null,
      cost_per_unit: Number(cost) || 0,
      sale_price: Number(price) || 0,
      stock_units: Number(stock) || 0,
    }
    if (editing) update.mutate({ id: product.id, patch }, { onSuccess: onClose })
    else insert.mutate(patch, { onSuccess: onClose })
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. ecom, retail — optional"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <Label>Cost/unit ({currencySymbol})</Label>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </label>
          <label>
            <Label>Sale price ({currencySymbol})</Label>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </label>
          <label>
            <Label>In stock</Label>
            <Input type="number" inputMode="numeric" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
          </label>
        </div>
        {editing && (
          <p className="rounded-field bg-sunken px-3 py-2 text-[12.5px] text-ink-muted">
            Stock is a running count — editing it sets the number directly and doesn’t recalculate
            from sales. Renaming leaves past payment records as they were recorded.
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save product'}
        </Button>
        {mutation.isError && <p className="text-[13px] text-neg">{mutation.error.message}</p>}
      </form>
    </Modal>
  )
}

function SaleForm({ products, onClose }: { products: InventoryProduct[]; onClose: () => void }) {
  const insert = useInsert<InventorySale>('inventory_sales')
  const qc = useQueryClient()
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [buyer, setBuyer] = useState('')
  const [units, setUnits] = useState('1')
  const [unitPrice, setUnitPrice] = useState<string | null>(null)
  const [soldOn, setSoldOn] = useState(todayISO())
  const [delivered, setDelivered] = useState(false)
  const [paid, setPaid] = useState(false)

  const product = products.find((p) => p.id === productId)
  const effectivePrice = unitPrice ?? String(product?.sale_price ?? '')
  const n = Number(units) || 0
  const overStock = product ? n > product.stock_units : false

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!product || !buyer.trim() || n <= 0 || overStock) return
    insert.mutate(
      {
        product_id: product.id,
        buyer: buyer.trim(),
        units: n,
        unit_price: Number(effectivePrice) || 0,
        sold_on: soldOn,
        delivered,
        paid,
      },
      {
        onSuccess: () => {
          // The DB trigger decremented stock and created the payment row.
          qc.invalidateQueries({ queryKey: ['inventory_products'] })
          qc.invalidateQueries({ queryKey: ['payments'] })
          onClose()
        },
      },
    )
  }

  return (
    <Modal title="Log sale" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>Product</Label>
          <Select value={productId} onChange={(e) => { setProductId(e.target.value); setUnitPrice(null) }}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stock_units} in stock)
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Buyer</Label>
          <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} autoFocus required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Units</Label>
            <Input type="number" inputMode="numeric" min="1" step="1" value={units} onChange={(e) => setUnits(e.target.value)} required />
          </label>
          <label>
            <Label>Price/unit ({currencySymbol})</Label>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={effectivePrice} onChange={(e) => setUnitPrice(e.target.value)} required />
          </label>
        </div>
        {overStock && (
          <p className="text-[13px] text-neg">
            Only {product?.stock_units} in stock — can’t sell {n}.
          </p>
        )}
        <label>
          <Label>Date</Label>
          <Input type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} required />
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} className="h-4 w-4 accent-[var(--tide)]" />
            Delivered
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[var(--tide)]" />
            Paid
          </label>
        </div>
        <p className="text-[12.5px] text-ink-faint">
          Saving creates the matching Finance entry ({paid ? 'completed' : 'awaited'}) and updates stock.
        </p>
        <Button type="submit" disabled={insert.isPending || overStock} className="mt-1">
          {insert.isPending ? 'Saving…' : `Log sale — ${money(n * (Number(effectivePrice) || 0))}`}
        </Button>
        {insert.isError && <p className="text-[13px] text-neg">{insert.error.message}</p>}
      </form>
    </Modal>
  )
}
