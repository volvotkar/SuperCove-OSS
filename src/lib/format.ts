import { CURRENCY, LOCALE } from './config'

/**
 * Money and date formatting.
 *
 * Currency and locale are deploy-time config, not literals — see
 * `src/lib/config.ts`. Formatters are built once at module load because
 * `Intl.NumberFormat` construction is comparatively expensive and these run in
 * list renders.
 */

const moneyFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
})

const moneyFmtMinor = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
})

/** Whole amounts render without decimals; fractional ones keep two. */
export function money(amount: number): string {
  return Number.isInteger(amount) ? moneyFmt.format(amount) : moneyFmtMinor.format(amount)
}

/**
 * Just the symbol ("$", "₹", "€"), for compact input labels like "Amount ($)".
 * Read off a formatted sample rather than hardcoded, so it follows CURRENCY.
 */
export const currencySymbol: string =
  moneyFmt.formatToParts(0).find((p) => p.type === 'currency')?.value ?? CURRENCY

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const dateFmtYear = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "16 Jul" this year, "16 Jul 2025" otherwise. Accepts YYYY-MM-DD. */
export function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.getFullYear() === new Date().getFullYear() ? dateFmt.format(d) : dateFmtYear.format(d)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Timestamptz → the <input type="date"> / <input type="time"> values a person
 * actually typed. Postgres hands back UTC ("2026-08-03T15:30:00+00:00"), so
 * slicing the string shifts the time by the local offset — the reschedule
 * time-shift bug. Always go through Date and read local getters.
 */
export function toLocalDateInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toLocalTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Is this timestamptz on the local calendar day? (not a UTC string compare) */
export function isOnLocalDay(iso: string | null, day = todayISO()): boolean {
  return iso ? toLocalDateInput(iso) === day : false
}

/** Days from today to iso date (negative = overdue). */
export function daysFromToday(iso: string): number {
  const ms = new Date(iso + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000)
}
