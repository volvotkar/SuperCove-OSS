import { NavLink } from 'react-router-dom'
import { usePrimaryNav } from './nav'

// Phone-first navigation for mid-site-visit use.
export function BottomNav() {
  const nav = usePrimaryNav()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${
              isActive ? 'text-tide' : 'text-ink-faint'
            }`
          }
        >
          <Icon size={20} strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
