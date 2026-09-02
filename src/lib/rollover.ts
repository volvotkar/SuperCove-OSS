import type { Todo, TodoList } from './types'
import { todayISO } from './format'

/**
 * Day-list rollover: an open task in ANY Day list that hasn't been touched
 * since before today is a leftover.
 *
 * Deliberately independent of the agenda pin. Gating this on `agenda_on ===
 * today` (as it briefly was) meant that when a pin expired overnight the
 * leftover banner vanished at exactly the moment those tasks became
 * leftovers — the two features cancelled each other out every morning.
 */
export function isLeftover(todo: Todo, dayListIds: Set<string>): boolean {
  return dayListIds.has(todo.list_id) && isActive(todo) && lastTouchedDay(todo) < todayISO()
}

/** The later of "created" and "last carried forward". */
function lastTouchedDay(todo: Todo): string {
  const created = todo.created_at.slice(0, 10)
  return todo.carried_on && todo.carried_on > created ? todo.carried_on : created
}

/** Every Day-section list, pinned or not. */
export function dayListIdSet(lists: TodoList[]): Set<string> {
  return new Set(lists.filter((l) => l.section === 'day').map((l) => l.id))
}

/** Day lists the user has pinned to today. Membership alone is not enough. */
export function agendaListIdSet(lists: TodoList[], day = todayISO()): Set<string> {
  return new Set(
    lists.filter((l) => l.section === 'day' && l.agenda_on === day).map((l) => l.id),
  )
}

/** Open: neither ticked off nor crossed out. */
export function isActive(todo: Todo): boolean {
  return !todo.done && !todo.cancelled_at
}
