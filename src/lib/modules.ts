import {
  BarChart3,
  CalendarDays,
  Flame,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  NotebookText,
  Package,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TableName } from './data'
import { GOOGLE_CALENDAR } from './config'

/**
 * The module registry — the single source of truth for what this app is made of.
 *
 * Every optional feature is declared here once: its route, where it sits in the
 * nav, and which tables it owns. Nav, routing, global search and the Settings
 * toggles all derive from this list, so adding a module means adding one entry,
 * not editing five files. (Same pattern as `matrix.ts` for quadrants.)
 *
 * Turning a module off is not cosmetic: its route is never registered, so its
 * code chunk is never downloaded, and with nothing mounted its tables are never
 * queried. See `useModules.ts`.
 */

export type ModuleId =
  | 'todos'
  | 'calendar'
  | 'notes'
  | 'habits'
  | 'finance'
  | 'projects'
  | 'scrapbook'
  | 'stats'
  | 'inventory'
  | 'contacts'
  | 'review'
  | 'keydates'
  | 'streaks'
  | 'capture'

export type ModuleDef = {
  id: ModuleId
  label: string
  description: string
  icon: LucideIcon
  /** Sidebar/bottom-nav placement. 'none' = a dashboard widget, not a page. */
  nav: 'primary' | 'secondary' | 'none'
  /** Tables this module owns — used to scope global search. */
  tables: TableName[]
  /** Requires deploy-time config to be usable at all. */
  requires?: 'google'
}

/**
 * Order matters: `primary` entries fill the mobile bottom bar left-to-right.
 * Six is the practical cap there — a seventh squeezes the labels.
 */
export const MODULES: ModuleDef[] = [
  {
    id: 'todos',
    label: 'Todos',
    description: 'Day / week / month lists, priorities and carry-over.',
    icon: ListTodo,
    nav: 'primary',
    tables: ['todo_lists', 'todos'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Day agenda and time logging. Google Calendar sync is optional.',
    icon: CalendarDays,
    nav: 'primary',
    tables: ['time_logs'],
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Markdown notes with attachments, across projects.',
    icon: NotebookText,
    nav: 'primary',
    tables: ['notes', 'attachments'],
  },
  {
    id: 'habits',
    label: 'Habits',
    description: 'Month-scoped habit grid and completion heatmap.',
    icon: Flame,
    nav: 'primary',
    tables: ['habits', 'habit_checks'],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Expenses, incoming payments and follow-ups.',
    icon: Wallet,
    nav: 'primary',
    tables: ['expenses', 'payments', 'finance_categories'],
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Kanban boards, per-project notes, files and spend.',
    icon: FolderKanban,
    nav: 'none',
    tables: ['projects', 'kanban_columns', 'kanban_cards'],
  },
  {
    id: 'scrapbook',
    label: 'Scrapbook',
    description: 'Free-form boards of draggable images and text.',
    icon: LayoutDashboard,
    nav: 'secondary',
    tables: ['scrapbooks', 'scrapbook_items'],
  },
  {
    id: 'stats',
    label: 'Stats',
    description: 'Charts across time, tasks and money.',
    icon: BarChart3,
    nav: 'secondary',
    tables: [],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Products, stock and sales, wired into the finance ledger.',
    icon: Package,
    nav: 'secondary',
    tables: ['inventory_products', 'inventory_sales'],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    description: 'Lightweight people lookup — not a CRM.',
    icon: Users,
    nav: 'secondary',
    tables: ['contacts'],
  },
  {
    id: 'review',
    label: 'Weekly Review',
    description: 'A weekly prompt to look back and plan forward.',
    icon: NotebookPen,
    nav: 'secondary',
    tables: ['weekly_reviews'],
  },
  {
    id: 'keydates',
    label: 'Key Dates',
    description: 'Countdown widget on the dashboard.',
    icon: CalendarDays,
    nav: 'none',
    tables: ['key_dates'],
  },
  {
    id: 'streaks',
    label: 'Streaks',
    description: 'Daily check widget on the dashboard.',
    icon: Flame,
    nav: 'none',
    tables: [],
  },
  {
    id: 'capture',
    label: 'Quick Capture',
    description: 'Inbox bar on the dashboard for anything uncategorised.',
    icon: ListTodo,
    nav: 'none',
    tables: ['inbox_items'],
  },
]

export const MODULE_BY_ID: Record<ModuleId, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDef>

export const ALL_MODULE_IDS: ModuleId[] = MODULES.map((m) => m.id)

/**
 * Modules whose config prerequisites aren't met can't be enabled at all — the
 * toggle shows them greyed with a pointer to the relevant doc. Calendar itself
 * works without Google (local time logging); only the *sync* needs it, so
 * nothing is blocked here today. Kept as the hook for future integrations.
 */
export function isAvailable(m: ModuleDef): boolean {
  return m.requires === 'google' ? GOOGLE_CALENDAR : true
}
