export type Project = {
  id: string
  name: string
  archived_at: string | null
}

export type FinanceCategory = {
  id: string
  name: string
}

export type Expense = {
  id: string
  amount: number
  category_id: string | null
  project_id: string | null
  note: string | null
  spent_on: string
}

export type Payment = {
  id: string
  counterparty: string
  amount: number
  status: 'awaited' | 'completed'
  follow_up_on: string | null
  received_on: string | null
  project_id: string | null
  note: string | null
}

export type TodoList = {
  id: string
  section: 'day' | 'week' | 'month' | 'goals' | 'project'
  project_id: string | null
  name: string
  position: number
  /** Day the list is pinned to Today's agenda (null = not pinned). */
  agenda_on: string | null
}

export type Todo = {
  id: string
  list_id: string
  title: string
  done: boolean
  completed_at: string | null
  position: number
  due_on: string | null
  gcal_event_id: string | null
  scheduled_at: string | null
  scheduled_duration_mins: number | null
  created_at: string
  priority: Quadrant | null
  /** Crossed out: postponed/dropped but kept on the list. Not the same as done. */
  cancelled_at: string | null
  /** Day this leftover was last carried forward (keeps created_at honest). */
  carried_on: string | null
}

/** Eisenhower quadrants — labels/colors live in src/lib/matrix.ts */
export type Quadrant = 'do_now' | 'schedule' | 'delegate' | 'skip'

export type TimeLog = {
  id: string
  on_date: string
  start_min: number
  end_min: number
  activity: string
  quadrant: Quadrant | null
}

export type Habit = {
  id: string
  name: string
  position: number
  month: string | null // 'YYYY-MM'; null = ongoing
}

export type HabitCheck = {
  id: string
  habit_id: string
  on_date: string
}

export type KanbanColumn = {
  id: string
  project_id: string
  name: string
  position: number
}

export type KanbanCard = {
  id: string
  column_id: string
  title: string
  note: string | null
  position: number
}

export type Note = {
  id: string
  /** null = Miscellaneous (no project). */
  project_id: string | null
  name: string
  content: string
  position: number
  updated_at: string
}

export type Scrapbook = {
  id: string
  name: string
  project_id: string | null
  updated_at: string
}

/** A block on a scrapbook board. Positions are canvas pixels. */
export type ScrapbookItem = {
  id: string
  scrapbook_id: string
  kind: 'text' | 'heading' | 'image'
  content: string
  attachment_id: string | null
  x: number
  y: number
  w: number
  h: number
  z: number
}

export type Attachment = {
  id: string
  project_id: string | null
  note_id: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number
}

export type InventoryProduct = {
  id: string
  name: string
  cost_per_unit: number
  sale_price: number
  stock_units: number
  /** Free-text tag ("ecom", "retail", …). Descriptive only — nothing keys off it. */
  label: string | null
}

export type InventorySale = {
  id: string
  product_id: string
  buyer: string
  units: number
  unit_price: number
  sold_on: string
  delivered: boolean
  paid: boolean
  payment_id: string | null
}

export type KeyDate = {
  id: string
  title: string
  on_date: string
}

export type Contact = {
  id: string
  name: string
  phone: string | null
  notes: string | null
  last_interaction_on: string | null
}
