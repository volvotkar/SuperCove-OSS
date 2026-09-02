import { Home } from 'lucide-react'
import { MODULES, type ModuleDef } from '../lib/modules'
import { useEnabledModules } from '../lib/useModules'

/**
 * Nav entries derive from the module registry, so enabling or disabling a module
 * updates the sidebar and bottom bar with no second list to maintain.
 *
 * `primary` fills the mobile bottom bar — six is the practical cap before the
 * labels squeeze, and Home always takes one of those slots. `secondary` is
 * sidebar-only: still first-class pages, just less daily.
 */

export type NavItem = { to: string; label: string; icon: ModuleDef['icon'] }

/** The dashboard isn't a module — it can't be switched off. */
export const HOME: NavItem = { to: '/', label: 'Today', icon: Home }

function toNav(m: ModuleDef): NavItem {
  return { to: `/${m.id}`, label: m.label, icon: m.icon }
}

/** Home + enabled primary modules, capped so the mobile bar stays readable. */
export function usePrimaryNav(limit = 6): NavItem[] {
  const enabled = useEnabledModules()
  const items = MODULES.filter((m) => m.nav === 'primary' && enabled.has(m.id)).map(toNav)
  return [HOME, ...items].slice(0, limit)
}

/** Everything primary (uncapped) plus secondary — the sidebar shows it all. */
export function useSidebarNav(): NavItem[] {
  const enabled = useEnabledModules()
  const primary = MODULES.filter((m) => m.nav === 'primary' && enabled.has(m.id)).map(toNav)
  const secondary = MODULES.filter((m) => m.nav === 'secondary' && enabled.has(m.id)).map(toNav)
  return [HOME, ...primary, ...secondary]
}
