import { useSyncExternalStore } from 'react'
import { ALL_MODULE_IDS, MODULES, isAvailable, type ModuleId } from './modules'

/**
 * Which modules this install has switched on.
 *
 * Stored in localStorage rather than the database on purpose: it must be
 * readable synchronously before first paint (the nav and routes are built from
 * it), it has to work offline, and it needs no migration. The trade-off is that
 * it's per-device — reinstalling the PWA returns to defaults.
 *
 * We persist the *disabled* set, not the enabled one, so modules added by a
 * future release default to on instead of silently staying hidden.
 */

const KEY = 'sc-modules'

function readDisabled(): Set<ModuleId> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    // Drop ids that no longer exist, so a renamed module can't disable nothing forever.
    return new Set(parsed.filter((id): id is ModuleId => ALL_MODULE_IDS.includes(id as ModuleId)))
  } catch {
    return new Set()
  }
}

let disabled = readDisabled()
const listeners = new Set<() => void>()

/** Recomputed only on change, so useSyncExternalStore gets a stable snapshot. */
let snapshot: ReadonlySet<ModuleId> = computeEnabled()

function computeEnabled(): ReadonlySet<ModuleId> {
  return new Set(
    MODULES.filter((m) => isAvailable(m) && !disabled.has(m.id)).map((m) => m.id),
  )
}

function emit() {
  snapshot = computeEnabled()
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): ReadonlySet<ModuleId> {
  return snapshot
}

/** The set of enabled module ids. Re-renders subscribers on change. */
export function useEnabledModules(): ReadonlySet<ModuleId> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Convenience for a single module — `if (!on) return null`. */
export function useModuleEnabled(id: ModuleId): boolean {
  return useEnabledModules().has(id)
}

export function setModuleEnabled(id: ModuleId, enabled: boolean) {
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...disabled]))
  } catch {
    // Private-mode storage can throw; keep the in-memory change so the UI still responds.
  }
  emit()
}

/** Non-reactive read, for module-scoped code outside React. */
export function isModuleEnabled(id: ModuleId): boolean {
  return snapshot.has(id)
}

/** Test/reset helper — also used by the "reset to defaults" affordance. */
export function resetModules() {
  disabled = new Set()
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  emit()
}
