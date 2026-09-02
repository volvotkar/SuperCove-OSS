import type { Quadrant } from './types'

/**
 * The urgency × importance matrix, defined once for the task picker, the
 * time logger, and every chart. `null` everywhere means None (life stuff —
 * sleep, chores — or simply unsorted).
 */

export const QUADRANTS: Quadrant[] = ['do_now', 'schedule', 'delegate', 'skip']

/**
 * Colors come from the --mx-* CSS vars in index.css — a categorical palette
 * validated per theme with the dataviz six-checks script. Identity is stable
 * across light/dark (schedule is always blue, etc.).
 */
export const QUADRANT_META: Record<Quadrant, { label: string; hint: string; varName: string }> = {
  do_now: { label: 'Do now', hint: 'Urgent and important', varName: '--mx-do-now' },
  schedule: { label: 'Schedule', hint: 'Important, not urgent', varName: '--mx-schedule' },
  delegate: { label: 'Delegate', hint: 'Urgent, not important', varName: '--mx-delegate' },
  skip: { label: 'Skip', hint: 'Neither — do last or drop', varName: '--mx-skip' },
}

export const NONE_META = { label: 'None', hint: 'Life / unsorted', varName: '--mx-none' }

/**
 * Retrospective labels — the time logger records what already happened, so it
 * asks the two underlying questions instead of using action verbs.
 * Same enum values, same colors; only the framing differs.
 */
export const RETRO_META: Record<Quadrant, { label: string; short: string }> = {
  do_now: { label: 'Important and Urgent', short: 'Important and Urgent' },
  schedule: { label: 'Important but not Urgent', short: 'Important, not Urgent' },
  delegate: { label: 'Urgent but not Important', short: 'Urgent, not Important' },
  skip: { label: 'Neither Important nor Urgent', short: 'Neither' },
}

/** Soft, color-coded background for a quadrant chip (or None). */
export function quadrantSoft(q: Quadrant | null): string {
  return `color-mix(in oklab, ${quadrantColor(q)} 16%, transparent)`
}

/** Label for the null bucket in retrospective views. */
export const RETRO_NONE = { label: 'Life — sleep, chores, rest', short: 'Life' }

export function quadrantLabel(q: Quadrant | null): string {
  return q ? QUADRANT_META[q].label : NONE_META.label
}

/** CSS color for a quadrant (or None) — resolves via CSS vars so themes work. */
export function quadrantColor(q: Quadrant | null): string {
  return `var(${q ? QUADRANT_META[q].varName : NONE_META.varName})`
}

/** Sort weight: Do now first, then Schedule, Delegate, None, Skip last. */
export function quadrantWeight(q: Quadrant | null): number {
  if (q === 'do_now') return 0
  if (q === 'schedule') return 1
  if (q === 'delegate') return 2
  if (q === null) return 3
  return 4
}
